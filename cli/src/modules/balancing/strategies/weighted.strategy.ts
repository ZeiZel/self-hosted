import { Injectable } from '@nestjs/common';
import { BaseStrategy } from './base.strategy';
import {
  NodeState,
  PlacementDecision,
  PlacementConstraint,
  BalancingStrategy,
  getServiceRoleRequirements,
  getUtilization,
} from '../../../interfaces/placement.interface';
import { Service } from '../../../interfaces/service.interface';

/**
 * Weighted strategy: allocate proportionally to node capacity
 * Larger/more capable nodes get proportionally more services
 */
@Injectable()
export class WeightedStrategy extends BaseStrategy {
  readonly name = BalancingStrategy.WEIGHTED;
  readonly description = 'Allocate proportionally to node capacity';

  execute(
    services: Service[],
    nodes: NodeState[],
    constraints: PlacementConstraint[],
  ): PlacementDecision[] {
    const decisions: PlacementDecision[] = [];
    const workingNodes = nodes.map((n) => ({ ...n, services: [...n.services] }));

    // Calculate weights based on total resources
    const totalClusterMemory = workingNodes.reduce((sum, n) => sum + n.totalMemory, 0);
    const nodeWeights = new Map<string, number>();

    for (const node of workingNodes) {
      // Weight is percentage of cluster resources (0-100)
      const weight = node.weight ?? Math.round((node.totalMemory / totalClusterMemory) * 100);
      nodeWeights.set(node.label, weight);
    }

    // Sort services by memory descending
    const sortedServices = this.sortServices(services);

    for (const service of sortedServices) {
      const eligibleNodes = this.getEligibleNodes(service, workingNodes, constraints);

      if (eligibleNodes.length === 0) {
        continue;
      }

      // Get preferred roles
      const preferredRoles = getServiceRoleRequirements(service.name);
      let candidateNodes = this.filterByRolePreference(eligibleNodes, preferredRoles);

      // Sort by weighted score:
      // Prefer nodes where current utilization is below their weight proportion
      candidateNodes = candidateNodes.sort((a, b) => {
        const aWeight = nodeWeights.get(a.label) || 50;
        const bWeight = nodeWeights.get(b.label) || 50;

        // Calculate how much "budget" each node has remaining
        // A node with 60% weight should ideally handle 60% of cluster load
        const aUtilization = getUtilization(a.allocatedMemory, a.totalMemory);
        const bUtilization = getUtilization(b.allocatedMemory, b.totalMemory);

        // Score = weight - utilization (higher = more available "budget")
        const aBudget = aWeight - aUtilization;
        const bBudget = bWeight - bUtilization;

        return bBudget - aBudget;
      });

      const targetNode = candidateNodes[0];

      if (targetNode) {
        const score = this.calculateScore(service, targetNode, constraints);
        const weight = nodeWeights.get(targetNode.label) || 50;
        const utilization = getUtilization(targetNode.allocatedMemory, targetNode.totalMemory);

        const decision = this.createDecision(
          service,
          targetNode,
          `Weight ${weight}%, utilization ${utilization}%`,
          score,
        );
        decisions.push(decision);
        this.allocateOnNode(targetNode, service);
      }
    }

    return decisions;
  }
}
