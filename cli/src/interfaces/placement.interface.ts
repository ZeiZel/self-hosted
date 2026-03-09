import { z } from 'zod';
import { MachineRole } from './machine.interface';
import { ServiceNamespace } from './service.interface';

/**
 * Balancing strategy types
 */
export enum BalancingStrategy {
  BIN_PACKING = 'bin-packing',
  ROUND_ROBIN = 'round-robin',
  WEIGHTED = 'weighted',
  AFFINITY = 'affinity',
  SPREAD = 'spread',
}

/**
 * Strategy descriptions for UI
 */
export const STRATEGY_DESCRIPTIONS: Record<BalancingStrategy, string> = {
  [BalancingStrategy.BIN_PACKING]: 'Minimize node count by packing services tightly',
  [BalancingStrategy.ROUND_ROBIN]: 'Distribute services evenly across nodes',
  [BalancingStrategy.WEIGHTED]: 'Allocate proportionally to node capacity',
  [BalancingStrategy.AFFINITY]: 'Co-locate related services on same nodes',
  [BalancingStrategy.SPREAD]: 'Maximize spread for high availability',
};

/**
 * Node resource state for placement decisions
 */
export interface NodeState {
  label: string;
  ip: string;
  roles: MachineRole[];
  totalCpu: number; // millicores
  totalMemory: number; // bytes
  allocatedCpu: number; // millicores
  allocatedMemory: number; // bytes
  weight?: number; // for weighted strategy (0-100)
  services: string[]; // currently placed services
}

/**
 * Service placement decision
 */
export interface PlacementDecision {
  service: string;
  namespace: ServiceNamespace | string;
  targetNode: string;
  currentNode?: string;
  resources: {
    cpu: number; // millicores
    memory: number; // bytes
  };
  replicas: number;
  reason: string;
  score: number; // placement score (higher is better)
}

/**
 * Placement constraint types
 */
export enum ConstraintType {
  NODE_AFFINITY = 'node-affinity',
  NODE_ANTI_AFFINITY = 'node-anti-affinity',
  SERVICE_AFFINITY = 'service-affinity',
  SERVICE_ANTI_AFFINITY = 'service-anti-affinity',
  RESOURCE_LIMIT = 'resource-limit',
  ROLE_REQUIREMENT = 'role-requirement',
}

/**
 * Placement constraint
 */
export interface PlacementConstraint {
  type: ConstraintType;
  service: string;
  target?: string; // node label or service name
  roles?: MachineRole[];
  hard: boolean; // hard constraint = must be satisfied
}

/**
 * Placement plan containing all decisions
 */
export interface PlacementPlan {
  id: string;
  createdAt: string;
  strategy: BalancingStrategy;
  nodes: NodeState[];
  placements: PlacementDecision[];
  migrations: MigrationPlan[];
  constraints: PlacementConstraint[];
  warnings: string[];
  errors: string[];
  score: number; // overall plan score
  metrics: PlacementMetrics;
}

/**
 * Metrics for placement quality
 */
export interface PlacementMetrics {
  totalCpuUtilization: number; // percentage
  totalMemoryUtilization: number; // percentage
  balanceScore: number; // 0-100, higher = more balanced
  migrationCount: number;
  constraintsSatisfied: number;
  constraintsViolated: number;
}

/**
 * Migration plan for moving a service
 */
export interface MigrationPlan {
  id: string;
  service: string;
  namespace: string;
  sourceNode: string;
  targetNode: string;
  status: MigrationStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  rollbackPlan?: MigrationPlan;
}

/**
 * Migration status
 */
export enum MigrationStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  DRAINING = 'draining',
  SCHEDULING = 'scheduling',
  VERIFYING = 'verifying',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ROLLED_BACK = 'rolled_back',
}

/**
 * Preset placement configuration
 */
export interface PlacementPreset {
  name: string;
  description: string;
  createdAt: string;
  strategy: BalancingStrategy;
  placements: {
    service: string;
    node: string;
  }[];
  constraints: PlacementConstraint[];
}

/**
 * Balancing options
 */
export interface BalancingOptions {
  strategy: BalancingStrategy;
  dryRun: boolean;
  respectConstraints: boolean;
  allowMigrations: boolean;
  maxMigrations?: number;
  targetUtilization?: number; // percentage
  excludeServices?: string[];
  excludeNodes?: string[];
}

/**
 * Service affinity groups
 */
