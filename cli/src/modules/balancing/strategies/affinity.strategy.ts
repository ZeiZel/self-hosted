import { Injectable } from '@nestjs/common';
import { BaseStrategy } from './base.strategy';
import {
  NodeState,
  PlacementDecision,
  PlacementConstraint,
  BalancingStrategy,
  getServiceRoleRequirements,
  findAffinityGroup,
} from '../../../interfaces/placement.interface';
import { Service, SERVICE_DEPENDENCIES } from '../../../interfaces/service.interface';

/**
 * Affinity strategy: co-locate related services on same nodes
 * Groups related services together for better performance and communication
 */
@Injectable()
export class AffinityStrategy extends BaseStrategy {
  readonly name = BalancingStrategy.AFFINITY;
  readonly description = 'Co-locate related services on same nodes';

  execute(
    services: Service[],
    nodes: NodeState[],
    constraints: PlacementConstraint[],
  ): PlacementDecision[] {
    const decisions: PlacementDecision[] = [];
    const workingNodes = nodes.map((n) => ({ ...n, services: [...n.services] }));

    // Group services by affinity
    const affinityGroups = this.groupServicesByAffinity(services);

    // Process each affinity group together
    for (const [groupName, groupServices] of affinityGroups) {
      // Sort group by memory descending
      const sortedGroup = this.sortServices(groupServices);

      // Find best node for the entire group
      const groupNode = this.findBestNodeForGroup(
        sortedGroup,
        workingNodes,
        constraints,
      );

      if (groupNode) {
        for (const service of sortedGroup) {
          const eligibleNodes = this.getEligibleNodes(service, workingNodes, constraints);

          // Prefer the group node if it's eligible
          let targetNode = eligibleNodes.find((n) => n.label === groupNode.label);

          // Fallback to any eligible node
          if (!targetNode) {
            const preferredRoles = getServiceRoleRequirements(service.name);
            const roleMatching = this.filterByRolePreference(eligibleNodes, preferredRoles);
            targetNode = roleMatching[0] || eligibleNodes[0];
          }

          if (targetNode) {
            const score = this.calculateScore(service, targetNode, constraints);
            const decision = this.createDecision(
              service,
              targetNode,
              targetNode.label === groupNode.label
                ? `Affinity group: ${groupName}`
                : `Fallback from affinity group: ${groupName}`,
              score,
            );
            decisions.push(decision);
            this.allocateOnNode(targetNode, service);
          }
        }
      }
    }

    return decisions;
  }

  /**
   * Group services by their affinity group or dependencies
   */
  private groupServicesByAffinity(services: Service[]): Map<string, Service[]> {
    const groups = new Map<string, Service[]>();
    const ungrouped: Service[] = [];

    for (const service of services) {
      const groupName = findAffinityGroup(service.name);

      if (groupName) {
        if (!groups.has(groupName)) {
          groups.set(groupName, []);
        }
        groups.get(groupName)!.push(service);
      } else {
        // Check if service depends on something already grouped
        const deps = SERVICE_DEPENDENCIES[service.name] || [];
        let foundGroup = false;

        for (const dep of deps) {
          const depName = dep.split('/')[1] || dep;
          for (const [gName, gServices] of groups) {
            if (gServices.some((s) => s.name === depName)) {
              groups.get(gName)!.push(service);
              foundGroup = true;
              break;
            }
          }
          if (foundGroup) break;
        }

        if (!foundGroup) {
          ungrouped.push(service);
        }
      }
    }

    // Put ungrouped services in their own groups by namespace
    for (const service of ungrouped) {
      const nsGroup = `ns:${service.namespace}`;
      if (!groups.has(nsGroup)) {
        groups.set(nsGroup, []);
      }
      groups.get(nsGroup)!.push(service);
    }

    return groups;
  }

  /**
   * Find the best node to host an entire affinity group
   */
  private findBestNodeForGroup(
    groupServices: Service[],
    nodes: NodeState[],
    constraints: PlacementConstraint[],
  ): NodeState | null {
    // Calculate total resources needed for the group
    let totalCpu = 0;
    let totalMemory = 0;

    for (const service of groupServices) {
      const eligible = this.getEligibleNodes(service, nodes, constraints);
      if (eligible.length === 0) {
        // If any service can't be placed, group placement fails
        continue;
      }
      const decision = this.calculateScore(service, eligible[0], constraints);
      if (decision >= 0) {
        totalCpu += parseInt(service.config.resources.cpu.replace('m', '')) || 0;
        const memStr = service.config.resources.memory;
        const memVal = parseInt(memStr.replace(/[^\d]/g, ''));
        totalMemory += memStr.includes('Gi') ? memVal * 1024 * 1024 * 1024 : memVal * 1024 * 1024;
      }
    }

    // Find nodes that can accommodate the entire group
    const capableNodes = nodes.filter((n) => {
      const available = {
        cpu: n.totalCpu - n.allocatedCpu,
        memory: n.totalMemory - n.allocatedMemory,
      };
      return available.cpu >= totalCpu && available.memory >= totalMemory;
    });

    if (capableNodes.length === 0) {
      // Fallback: return node with most available resources
      return nodes.reduce((best, node) => {
        const bestAvail = best.totalMemory - best.allocatedMemory;
        const nodeAvail = node.totalMemory - node.allocatedMemory;
        return nodeAvail > bestAvail ? node : best;
      }, nodes[0]);
    }

    // Prefer nodes that already have related services
    const groupServiceNames = new Set(groupServices.map((s) => s.name));

    return capableNodes.reduce((best, node) => {
      const bestRelated = best.services.filter((s) => groupServiceNames.has(s)).length;
      const nodeRelated = node.services.filter((s) => groupServiceNames.has(s)).length;

      if (nodeRelated > bestRelated) return node;
      if (nodeRelated < bestRelated) return best;

      // Tie-breaker: more available resources
      const bestAvail = best.totalMemory - best.allocatedMemory;
      const nodeAvail = node.totalMemory - node.allocatedMemory;
      return nodeAvail > bestAvail ? node : best;
    }, capableNodes[0]);
  }
}
