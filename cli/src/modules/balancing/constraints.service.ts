import { Injectable } from '@nestjs/common';
import {
  PlacementConstraint,
  ConstraintType,
  NodeState,
  PlacementDecision,
  SERVICE_ROLE_REQUIREMENTS,
  SERVICE_AFFINITY_GROUPS,
} from '../../interfaces/placement.interface';
import { Service } from '../../interfaces/service.interface';
import { MachineRole } from '../../interfaces/machine.interface';

/**
 * Validation result for constraints
 */
export interface ConstraintValidation {
  valid: boolean;
  violations: ConstraintViolation[];
  warnings: string[];
}

/**
 * Constraint violation details
 */
export interface ConstraintViolation {
  constraint: PlacementConstraint;
  service: string;
  node: string;
  message: string;
  hard: boolean;
}

/**
 * Service for managing and validating placement constraints
 */
@Injectable()
export class ConstraintsService {
  /**
   * Generate default constraints for services
   */
  generateDefaultConstraints(services: Service[]): PlacementConstraint[] {
    const constraints: PlacementConstraint[] = [];

    for (const service of services) {
      // Role requirements
      const roleReqs = SERVICE_ROLE_REQUIREMENTS[service.name];
      if (roleReqs) {
        constraints.push({
          type: ConstraintType.ROLE_REQUIREMENT,
          service: service.name,
          roles: roleReqs,
          hard: false, // Soft constraint - prefer but don't require
        });
      }

      // Service anti-affinity for replicas > 1 (spread replicas)
      if (service.config.replicas > 1) {
        constraints.push({
          type: ConstraintType.SERVICE_ANTI_AFFINITY,
          service: service.name,
          target: service.name,
          hard: false,
        });
      }

      // Database anti-affinity (don't put all databases on one node)
      if (this.isDatabase(service.name)) {
        for (const otherDb of this.getDatabases()) {
          if (otherDb !== service.name) {
            constraints.push({
              type: ConstraintType.SERVICE_ANTI_AFFINITY,
              service: service.name,
              target: otherDb,
              hard: false,
            });
          }
        }
      }
    }

    return constraints;
  }

  /**
   * Validate placement decisions against constraints
   */
  validatePlacements(
    decisions: PlacementDecision[],
    constraints: PlacementConstraint[],
    nodes: NodeState[],
  ): ConstraintValidation {
    const violations: ConstraintViolation[] = [];
    const warnings: string[] = [];

    // Build a map of service -> node for quick lookup
    const serviceToNode = new Map<string, string>();
    for (const decision of decisions) {
      serviceToNode.set(decision.service, decision.targetNode);
    }

    // Check each constraint
    for (const constraint of constraints) {
      const targetNodeLabel = serviceToNode.get(constraint.service);
      if (!targetNodeLabel) {
        continue; // Service not placed, constraint doesn't apply
      }

      const targetNode = nodes.find((n) => n.label === targetNodeLabel);
      if (!targetNode) {
        continue;
      }

      const satisfied = this.checkConstraint(constraint, targetNode, serviceToNode, nodes);

      if (!satisfied) {
        const violation: ConstraintViolation = {
          constraint,
          service: constraint.service,
          node: targetNodeLabel,
          message: this.getViolationMessage(constraint, targetNode),
          hard: constraint.hard,
        };
        violations.push(violation);

        if (!constraint.hard) {
          warnings.push(violation.message);
        }
      }
    }

    return {
      valid: violations.filter((v) => v.hard).length === 0,
      violations,
      warnings,
    };
  }

  /**
   * Check if a single constraint is satisfied
   */
  private checkConstraint(
    constraint: PlacementConstraint,
    node: NodeState,
    serviceToNode: Map<string, string>,
    _nodes: NodeState[],
  ): boolean {
    switch (constraint.type) {
      case ConstraintType.NODE_AFFINITY:
        return node.label === constraint.target;

      case ConstraintType.NODE_ANTI_AFFINITY:
        return node.label !== constraint.target;

      case ConstraintType.SERVICE_AFFINITY:
        // Check if target service is on same node
        const affinityTarget = serviceToNode.get(constraint.target || '');
        return affinityTarget === node.label;

      case ConstraintType.SERVICE_ANTI_AFFINITY:
        // Check if target service is NOT on same node
        const antiAffinityTarget = serviceToNode.get(constraint.target || '');
        return antiAffinityTarget !== node.label;

      case ConstraintType.ROLE_REQUIREMENT:
        return (constraint.roles || []).some((r) => node.roles.includes(r));

      case ConstraintType.RESOURCE_LIMIT:
        // Resource limits are checked during placement, not here
        return true;

      default:
        return true;
    }
  }

  /**
   * Get human-readable violation message
   */
  private getViolationMessage(constraint: PlacementConstraint, node: NodeState): string {
    const prefix = constraint.hard ? 'Hard constraint violation' : 'Soft constraint warning';

    switch (constraint.type) {
      case ConstraintType.NODE_AFFINITY:
        return `${prefix}: ${constraint.service} should be on node ${constraint.target}, but placed on ${node.label}`;

      case ConstraintType.NODE_ANTI_AFFINITY:
        return `${prefix}: ${constraint.service} should NOT be on node ${constraint.target}`;

      case ConstraintType.SERVICE_AFFINITY:
        return `${prefix}: ${constraint.service} should be co-located with ${constraint.target}`;

      case ConstraintType.SERVICE_ANTI_AFFINITY:
        return `${prefix}: ${constraint.service} should be separated from ${constraint.target}`;

      case ConstraintType.ROLE_REQUIREMENT:
        const roles = constraint.roles?.join(', ') || 'unknown';
        return `${prefix}: ${constraint.service} prefers nodes with roles [${roles}], but placed on ${node.label} with roles [${node.roles.join(', ')}]`;

      default:
        return `${prefix}: ${constraint.service} on ${node.label}`;
    }
  }

  /**
   * Check if service is a database
   */
  private isDatabase(serviceName: string): boolean {
    const databases = SERVICE_AFFINITY_GROUPS['databases'] || [];
    return databases.includes(serviceName);
  }

  /**
   * Get list of database service names
   */
  private getDatabases(): string[] {
    return SERVICE_AFFINITY_GROUPS['databases'] || [];
  }

  /**
   * Create constraint from user input
   */
  createConstraint(
    type: ConstraintType,
    service: string,
    options: {
      target?: string;
      roles?: MachineRole[];
      hard?: boolean;
    } = {},
  ): PlacementConstraint {
    return {
      type,
      service,
      target: options.target,
      roles: options.roles,
      hard: options.hard ?? false,
    };
  }

  /**
   * Merge user constraints with default constraints
   */
  mergeConstraints(
    defaults: PlacementConstraint[],
    custom: PlacementConstraint[],
  ): PlacementConstraint[] {
    const merged = [...defaults];

    for (const customConstraint of custom) {
      // Find if there's a matching default constraint to override
      const existingIndex = merged.findIndex(
        (c) =>
          c.type === customConstraint.type &&
          c.service === customConstraint.service &&
          c.target === customConstraint.target,
      );

      if (existingIndex >= 0) {
        // Override existing constraint
        merged[existingIndex] = customConstraint;
      } else {
        // Add new constraint
        merged.push(customConstraint);
      }
    }

    return merged;
  }
}
