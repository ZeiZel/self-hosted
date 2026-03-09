import {
  NodeState,
  PlacementDecision,
  PlacementConstraint,
  BalancingStrategy,
  canAccommodate,
  getAvailableResources,
  getServiceRoleRequirements,
} from '../../../interfaces/placement.interface';
import { Service } from '../../../interfaces/service.interface';
import { MachineRole } from '../../../interfaces/machine.interface';
import { parseCpuToMillicores, parseMemoryToBytes } from '../../../utils/validation';

/**
 * Abstract base class for placement strategies
 */
export abstract class BaseStrategy {
  abstract readonly name: BalancingStrategy;
  abstract readonly description: string;

  /**
   * Execute the placement strategy
   * @param services Services to place
   * @param nodes Available nodes
   * @param constraints Placement constraints
   * @returns Placement decisions
   */
  abstract execute(
    services: Service[],
    nodes: NodeState[],
    constraints: PlacementConstraint[],
  ): PlacementDecision[];

  /**
   * Calculate score for a placement decision (higher is better)
   */
  protected calculateScore(
    service: Service,
    node: NodeState,
    constraints: PlacementConstraint[],
  ): number {
    let score = 100;

    // Resource availability factor
    const available = getAvailableResources(node);
    const requiredCpu = parseCpuToMillicores(service.config.resources.cpu);
    const requiredMemory = parseMemoryToBytes(service.config.resources.memory);

    if (!canAccommodate(node, requiredCpu, requiredMemory)) {
      return -1; // Cannot place
    }

    // Prefer nodes with more available resources
    const cpuHeadroom = available.cpu / (node.totalCpu || 1);
    const memoryHeadroom = available.memory / (node.totalMemory || 1);
    score += (cpuHeadroom + memoryHeadroom) * 20;

    // Role matching bonus
    const preferredRoles = getServiceRoleRequirements(service.name);
    if (preferredRoles.some((r) => node.roles.includes(r))) {
      score += 30;
    }

    // Constraint satisfaction
    const relevantConstraints = constraints.filter((c) => c.service === service.name);
    for (const constraint of relevantConstraints) {
      const satisfied = this.checkConstraint(constraint, service, node);
      if (!satisfied) {
        if (constraint.hard) {
          return -1; // Hard constraint violation
        }
        score -= 20; // Soft constraint penalty
      } else {
        score += 10; // Constraint satisfaction bonus
      }
    }

    return score;
  }

  /**
   * Check if a constraint is satisfied
   */
  protected checkConstraint(
    constraint: PlacementConstraint,
    _service: Service,
    node: NodeState,
  ): boolean {
    switch (constraint.type) {
      case 'node-affinity':
        return constraint.target === node.label;

      case 'node-anti-affinity':
        return constraint.target !== node.label;

      case 'service-affinity':
        return node.services.includes(constraint.target || '');

      case 'service-anti-affinity':
        return !node.services.includes(constraint.target || '');

      case 'role-requirement':
        return (constraint.roles || []).some((r) => node.roles.includes(r));

      case 'resource-limit':
        // Resource constraints are handled in canAccommodate
        return true;

      default:
        return true;
    }
  }

  /**
   * Get eligible nodes for a service
   */
  protected getEligibleNodes(
    service: Service,
    nodes: NodeState[],
    constraints: PlacementConstraint[],
  ): NodeState[] {
    const requiredCpu = parseCpuToMillicores(service.config.resources.cpu);
    const requiredMemory = parseMemoryToBytes(service.config.resources.memory);

    // Filter by capacity and hard constraints
    return nodes.filter((node) => {
      // Check capacity
      if (!canAccommodate(node, requiredCpu, requiredMemory)) {
        return false;
      }

      // Check hard constraints
      const hardConstraints = constraints.filter((c) => c.service === service.name && c.hard);
      for (const constraint of hardConstraints) {
        if (!this.checkConstraint(constraint, service, node)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Filter nodes by role preference
   */
  protected filterByRolePreference(nodes: NodeState[], preferredRoles: MachineRole[]): NodeState[] {
    const matching = nodes.filter((n) => preferredRoles.some((r) => n.roles.includes(r)));
    return matching.length > 0 ? matching : nodes;
  }

  /**
   * Sort services for placement (default: by memory descending)
   */
  protected sortServices(services: Service[]): Service[] {
    return [...services].sort((a, b) => {
      const aMemory = parseMemoryToBytes(a.config.resources.memory);
      const bMemory = parseMemoryToBytes(b.config.resources.memory);
      return bMemory - aMemory;
    });
  }

  /**
   * Create a placement decision
   */
  protected createDecision(
    service: Service,
    node: NodeState,
    reason: string,
    score: number,
    currentNode?: string,
  ): PlacementDecision {
    return {
      service: service.name,
      namespace: service.namespace,
      targetNode: node.label,
      currentNode,
      resources: {
        cpu: parseCpuToMillicores(service.config.resources.cpu),
        memory: parseMemoryToBytes(service.config.resources.memory),
      },
      replicas: service.config.replicas,
      reason,
      score,
    };
  }

  /**
   * Update node allocation after placing a service
   */
  protected allocateOnNode(node: NodeState, service: Service): void {
    const cpu = parseCpuToMillicores(service.config.resources.cpu) * service.config.replicas;
    const memory = parseMemoryToBytes(service.config.resources.memory) * service.config.replicas;

    node.allocatedCpu += cpu;
    node.allocatedMemory += memory;
    node.services.push(service.name);
  }
}
