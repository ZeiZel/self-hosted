import { z } from 'zod';
import { BaseEntity } from './base.entity';

/**
 * Deployment status
 */
export enum DeploymentStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Deployment phases
 */
export enum DeploymentPhase {
  INFRASTRUCTURE_SETUP = 0,
  KUBERNETES_BOOTSTRAP = 1,
  CNI_SETUP = 2,
  STORAGE_SETUP = 3,
  CORE_SERVICES = 4,
  APPLICATION_SERVICES = 5,
  POST_DEPLOY = 6,
}

/**
 * Phase names for display
 */
export const PHASE_NAMES: Record<DeploymentPhase, string> = {
  [DeploymentPhase.INFRASTRUCTURE_SETUP]: 'Infrastructure Setup',
  [DeploymentPhase.KUBERNETES_BOOTSTRAP]: 'Kubernetes Bootstrap',
  [DeploymentPhase.CNI_SETUP]: 'CNI Setup',
  [DeploymentPhase.STORAGE_SETUP]: 'Storage Setup',
  [DeploymentPhase.CORE_SERVICES]: 'Core Services',
  [DeploymentPhase.APPLICATION_SERVICES]: 'Application Services',
  [DeploymentPhase.POST_DEPLOY]: 'Post-Deployment',
};

/**
 * Deployment log entry
 */
export interface DeploymentLogEntry {
  timestamp: string;
  phase: DeploymentPhase;
  level: 'info' | 'warn' | 'error';
  message: string;
}

/**
 * Deployment entity stored in database
 */
export interface DeploymentEntity extends BaseEntity {
  repoPath: string;
  status: DeploymentStatus;
  currentPhase: number;
  completedPhases: string; // JSON array
  failedPhases: string; // JSON array
  skippedPhases: string; // JSON array
  config: string; // JSON
  logs: string; // JSON array
  startedAt: string;
  completedAt?: string;
}

/**
 * Deployment domain model
 */
export interface Deployment {
  id: string;
  repoPath: string;
  status: DeploymentStatus;
  currentPhase: DeploymentPhase;
  completedPhases: DeploymentPhase[];
  failedPhases: DeploymentPhase[];
  skippedPhases: DeploymentPhase[];
  config: Record<string, unknown>;
  logs: DeploymentLogEntry[];
  startedAt: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Input for creating a deployment
 */
export interface CreateDeploymentInput {
  repoPath: string;
  config: Record<string, unknown>;
}

/**
 * Zod schema for deployment validation
 */
export const deploymentSchema = z.object({
  id: z.string(),
  repoPath: z.string(),
  status: z.nativeEnum(DeploymentStatus),
  currentPhase: z.nativeEnum(DeploymentPhase),
  completedPhases: z.array(z.nativeEnum(DeploymentPhase)),
  failedPhases: z.array(z.nativeEnum(DeploymentPhase)),
  skippedPhases: z.array(z.nativeEnum(DeploymentPhase)),
  config: z.record(z.unknown()),
  logs: z.array(z.object({
    timestamp: z.string(),
    phase: z.nativeEnum(DeploymentPhase),
    level: z.enum(['info', 'warn', 'error']),
    message: z.string(),
  })),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * Convert entity to domain model
 */
export function entityToDeployment(entity: DeploymentEntity): Deployment {
  return {
    id: entity.id,
    repoPath: entity.repoPath,
    status: entity.status,
    currentPhase: entity.currentPhase as DeploymentPhase,
    completedPhases: JSON.parse(entity.completedPhases),
    failedPhases: JSON.parse(entity.failedPhases),
    skippedPhases: JSON.parse(entity.skippedPhases),
    config: JSON.parse(entity.config),
    logs: JSON.parse(entity.logs),
    startedAt: entity.startedAt,
    completedAt: entity.completedAt,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

/**
 * Convert domain model to entity
 */
export function deploymentToEntity(deployment: Deployment): DeploymentEntity {
  return {
    id: deployment.id,
    repoPath: deployment.repoPath,
    status: deployment.status,
    currentPhase: deployment.currentPhase,
    completedPhases: JSON.stringify(deployment.completedPhases),
    failedPhases: JSON.stringify(deployment.failedPhases),
    skippedPhases: JSON.stringify(deployment.skippedPhases),
    config: JSON.stringify(deployment.config),
    logs: JSON.stringify(deployment.logs),
    startedAt: deployment.startedAt,
    completedAt: deployment.completedAt,
    createdAt: deployment.createdAt,
    updatedAt: deployment.updatedAt,
  };
}
