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
 * Round-robin strategy: distribute services evenly across nodes
 * Cycles through nodes in order, spreading the load
 */
@Injectable()
export class RoundRobinStrategy extends BaseStrategy {
  readonly name = BalancingStrategy.ROUND_ROBIN;
  readonly description = 'Distribute services evenly across nodes';

  execute(
    services: Service[],
    nodes: NodeState[],
    constraints: PlacementConstraint[],
  ): PlacementDecision[] {
    const decisions: PlacementDecision[] = [];
    const workingNodes = nodes.map((n) => ({ ...n, services: [...n.services] }));

    // Sort services by memory descending
    const sortedServices = this.sortServices(services);

    // Track placement counts per node for round-robin
    const placementCounts = new Map<string, number>();
    workingNodes.forEach((n) => placementCounts.set(n.label, n.services.length));

    for (const service of sortedServices) {
      const eligibleNodes = this.getEligibleNodes(service, workingNodes, constraints);

      if (eligibleNodes.length === 0) {
        continue;
      }

      // Get preferred roles
      const preferredRoles = getServiceRoleRequirements(service.name);
      let candidateNodes = this.filterByRolePreference(eligibleNodes, preferredRoles);

      // Sort by placement count (fewer placements first - round robin)
      candidateNodes = candidateNodes.sort((a, b) => {
        const aCount = placementCounts.get(a.label) || 0;
        const bCount = placementCounts.get(b.label) || 0;
        return aCount - bCount;
      });

      const targetNode = candidateNodes[0];

      if (targetNode) {
        const score = this.calculateScore(service, targetNode, constraints);
        const currentCount = placementCounts.get(targetNode.label) || 0;

        const decision = this.createDecision(
          service,
          targetNode,
          `Round-robin slot ${currentCount + 1}`,
          score,
        );
        decisions.push(decision);
        this.allocateOnNode(targetNode, service);
        placementCounts.set(targetNode.label, currentCount + 1);
      }
    }

    return decisions;
  }
}
