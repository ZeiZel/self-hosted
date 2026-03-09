import { Injectable } from '@nestjs/common';
import { BaseStrategy } from './base.strategy';
import {
  NodeState,
  PlacementDecision,
  PlacementConstraint,
  BalancingStrategy,
  getServiceRoleRequirements,
  getAvailableResources,
} from '../../../interfaces/placement.interface';
import { Service } from '../../../interfaces/service.interface';

/**
 * Spread strategy: maximize distribution for high availability
 * Spreads services across as many nodes as possible to minimize blast radius
 */
@Injectable()
export class SpreadStrategy extends BaseStrategy {
  readonly name = BalancingStrategy.SPREAD;
  readonly description = 'Maximize spread for high availability';

  execute(
    services: Service[],
    nodes: NodeState[],
    constraints: PlacementConstraint[],
  ): PlacementDecision[] {
    const decisions: PlacementDecision[] = [];
    const workingNodes = nodes.map((n) => ({ ...n, services: [...n.services] }));

    // Sort services by memory descending
    const sortedServices = this.sortServices(services);

    // Track how many services from each namespace are on each node
    const namespaceDistribution = new Map<string, Map<string, number>>();

    for (const service of sortedServices) {
      const eligibleNodes = this.getEligibleNodes(service, workingNodes, constraints);

      if (eligibleNodes.length === 0) {
        continue;
      }

      // Get preferred roles
      const preferredRoles = getServiceRoleRequirements(service.name);
      let candidateNodes = this.filterByRolePreference(eligibleNodes, preferredRoles);

      // Sort by spread score (prefer nodes with fewer services from same namespace)
      candidateNodes = candidateNodes.sort((a, b) => {
        const spreadScoreA = this.calculateSpreadScore(a, service.namespace, namespaceDistribution);
        const spreadScoreB = this.calculateSpreadScore(b, service.namespace, namespaceDistribution);

        // Higher spread score = better spread (prefer this node)
        if (spreadScoreB !== spreadScoreA) {
          return spreadScoreB - spreadScoreA;
        }

        // Tie-breaker: more available resources
        const availA = getAvailableResources(a);
        const availB = getAvailableResources(b);
        return availB.memory - availA.memory;
      });

      const targetNode = candidateNodes[0];

      if (targetNode) {
        const score = this.calculateScore(service, targetNode, constraints);
        const nsCount = this.getNamespaceCount(
          targetNode.label,
          service.namespace,
          namespaceDistribution,
        );

        const decision = this.createDecision(
          service,
          targetNode,
          nsCount === 0
            ? `First ${service.namespace} service on node`
            : `Spread: ${nsCount + 1} ${service.namespace} services`,
          score,
        );
        decisions.push(decision);
        this.allocateOnNode(targetNode, service);
        this.updateNamespaceDistribution(
          targetNode.label,
          service.namespace,
          namespaceDistribution,
        );
      }
    }

    return decisions;
  }

  /**
   * Calculate spread score for a node (higher = better for spreading)
   */
  private calculateSpreadScore(
    node: NodeState,
    namespace: string,
    distribution: Map<string, Map<string, number>>,
  ): number {
    let score = 100;

    // Penalty for having services from the same namespace
    const nsCount = this.getNamespaceCount(node.label, namespace, distribution);
    score -= nsCount * 20;

    // Penalty for total services on node (prefer less loaded nodes)
    score -= node.services.length * 5;

    // Bonus for available resources
    const available = getAvailableResources(node);
    const memoryPercent = (available.memory / (node.totalMemory || 1)) * 100;
    score += memoryPercent * 0.2;

    return score;
  }

  /**
   * Get count of services from a namespace on a node
   */
  private getNamespaceCount(
    nodeLabel: string,
    namespace: string,
    distribution: Map<string, Map<string, number>>,
  ): number {
    const nodeMap = distribution.get(nodeLabel);
    if (!nodeMap) return 0;
    return nodeMap.get(namespace) || 0;
  }

  /**
   * Update namespace distribution tracking
   */
  private updateNamespaceDistribution(
    nodeLabel: string,
    namespace: string,
    distribution: Map<string, Map<string, number>>,
  ): void {
    if (!distribution.has(nodeLabel)) {
      distribution.set(nodeLabel, new Map());
    }
    const nodeMap = distribution.get(nodeLabel)!;
    const current = nodeMap.get(namespace) || 0;
    nodeMap.set(namespace, current + 1);
  }
}
