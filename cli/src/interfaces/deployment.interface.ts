import { z } from 'zod';
import { MachineRole } from './machine.interface';
import { serviceConfigSchema } from './service.interface';

/**
 * Deployment phase
 */
export enum DeploymentPhase {
  INFRASTRUCTURE_SETUP = 1,
  KUBERNETES_BOOTSTRAP = 2,
  STORAGE_LAYER = 3,
  CORE_SERVICES = 4,
  DATABASES = 5,
  APPLICATION_SERVICES = 6,
  NETWORK_GATEWAY = 7,
  VERIFICATION = 8,
}

/**
 * Deployment step status
 */
export enum StepStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

/**
 * Deployment step
 */
export interface DeploymentStep {
  id: string;
  phase: DeploymentPhase;
  name: string;
  description: string;
  status: StepStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  logs?: string[];
}

/**
 * Service placement on a node
 */
export interface ServicePlacement {
  service: string;
  namespace: string;
  node: string;
  resources: {
    cpu: string;
    memory: string;
  };
  reason: string;
}

/**
 * Deployment plan
 */
export interface DeploymentPlan {
  id: string;
  createdAt: string;
  nodes: {
    label: string;
    ip: string;
    roles: MachineRole[];
    totalCpu: number;
    totalMemory: number;
    allocatedCpu: number;
    allocatedMemory: number;
  }[];
  services: ServicePlacement[];
  phases: DeploymentPhase[];
  warnings: string[];
  errors: string[];
}

/**
 * Cluster configuration for deployment
 */
export interface ClusterConfig {
  name: string;
  domain: string;
  localDomain: string;
}

/**
 * Full deployment configuration (headless mode)
 */
export const deploymentConfigSchema = z.object({
  cluster: z.object({
    name: z.string().min(1).max(63),
    domain: z.string(),
    localDomain: z.string().default('homelab.local'),
  }),

  nodes: z.array(z.object({
    ip: z.string().ip(),
    label: z.string().min(1).max(63),
    roles: z.array(z.nativeEnum(MachineRole)).min(1),
    ssh_user: z.string().default('root'),
    ssh_port: z.number().default(22),
  })).min(1),

  services: z.record(z.string(), z.union([
    z.object({ enabled: z.literal(false) }),
    serviceConfigSchema,
  ])),

  settings: z.object({
    bypass_permissions: z.boolean().default(false),
    skip_phases: z.array(z.number()).default([]),
    parallel_deploys: z.number().min(1).max(10).default(3),
  }).default({}),
});

export type DeploymentConfig = z.infer<typeof deploymentConfigSchema>;

/**
 * Deployment state
 */
export interface DeploymentState {
  config: DeploymentConfig;
  plan: DeploymentPlan;
  currentPhase: DeploymentPhase;
  steps: DeploymentStep[];
  startedAt: string;
  completedAt?: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
}

/**
 * Get phase name
 */
export function getPhaseName(phase: DeploymentPhase): string {
  const names: Record<DeploymentPhase, string> = {
    [DeploymentPhase.INFRASTRUCTURE_SETUP]: 'Infrastructure Setup',
    [DeploymentPhase.KUBERNETES_BOOTSTRAP]: 'Kubernetes Bootstrap',
    [DeploymentPhase.STORAGE_LAYER]: 'Storage Layer',
    [DeploymentPhase.CORE_SERVICES]: 'Core Services',
    [DeploymentPhase.DATABASES]: 'Databases',
    [DeploymentPhase.APPLICATION_SERVICES]: 'Application Services',
    [DeploymentPhase.NETWORK_GATEWAY]: 'Network & Gateway',
    [DeploymentPhase.VERIFICATION]: 'Verification',
  };
  return names[phase];
}
