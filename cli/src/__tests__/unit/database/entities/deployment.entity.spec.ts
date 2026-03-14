import { describe, test, expect } from 'bun:test';
import {
  DeploymentStatus,
  DeploymentPhase,
  PHASE_NAMES,
  deploymentSchema,
  entityToDeployment,
  deploymentToEntity,
  type DeploymentEntity,
  type Deployment,
} from '../../../../database/entities/deployment.entity';

describe('deployment entity', () => {
  describe('enums', () => {
    test('DeploymentStatus has expected values', () => {
      expect(DeploymentStatus.PENDING).toBe('pending');
      expect(DeploymentStatus.RUNNING).toBe('running');
      expect(DeploymentStatus.SUCCESS).toBe('success');
      expect(DeploymentStatus.FAILED).toBe('failed');
      expect(DeploymentStatus.CANCELLED).toBe('cancelled');
    });

    test('DeploymentPhase has expected values', () => {
      expect(DeploymentPhase.INFRASTRUCTURE_SETUP).toBe(0);
      expect(DeploymentPhase.KUBERNETES_BOOTSTRAP).toBe(1);
      expect(DeploymentPhase.CNI_SETUP).toBe(2);
      expect(DeploymentPhase.STORAGE_SETUP).toBe(3);
      expect(DeploymentPhase.CORE_SERVICES).toBe(4);
      expect(DeploymentPhase.APPLICATION_SERVICES).toBe(5);
      expect(DeploymentPhase.POST_DEPLOY).toBe(6);
    });
  });

  describe('PHASE_NAMES', () => {
    test('has names for all phases', () => {
      expect(PHASE_NAMES[DeploymentPhase.INFRASTRUCTURE_SETUP]).toBe('Infrastructure Setup');
      expect(PHASE_NAMES[DeploymentPhase.KUBERNETES_BOOTSTRAP]).toBe('Kubernetes Bootstrap');
      expect(PHASE_NAMES[DeploymentPhase.CNI_SETUP]).toBe('CNI Setup');
      expect(PHASE_NAMES[DeploymentPhase.STORAGE_SETUP]).toBe('Storage Setup');
      expect(PHASE_NAMES[DeploymentPhase.CORE_SERVICES]).toBe('Core Services');
      expect(PHASE_NAMES[DeploymentPhase.APPLICATION_SERVICES]).toBe('Application Services');
      expect(PHASE_NAMES[DeploymentPhase.POST_DEPLOY]).toBe('Post-Deployment');
    });
  });

  describe('deploymentSchema', () => {
    const validDeployment = {
      id: 'deploy-123',
      repoPath: '/home/user/project',
      status: DeploymentStatus.RUNNING,
      currentPhase: DeploymentPhase.CORE_SERVICES,
      completedPhases: [DeploymentPhase.INFRASTRUCTURE_SETUP, DeploymentPhase.KUBERNETES_BOOTSTRAP],
      failedPhases: [],
      skippedPhases: [],
      config: { timeout: 300 },
      logs: [
        {
          timestamp: new Date().toISOString(),
          phase: DeploymentPhase.INFRASTRUCTURE_SETUP,
          level: 'info' as const,
          message: 'Started deployment',
        },
      ],
      startedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    test('accepts valid deployment', () => {
      const result = deploymentSchema.safeParse(validDeployment);
      expect(result.success).toBe(true);
    });

    test('accepts deployment with completedAt', () => {
      const result = deploymentSchema.safeParse({
        ...validDeployment,
        status: DeploymentStatus.SUCCESS,
        completedAt: new Date().toISOString(),
      });
      expect(result.success).toBe(true);
    });

    test('rejects invalid status', () => {
      const result = deploymentSchema.safeParse({
        ...validDeployment,
        status: 'invalid-status',
      });
      expect(result.success).toBe(false);
    });

    test('rejects invalid phase', () => {
      const result = deploymentSchema.safeParse({
        ...validDeployment,
        currentPhase: 999,
      });
      expect(result.success).toBe(false);
    });

    test('rejects invalid log level', () => {
      const result = deploymentSchema.safeParse({
        ...validDeployment,
        logs: [
          {
            timestamp: new Date().toISOString(),
            phase: DeploymentPhase.INFRASTRUCTURE_SETUP,
            level: 'debug', // Not allowed
            message: 'Test',
          },
        ],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('entityToDeployment', () => {
    test('converts entity to domain model', () => {
      const entity: DeploymentEntity = {
        id: 'deploy-123',
        repoPath: '/home/user/project',
        status: DeploymentStatus.RUNNING,
        currentPhase: DeploymentPhase.CORE_SERVICES,
        completedPhases: JSON.stringify([0, 1]),
        failedPhases: JSON.stringify([]),
        skippedPhases: JSON.stringify([2]),
        config: JSON.stringify({ timeout: 300 }),
        logs: JSON.stringify([
          {
            timestamp: '2024-01-01T00:00:00Z',
            phase: 0,
            level: 'info',
            message: 'Started',
          },
        ]),
        startedAt: '2024-01-01T00:00:00Z',
        completedAt: undefined,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const deployment = entityToDeployment(entity);

      expect(deployment.id).toBe('deploy-123');
      expect(deployment.repoPath).toBe('/home/user/project');
      expect(deployment.status).toBe(DeploymentStatus.RUNNING);
      expect(deployment.currentPhase).toBe(DeploymentPhase.CORE_SERVICES);
      expect(deployment.completedPhases).toEqual([0, 1]);
      expect(deployment.failedPhases).toEqual([]);
      expect(deployment.skippedPhases).toEqual([2]);
      expect(deployment.config).toEqual({ timeout: 300 });
      expect(deployment.logs).toHaveLength(1);
      expect(deployment.logs[0].message).toBe('Started');
    });
  });

  describe('deploymentToEntity', () => {
    test('converts domain model to entity', () => {
      const deployment: Deployment = {
        id: 'deploy-456',
        repoPath: '/home/user/project',
        status: DeploymentStatus.SUCCESS,
        currentPhase: DeploymentPhase.POST_DEPLOY,
        completedPhases: [
          DeploymentPhase.INFRASTRUCTURE_SETUP,
          DeploymentPhase.KUBERNETES_BOOTSTRAP,
          DeploymentPhase.CNI_SETUP,
        ],
        failedPhases: [],
        skippedPhases: [],
        config: { services: ['traefik', 'vault'] },
        logs: [
          {
            timestamp: '2024-01-01T00:00:00Z',
            phase: DeploymentPhase.INFRASTRUCTURE_SETUP,
            level: 'info',
            message: 'Completed',
          },
        ],
        startedAt: '2024-01-01T00:00:00Z',
        completedAt: '2024-01-01T01:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T01:00:00Z',
      };

      const entity = deploymentToEntity(deployment);

      expect(entity.id).toBe('deploy-456');
      expect(entity.repoPath).toBe('/home/user/project');
      expect(entity.status).toBe(DeploymentStatus.SUCCESS);
      expect(entity.currentPhase).toBe(DeploymentPhase.POST_DEPLOY);
      expect(JSON.parse(entity.completedPhases)).toEqual([0, 1, 2]);
      expect(JSON.parse(entity.failedPhases)).toEqual([]);
      expect(JSON.parse(entity.skippedPhases)).toEqual([]);
      expect(JSON.parse(entity.config)).toEqual({ services: ['traefik', 'vault'] });
      expect(JSON.parse(entity.logs)).toHaveLength(1);
    });
  });

  describe('roundtrip conversion', () => {
    test('entity -> deployment -> entity preserves data', () => {
      const originalEntity: DeploymentEntity = {
        id: 'roundtrip-test',
        repoPath: '/test/path',
        status: DeploymentStatus.FAILED,
        currentPhase: DeploymentPhase.STORAGE_SETUP,
        completedPhases: JSON.stringify([0, 1, 2]),
        failedPhases: JSON.stringify([3]),
        skippedPhases: JSON.stringify([4, 5, 6]),
        config: JSON.stringify({ key: 'value' }),
        logs: JSON.stringify([]),
        startedAt: '2024-01-01T00:00:00Z',
        completedAt: '2024-01-01T00:30:00Z',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:30:00Z',
      };

      const deployment = entityToDeployment(originalEntity);
      const convertedEntity = deploymentToEntity(deployment);

      expect(convertedEntity.id).toBe(originalEntity.id);
      expect(convertedEntity.repoPath).toBe(originalEntity.repoPath);
      expect(convertedEntity.status).toBe(originalEntity.status);
      expect(convertedEntity.currentPhase).toBe(originalEntity.currentPhase);
      expect(convertedEntity.completedPhases).toBe(originalEntity.completedPhases);
      expect(convertedEntity.failedPhases).toBe(originalEntity.failedPhases);
      expect(convertedEntity.skippedPhases).toBe(originalEntity.skippedPhases);
    });
  });
});
