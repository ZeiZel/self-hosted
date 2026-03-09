import { Injectable } from '@nestjs/common';
import { BaseStrategy } from './base.strategy';
import {
  NodeState,
  PlacementDecision,
  PlacementConstraint,
  BalancingStrategy,
  getServiceRoleRequirements,
} from '../../../interfaces/placement.interface';
import { Service } from '../../../interfaces/service.interface';

/**
 * Bin-packing strategy: minimize the number of nodes used
 * Packs services tightly onto nodes, preferring nodes that already have allocations
 */
@Injectable()
export class BinPackingStrategy extends BaseStrategy {
  readonly name = BalancingStrategy.BIN_PACKING;
  readonly description = 'Minimize node count by packing services tightly';

  execute(
    services: Service[],
    nodes: NodeState[],
    constraints: PlacementConstraint[],
  ): PlacementDecision[] {
    const decisions: PlacementDecision[] = [];
    const workingNodes = nodes.map((n) => ({ ...n, services: [...n.services] }));

    // Sort services by memory descending (largest first)
    const sortedServices = this.sortServices(services);

    for (const service of sortedServices) {
      const eligibleNodes = this.getEligibleNodes(service, workingNodes, constraints);

      if (eligibleNodes.length === 0) {
        continue; // Cannot place this service
      }

      // Get preferred roles for this service
      const preferredRoles = getServiceRoleRequirements(service.name);
      const roleMatchingNodes = this.filterByRolePreference(eligibleNodes, preferredRoles);

      // Sort by utilization (prefer more filled nodes - bin packing)
      // and then by available resources within role-matching nodes
      const sortedNodes = roleMatchingNodes.sort((a, b) => {
        // Calculate utilization (higher = more packed)
        const aUtil = a.allocatedMemory / (a.totalMemory || 1);
        const bUtil = b.allocatedMemory / (b.totalMemory || 1);

        // Prefer more utilized nodes (pack tightly)
        // but only if they can still accommodate the service
        return bUtil - aUtil;
      });

      const targetNode = sortedNodes[0];

      if (targetNode) {
        const score = this.calculateScore(service, targetNode, constraints);
        const decision = this.createDecision(
          service,
          targetNode,
          this.getPlacementReason(service, targetNode, preferredRoles),
          score,
        );
        decisions.push(decision);
        this.allocateOnNode(targetNode, service);
      }
    }

    return decisions;
  }

  private getPlacementReason(
    service: Service,
    node: NodeState,
    preferredRoles: string[],
  ): string {
    const utilization = Math.round(
      ((node.allocatedMemory) / (node.totalMemory || 1)) * 100,
    );

    if (['traefik', 'pangolin'].includes(service.name)) {
      return 'Gateway/ingress service';
    }
    if (['vault', 'consul', 'authentik', 'cert-manager'].includes(service.name)) {
      return 'Core service on master';
    }
    if (preferredRoles.some((r) => node.roles.includes(r as any))) {
      return `Role match, node ${utilization}% utilized`;
    }
    return `Bin-packed, node ${utilization}% utilized`;
  }
}