export const SERVICE_AFFINITY_GROUPS: Record<string, string[]> = {
  // Database tier - keep databases together for backup efficiency
  databases: ['postgresql', 'mongodb', 'mysql', 'clickhouse', 'valkey', 'minio'],
  // Core services - keep on master nodes
  core: ['vault', 'consul', 'authentik', 'cert-manager', 'traefik'],
  // Monitoring stack - co-locate for efficiency
  monitoring: ['prometheus', 'grafana', 'loki', 'alertmanager'],
  // Code services - co-locate for CI/CD efficiency
  code: ['gitlab', 'teamcity', 'harbor', 'coder'],
  // Productivity suite
  productivity: ['affine', 'excalidraw', 'penpot', 'notesnook'],
};

/**
 * Default role requirements for services
 */
export const SERVICE_ROLE_REQUIREMENTS: Record<string, MachineRole[]> = {
  // Gateway services
  traefik: [MachineRole.GATEWAY, MachineRole.MASTER],
  pangolin: [MachineRole.GATEWAY, MachineRole.MASTER],
  // Core services on master
  vault: [MachineRole.MASTER],
  consul: [MachineRole.MASTER],
  authentik: [MachineRole.MASTER],
  'cert-manager': [MachineRole.MASTER],
  // Storage services prefer storage nodes
  minio: [MachineRole.STORAGE, MachineRole.MASTER, MachineRole.WORKER],
  syncthing: [MachineRole.STORAGE, MachineRole.WORKER],
  nextcloud: [MachineRole.STORAGE, MachineRole.WORKER],
  // Databases prefer storage
  postgresql: [MachineRole.STORAGE, MachineRole.MASTER, MachineRole.WORKER],
  mongodb: [MachineRole.STORAGE, MachineRole.MASTER, MachineRole.WORKER],
  // Monitoring
  prometheus: [MachineRole.STORAGE, MachineRole.MASTER],
  loki: [MachineRole.STORAGE, MachineRole.MASTER],
  // Applications prefer workers
  '*': [MachineRole.WORKER, MachineRole.MASTER],
};

/**
 * Zod schemas for validation
 */
export const placementDecisionSchema = z.object({
  service: z.string().min(1),
  namespace: z.string(),
  targetNode: z.string().min(1),
  currentNode: z.string().optional(),
  resources: z.object({
    cpu: z.number().min(0),
    memory: z.number().min(0),
  }),
  replicas: z.number().int().min(1),
  reason: z.string(),
  score: z.number(),
});

export const placementPresetSchema = z.object({
  name: z.string().min(1).max(63).regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/),
  description: z.string().optional().default(''),
  createdAt: z.string().datetime(),
  strategy: z.nativeEnum(BalancingStrategy),
  placements: z.array(z.object({
    service: z.string(),
    node: z.string(),
  })),
  constraints: z.array(z.object({
    type: z.nativeEnum(ConstraintType),
    service: z.string(),
    target: z.string().optional(),
    roles: z.array(z.nativeEnum(MachineRole)).optional(),
    hard: z.boolean(),
  })),
});

export const balancingOptionsSchema = z.object({
  strategy: z.nativeEnum(BalancingStrategy).default(BalancingStrategy.BIN_PACKING),
  dryRun: z.boolean().default(true),
  respectConstraints: z.boolean().default(true),
  allowMigrations: z.boolean().default(true),
  maxMigrations: z.number().int().min(1).optional(),
  targetUtilization: z.number().min(0).max(100).optional(),
  excludeServices: z.array(z.string()).optional(),
  excludeNodes: z.array(z.string()).optional(),
});

/**
 * Calculate available resources for a node
 */
export function getAvailableResources(node: NodeState): { cpu: number; memory: number } {
  return {
    cpu: node.totalCpu - node.allocatedCpu,
    memory: node.totalMemory - node.allocatedMemory,
  };
}

/**
 * Calculate utilization percentage
 */
export function getUtilization(allocated: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((allocated / total) * 100);
}

/**
 * Get role requirements for a service
 */
export function getServiceRoleRequirements(serviceName: string): MachineRole[] {
  return SERVICE_ROLE_REQUIREMENTS[serviceName] || SERVICE_ROLE_REQUIREMENTS['*'];
}

/**
 * Check if a node can accommodate a service
 */
export function canAccommodate(
  node: NodeState,
  cpuRequired: number,
  memoryRequired: number,
): boolean {
  const available = getAvailableResources(node);
  return available.cpu >= cpuRequired && available.memory >= memoryRequired;
}

/**
 * Find affinity group for a service
 */
export function findAffinityGroup(serviceName: string): string | null {
  for (const [group, services] of Object.entries(SERVICE_AFFINITY_GROUPS)) {
    if (services.includes(serviceName)) {
      return group;
    }
  }
  return null;
}
