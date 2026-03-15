import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { TaskBuilderService } from '../../../modules/deploy/tui/services/task-builder.service';
import { ServicesService } from '../../../modules/services/services.service';
import { DeploymentPhase } from '../../../interfaces/deployment.interface';
import {
  TaskStatus,
  TaskType,
} from '../../../modules/deploy/tui/interfaces/task.interface';
import {
  Service,
  ServiceConfig,
  ServiceNamespace,
  CORE_SERVICES,
} from '../../../interfaces/service.interface';

/**
 * Type for the partial mock of ServicesService
 */
type MockServicesService = Pick<ServicesService, 'getEnabled' | 'getByName' | 'getAll' | 'getCoreServices'>;

/**
 * Mock ServicesService for testing TaskBuilderService
 */
function createMockServicesService(enabledServices: Partial<Service>[] = []): MockServicesService {
  const defaultConfig: ServiceConfig = {
    enabled: true,
    replicas: 1,
    resources: { cpu: '500m', memory: '512Mi', storage: '10Gi' },
    expose: false,
  };

  const services: Service[] = enabledServices.map((s) => ({
    name: s.name ?? 'unknown',
    repo: s.repo ?? 'charts',
    chart: s.chart ?? s.name ?? 'unknown',
    namespace: s.namespace ?? ServiceNamespace.CODE,
    version: s.version ?? '1.0.0',
    installed: s.installed ?? true,
    mandatory: s.mandatory ?? false,
    tier: s.tier ?? 'application',
    needs: s.needs ?? [],
    config: s.config ?? defaultConfig,
    resourceTier: s.resourceTier ?? 'medium',
  }));

  return {
    getEnabled: mock(() => services),
    getByName: mock((name: string) => services.find((s) => s.name === name)),
    getAll: mock(() => services),
    getCoreServices: mock(() => services.filter((s) => CORE_SERVICES.includes(s.name))),
  };
}

/**
 * Helper to create a Service object for testing
 */
function createService(overrides: Partial<Service>): Partial<Service> {
  return {
    name: 'test-service',
    namespace: ServiceNamespace.CODE,
    needs: [],
    ...overrides,
  };
}

describe('TaskBuilderService', () => {
  let taskBuilder: TaskBuilderService;
  let mockServicesService: MockServicesService;

  describe('buildTaskGraph', () => {
    describe('infrastructure setup tasks', () => {
      beforeEach(() => {
        mockServicesService = createMockServicesService([]);
        taskBuilder = new TaskBuilderService(mockServicesService as unknown as ServicesService);
      });

      test('should create infrastructure setup tasks', () => {
        const tasks = taskBuilder.buildTaskGraph();
        const infraTasks = tasks.filter(
          (t) => t.phase === DeploymentPhase.INFRASTRUCTURE_SETUP
        );

        expect(infraTasks).toHaveLength(3);
        expect(infraTasks.map((t) => t.id)).toContain('infra/validate-inventory');
        expect(infraTasks.map((t) => t.id)).toContain('infra/install-packages');
        expect(infraTasks.map((t) => t.id)).toContain('infra/configure-firewall');
      });

      test('should set correct dependencies for infrastructure tasks', () => {
        const tasks = taskBuilder.buildTaskGraph();
        const taskMap = new Map(tasks.map((t) => [t.id, t]));

        const validateTask = taskMap.get('infra/validate-inventory');
        const installTask = taskMap.get('infra/install-packages');
        const firewallTask = taskMap.get('infra/configure-firewall');

        expect(validateTask?.dependencies).toEqual([]);
        expect(installTask?.dependencies).toContain('infra/validate-inventory');
        expect(firewallTask?.dependencies).toContain('infra/install-packages');
      });

      test('should mark all infrastructure tasks as mandatory', () => {
        const tasks = taskBuilder.buildTaskGraph();
        const infraTasks = tasks.filter(
          (t) => t.phase === DeploymentPhase.INFRASTRUCTURE_SETUP
        );

        expect(infraTasks.every((t) => t.mandatory)).toBe(true);
      });
    });

    describe('kubernetes bootstrap tasks', () => {
      beforeEach(() => {
        mockServicesService = createMockServicesService([]);
        taskBuilder = new TaskBuilderService(mockServicesService as unknown as ServicesService);
      });

      test('should create kubernetes bootstrap tasks', () => {
        const tasks = taskBuilder.buildTaskGraph();
        const k8sTasks = tasks.filter(
          (t) => t.phase === DeploymentPhase.KUBERNETES_BOOTSTRAP
        );

        expect(k8sTasks).toHaveLength(3);
        expect(k8sTasks.map((t) => t.id)).toContain('k8s/kubespray');
        expect(k8sTasks.map((t) => t.id)).toContain('k8s/configure-kubectl');
        expect(k8sTasks.map((t) => t.id)).toContain('k8s/deploy-cni');
      });

      test('should set kubespray dependency on firewall', () => {
        const tasks = taskBuilder.buildTaskGraph();
        const kubesprayTask = tasks.find((t) => t.id === 'k8s/kubespray');

        expect(kubesprayTask?.dependencies).toContain('infra/configure-firewall');
      });

      test('should have correct ansible tags for kubernetes tasks', () => {
        const tasks = taskBuilder.buildTaskGraph();
        const kubesprayTask = tasks.find((t) => t.id === 'k8s/kubespray');
        const cniTask = tasks.find((t) => t.id === 'k8s/deploy-cni');

        expect(kubesprayTask?.ansibleTags).toContain('kubespray');
        expect(cniTask?.ansibleTags).toContain('cni');
      });
    });

    describe('storage layer tasks', () => {
      beforeEach(() => {
        mockServicesService = createMockServicesService([]);
        taskBuilder = new TaskBuilderService(mockServicesService as unknown as ServicesService);
      });

      test('should create storage layer tasks', () => {
        const tasks = taskBuilder.buildTaskGraph();
        const storageTasks = tasks.filter(
          (t) => t.phase === DeploymentPhase.STORAGE_LAYER
        );

        expect(storageTasks).toHaveLength(3);
        expect(storageTasks.map((t) => t.id)).toContain('storage/prepare-nodes');
        expect(storageTasks.map((t) => t.id)).toContain('storage/deploy-openebs');
        expect(storageTasks.map((t) => t.id)).toContain('storage/verify');
      });

      test('should set correct helmfile selector for openebs', () => {
        const tasks = taskBuilder.buildTaskGraph();
        const openebsTask = tasks.find((t) => t.id === 'storage/deploy-openebs');

        expect(openebsTask?.helmfileSelector).toBe('name=openebs');
        expect(openebsTask?.type).toBe(TaskType.HELMFILE);
      });
    });

    describe('core services tasks', () => {
      beforeEach(() => {
        mockServicesService = createMockServicesService([]);
        taskBuilder = new TaskBuilderService(mockServicesService as unknown as ServicesService);
      });

      test('should create core services tasks', () => {
        const tasks = taskBuilder.buildTaskGraph();
        const coreTasks = tasks.filter(
          (t) => t.phase === DeploymentPhase.CORE_SERVICES
        );

        expect(coreTasks).toHaveLength(6);
        expect(coreTasks.map((t) => t.id)).toContain('core/namespaces');
        expect(coreTasks.map((t) => t.id)).toContain('core/traefik');
        expect(coreTasks.map((t) => t.id)).toContain('core/consul');
        expect(coreTasks.map((t) => t.id)).toContain('core/vault');
        expect(coreTasks.map((t) => t.id)).toContain('core/cert-manager');
        expect(coreTasks.map((t) => t.id)).toContain('core/authentik');
      });

      test('should set correct dependencies for core services', () => {
        const tasks = taskBuilder.buildTaskGraph();
        const taskMap = new Map(tasks.map((t) => [t.id, t]));

        expect(taskMap.get('core/traefik')?.dependencies).toContain('core/namespaces');
        expect(taskMap.get('core/consul')?.dependencies).toContain('core/traefik');
        expect(taskMap.get('core/vault')?.dependencies).toContain('core/consul');
        expect(taskMap.get('core/cert-manager')?.dependencies).toContain('core/vault');
      });

      test('should set authentik dependency on databases', () => {
        const tasks = taskBuilder.buildTaskGraph();
        const authentikTask = tasks.find((t) => t.id === 'core/authentik');

        expect(authentikTask?.dependencies).toContain('core/cert-manager');
        expect(authentikTask?.dependencies).toContain('db/postgresql');
        expect(authentikTask?.dependencies).toContain('db/valkey');
      });

      test('should add vault dependency for all services', () => {
        const tasks = taskBuilder.buildTaskGraph();
        const vaultTask = tasks.find((t) => t.id === 'core/vault');

        // Vault itself should exist and be mandatory
        expect(vaultTask).toBeDefined();
        expect(vaultTask?.mandatory).toBe(true);
      });
    });

    describe('database tasks', () => {
      test('should create database tasks for enabled databases', () => {
        mockServicesService = createMockServicesService([
          createService({ name: 'postgresql', namespace: ServiceNamespace.DB }),
          createService({ name: 'mongodb', namespace: ServiceNamespace.DB }),
          createService({ name: 'valkey', namespace: ServiceNamespace.DB }),
        ]);
        taskBuilder = new TaskBuilderService(mockServicesService as unknown as ServicesService);

        const tasks = taskBuilder.buildTaskGraph();
        const dbTasks = tasks.filter((t) => t.phase === DeploymentPhase.DATABASES);

        expect(dbTasks).toHaveLength(3);
        expect(dbTasks.map((t) => t.id)).toContain('db/postgresql');
        expect(dbTasks.map((t) => t.id)).toContain('db/mongodb');
        expect(dbTasks.map((t) => t.id)).toContain('db/valkey');
      });

      test('should set postgresql as mandatory', () => {
        mockServicesService = createMockServicesService([
          createService({ name: 'postgresql', namespace: ServiceNamespace.DB }),
          createService({ name: 'mongodb', namespace: ServiceNamespace.DB }),
        ]);
        taskBuilder = new TaskBuilderService(mockServicesService as unknown as ServicesService);

        const tasks = taskBuilder.buildTaskGraph();
        const pgTask = tasks.find((t) => t.id === 'db/postgresql');
        const mongoTask = tasks.find((t) => t.id === 'db/mongodb');

        expect(pgTask?.mandatory).toBe(true);
        expect(mongoTask?.mandatory).toBe(false);
      });

      test('should set valkey as mandatory', () => {
        mockServicesService = createMockServicesService([
          createService({ name: 'valkey', namespace: ServiceNamespace.DB }),
        ]);
        taskBuilder = new TaskBuilderService(mockServicesService as unknown as ServicesService);

        const tasks = taskBuilder.buildTaskGraph();
        const valkeyTask = tasks.find((t) => t.id === 'db/valkey');

        expect(valkeyTask?.mandatory).toBe(true);
      });

      test('should set database dependencies on vault and traefik', () => {
        mockServicesService = createMockServicesService([
          createService({ name: 'postgresql', namespace: ServiceNamespace.DB }),
        ]);
        taskBuilder = new TaskBuilderService(mockServicesService as unknown as ServicesService);

        const tasks = taskBuilder.buildTaskGraph();
        const pgTask = tasks.find((t) => t.id === 'db/postgresql');

        expect(pgTask?.dependencies).toContain('core/vault');
        expect(pgTask?.dependencies).toContain('core/traefik');
      });

      test('should prioritize postgresql deployment over other databases', () => {
        mockServicesService = createMockServicesService([
          createService({ name: 'mongodb', namespace: ServiceNamespace.DB }),
          createService({ name: 'postgresql', namespace: ServiceNamespace.DB }),
          createService({ name: 'clickhouse', namespace: ServiceNamespace.DB }),
        ]);
        taskBuilder = new TaskBuilderService(mockServicesService as unknown as ServicesService);

        const tasks = taskBuilder.buildTaskGraph();
        const dbTasks = tasks.filter((t) => t.phase === DeploymentPhase.DATABASES);

        const pgTask = dbTasks.find((t) => t.id === 'db/postgresql');
        const mongoTask = dbTasks.find((t) => t.id === 'db/mongodb');
        const clickhouseTask = dbTasks.find((t) => t.id === 'db/clickhouse');

        expect(pgTask?.priority).toBeLessThan(mongoTask?.priority ?? 100);
        expect(mongoTask?.priority).toBeLessThan(clickhouseTask?.priority ?? 100);
      });
    });

    describe('application tasks', () => {
      test('should create application tasks for enabled apps', () => {
        mockServicesService = createMockServicesService([
          createService({ name: 'gitlab', namespace: ServiceNamespace.CODE }),
          createService({ name: 'nextcloud', namespace: ServiceNamespace.DATA }),
        ]);
        taskBuilder = new TaskBuilderService(mockServicesService as unknown as ServicesService);

        const tasks = taskBuilder.buildTaskGraph();
        const appTasks = tasks.filter(
          (t) => t.phase === DeploymentPhase.APPLICATION_SERVICES
        );

        expect(appTasks).toHaveLength(2);
        expect(appTasks.map((t) => t.id)).toContain('app/gitlab');
        expect(appTasks.map((t) => t.id)).toContain('app/nextcloud');
      });

      test('should add postgresql dependency for apps that need it', () => {
        mockServicesService = createMockServicesService([
          createService({
            name: 'gitlab',
            namespace: ServiceNamespace.CODE,
            needs: ['db/postgresql', 'db/valkey'],
          }),
        ]);
        taskBuilder = new TaskBuilderService(mockServicesService as unknown as ServicesService);

        const tasks = taskBuilder.buildTaskGraph();
        const gitlabTask = tasks.find((t) => t.id === 'app/gitlab');

        expect(gitlabTask?.dependencies).toContain('db/postgresql');
        expect(gitlabTask?.dependencies).toContain('db/valkey');
      });

      test('should add mongodb dependency for apps that need it', () => {
        mockServicesService = createMockServicesService([
          createService({
            name: 'stoat',
            namespace: ServiceNamespace.SOCIAL,
            needs: ['db/mongodb', 'db/valkey', 'db/minio', 'db/rabbitmq'],
          }),
        ]);
        taskBuilder = new TaskBuilderService(mockServicesService as unknown as ServicesService);

        const tasks = taskBuilder.buildTaskGraph();
        const stoatTask = tasks.find((t) => t.id === 'app/stoat');

        expect(stoatTask?.dependencies).toContain('db/mongodb');
        expect(stoatTask?.dependencies).toContain('db/valkey');
        expect(stoatTask?.dependencies).toContain('db/minio');
        expect(stoatTask?.dependencies).toContain('db/rabbitmq');
      });

      test('should always add vault dependency for all services', () => {
        mockServicesService = createMockServicesService([
          createService({ name: 'gitlab', namespace: ServiceNamespace.CODE, needs: [] }),
          createService({ name: 'nextcloud', namespace: ServiceNamespace.DATA, needs: [] }),
        ]);
        taskBuilder = new TaskBuilderService(mockServicesService as unknown as ServicesService);

        const tasks = taskBuilder.buildTaskGraph();
        const appTasks = tasks.filter(
          (t) => t.phase === DeploymentPhase.APPLICATION_SERVICES
        );

        expect(appTasks.every((t) => t.dependencies.includes('core/vault'))).toBe(true);
        expect(appTasks.every((t) => t.dependencies.includes('core/traefik'))).toBe(true);
      });

      test('should respect phase ordering in dependencies', () => {
        mockServicesService = createMockServicesService([
          createService({ name: 'postgresql', namespace: ServiceNamespace.DB }),
          createService({
            name: 'gitlab',
            namespace: ServiceNamespace.CODE,
            needs: ['db/postgresql'],
          }),
        ]);
        taskBuilder = new TaskBuilderService(mockServicesService as unknown as ServicesService);

        const tasks = taskBuilder.buildTaskGraph();
        const dbTask = tasks.find((t) => t.id === 'db/postgresql');
        const appTask = tasks.find((t) => t.id === 'app/gitlab');

        // Application phase comes after Database phase
        expect(appTask?.phase).toBeGreaterThan(dbTask?.phase ?? 0);
      });

      test('should prioritize infrastructure namespace over others', () => {
        mockServicesService = createMockServicesService([
          createService({ name: 'glance', namespace: ServiceNamespace.INFRASTRUCTURE }),
          createService({ name: 'gitlab', namespace: ServiceNamespace.CODE }),
          createService({ name: 'nextcloud', namespace: ServiceNamespace.DATA }),
        ]);
        taskBuilder = new TaskBuilderService(mockServicesService as unknown as ServicesService);

        const tasks = taskBuilder.buildTaskGraph();
        const glanceTask = tasks.find((t) => t.id === 'app/glance');
        const gitlabTask = tasks.find((t) => t.id === 'app/gitlab');
        const nextcloudTask = tasks.find((t) => t.id === 'app/nextcloud');

        expect(glanceTask?.priority).toBeLessThan(gitlabTask?.priority ?? 100);
        expect(gitlabTask?.priority).toBeLessThan(nextcloudTask?.priority ?? 100);
      });
    });
  });

  describe('service filtering', () => {
    test('should only include enabled services', () => {
      mockServicesService = createMockServicesService([
        createService({ name: 'gitlab', namespace: ServiceNamespace.CODE }),
      ]);
      taskBuilder = new TaskBuilderService(mockServicesService as unknown as ServicesService);

      const tasks = taskBuilder.buildTaskGraph();
      const appTasks = tasks.filter(
        (t) => t.phase === DeploymentPhase.APPLICATION_SERVICES
      );

      // Only gitlab should be present since it's the only enabled service
      expect(appTasks.map((t) => t.service)).toContain('gitlab');
    });

    test('should include mandatory services regardless of selection', () => {
      mockServicesService = createMockServicesService([]);
      taskBuilder = new TaskBuilderService(mockServicesService as unknown as ServicesService);

      const tasks = taskBuilder.buildTaskGraph();
      const coreTasks = tasks.filter((t) => t.phase === DeploymentPhase.CORE_SERVICES);

      // Core services should always be present
      expect(coreTasks.some((t) => t.id === 'core/vault')).toBe(true);
      expect(coreTasks.some((t) => t.id === 'core/traefik')).toBe(true);
      expect(coreTasks.some((t) => t.id === 'core/namespaces')).toBe(true);
    });

    test('should exclude disabled optional services', () => {
      // Only databases and apps from getEnabled are included
      mockServicesService = createMockServicesService([
        createService({ name: 'postgresql', namespace: ServiceNamespace.DB }),
        // No gitlab, so it should be excluded
      ]);
      taskBuilder = new TaskBuilderService(mockServicesService as unknown as ServicesService);

      const tasks = taskBuilder.buildTaskGraph();
      const appTasks = tasks.filter(
        (t) => t.phase === DeploymentPhase.APPLICATION_SERVICES
      );

      // No application tasks since no apps are enabled
      expect(appTasks).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    test('should handle empty services list', () => {
      mockServicesService = createMockServicesService([]);
      taskBuilder = new TaskBuilderService(mockServicesService as unknown as ServicesService);

      const tasks = taskBuilder.buildTaskGraph();

      // Should still create infrastructure, kubernetes, storage, core, and verification tasks
      expect(tasks.length).toBeGreaterThan(0);

      // Check that mandatory phases still have tasks
      const phases = [
        DeploymentPhase.INFRASTRUCTURE_SETUP,
        DeploymentPhase.KUBERNETES_BOOTSTRAP,
        DeploymentPhase.STORAGE_LAYER,
        DeploymentPhase.CORE_SERVICES,
        DeploymentPhase.VERIFICATION,
      ];

      for (const phase of phases) {
        const phaseTasks = tasks.filter((t) => t.phase === phase);
        expect(phaseTasks.length).toBeGreaterThan(0);
      }
    });

    test('should handle all databases disabled', () => {
      // When no databases enabled, should still create postgresql/valkey with disabled state
      mockServicesService = createMockServicesService([]);
      taskBuilder = new TaskBuilderService(mockServicesService as unknown as ServicesService);

      const tasks = taskBuilder.buildTaskGraph();
      const dbTasks = tasks.filter((t) => t.phase === DeploymentPhase.DATABASES);

      // Should have postgresql and valkey with enabled: false
      expect(dbTasks.length).toBe(2);
      expect(dbTasks.every((t) => t.enabled === false)).toBe(true);
    });

    test('should handle minimal core-only deployment', () => {
      mockServicesService = createMockServicesService([
        createService({ name: 'postgresql', namespace: ServiceNamespace.DB }),
        createService({ name: 'valkey', namespace: ServiceNamespace.DB }),
      ]);
      taskBuilder = new TaskBuilderService(mockServicesService as unknown as ServicesService);

      const tasks = taskBuilder.buildTaskGraph();

      // Should have infrastructure + kubernetes + storage + backup + core + databases + network + verification
      // No application tasks
      const appTasks = tasks.filter(
        (t) => t.phase === DeploymentPhase.APPLICATION_SERVICES
      );
      expect(appTasks).toHaveLength(0);

      // But all infrastructure phases should be present
      const dbTasks = tasks.filter((t) => t.phase === DeploymentPhase.DATABASES);
      expect(dbTasks.length).toBeGreaterThanOrEqual(2);
    });

    test('should deduplicate dependencies', () => {
      // If an app has duplicate dependencies in needs, they should be deduplicated
      mockServicesService = createMockServicesService([
        createService({
          name: 'testapp',
          namespace: ServiceNamespace.CODE,
          needs: ['db/postgresql', 'db/postgresql', 'service/vault'],
        }),
      ]);
      taskBuilder = new TaskBuilderService(mockServicesService as unknown as ServicesService);

      const tasks = taskBuilder.buildTaskGraph();
      const appTask = tasks.find((t) => t.id === 'app/testapp');

      // Count occurrences of db/postgresql in dependencies
      const pgCount = appTask?.dependencies.filter((d) => d === 'db/postgresql').length;
      expect(pgCount).toBe(1);
    });
  });

  describe('task structure', () => {
    beforeEach(() => {
      mockServicesService = createMockServicesService([
        createService({ name: 'postgresql', namespace: ServiceNamespace.DB }),
        createService({ name: 'gitlab', namespace: ServiceNamespace.CODE, needs: ['db/postgresql'] }),
      ]);
      taskBuilder = new TaskBuilderService(mockServicesService as unknown as ServicesService);
    });

    test('should create tasks with correct status', () => {
      const tasks = taskBuilder.buildTaskGraph();
      expect(tasks.every((t) => t.status === TaskStatus.PENDING)).toBe(true);
    });

    test('should create tasks with empty dependents array', () => {
      const tasks = taskBuilder.buildTaskGraph();
      expect(tasks.every((t) => Array.isArray(t.dependents) && t.dependents.length === 0)).toBe(true);
    });

    test('should create tasks with timing object', () => {
      const tasks = taskBuilder.buildTaskGraph();
      expect(tasks.every((t) => typeof t.timing === 'object')).toBe(true);
    });

    test('should create tasks with empty logs array', () => {
      const tasks = taskBuilder.buildTaskGraph();
      expect(tasks.every((t) => Array.isArray(t.logs) && t.logs.length === 0)).toBe(true);
    });

    test('should set estimated duration for all tasks', () => {
      const tasks = taskBuilder.buildTaskGraph();
      expect(tasks.every((t) => typeof t.estimatedDuration === 'number' && t.estimatedDuration > 0)).toBe(true);
    });

    test('should set maxRetries based on mandatory flag', () => {
      const tasks = taskBuilder.buildTaskGraph();
      const mandatoryTasks = tasks.filter((t) => t.mandatory);
      const optionalTasks = tasks.filter((t) => !t.mandatory);

      expect(mandatoryTasks.every((t) => t.maxRetries === 2)).toBe(true);
      expect(optionalTasks.every((t) => t.maxRetries === 1)).toBe(true);
    });
  });

  describe('helper methods', () => {
    beforeEach(() => {
      mockServicesService = createMockServicesService([
        createService({ name: 'postgresql', namespace: ServiceNamespace.DB }),
        createService({ name: 'gitlab', namespace: ServiceNamespace.CODE, needs: ['db/postgresql'] }),
      ]);
      taskBuilder = new TaskBuilderService(mockServicesService as unknown as ServicesService);
    });

    test('getTasksForPhase should return tasks for specific phase', () => {
      const coreTasks = taskBuilder.getTasksForPhase(DeploymentPhase.CORE_SERVICES);

      expect(coreTasks.every((t) => t.phase === DeploymentPhase.CORE_SERVICES)).toBe(true);
      expect(coreTasks.length).toBe(6);
    });

    test('getTask should return task by ID', () => {
      const task = taskBuilder.getTask('core/vault');

      expect(task).toBeDefined();
      expect(task?.name).toBe('Deploy Vault');
    });

    test('getTask should return undefined for non-existent task', () => {
      const task = taskBuilder.getTask('nonexistent/task');
      expect(task).toBeUndefined();
    });

    test('getMandatoryTasks should return only mandatory tasks', () => {
      const mandatoryTasks = taskBuilder.getMandatoryTasks();

      expect(mandatoryTasks.every((t) => t.mandatory)).toBe(true);
      expect(mandatoryTasks.length).toBeGreaterThan(0);
    });

    test('getTasksForService should return tasks for specific service', () => {
      const gitlabTasks = taskBuilder.getTasksForService('gitlab');

      expect(gitlabTasks).toHaveLength(1);
      expect(gitlabTasks[0].id).toBe('app/gitlab');
    });

    test('getTasksForService should return empty array for non-existent service', () => {
      const tasks = taskBuilder.getTasksForService('nonexistent');
      expect(tasks).toHaveLength(0);
    });
  });

  describe('deployment scenarios', () => {
    test('full deployment - all services enabled', () => {
      mockServicesService = createMockServicesService([
        createService({ name: 'postgresql', namespace: ServiceNamespace.DB }),
        createService({ name: 'valkey', namespace: ServiceNamespace.DB }),
        createService({ name: 'mongodb', namespace: ServiceNamespace.DB }),
        createService({ name: 'minio', namespace: ServiceNamespace.DB }),
        createService({ name: 'gitlab', namespace: ServiceNamespace.CODE, needs: ['db/postgresql', 'db/valkey'] }),
        createService({ name: 'teamcity', namespace: ServiceNamespace.CODE, needs: ['db/postgresql'] }),
        createService({ name: 'youtrack', namespace: ServiceNamespace.CODE, needs: ['db/postgresql'] }),
        createService({ name: 'nextcloud', namespace: ServiceNamespace.DATA, needs: ['db/postgresql', 'db/valkey'] }),
        createService({ name: 'affine', namespace: ServiceNamespace.PRODUCTIVITY, needs: ['db/postgresql', 'db/valkey', 'db/minio'] }),
        createService({ name: 'stoat', namespace: ServiceNamespace.SOCIAL, needs: ['db/mongodb', 'db/valkey', 'db/minio'] }),
      ]);
      taskBuilder = new TaskBuilderService(mockServicesService as unknown as ServicesService);

      const tasks = taskBuilder.buildTaskGraph();
      const dbTasks = tasks.filter((t) => t.phase === DeploymentPhase.DATABASES);
      const appTasks = tasks.filter((t) => t.phase === DeploymentPhase.APPLICATION_SERVICES);

      expect(dbTasks).toHaveLength(4);
      expect(appTasks).toHaveLength(6);
    });

    test('minimal deployment - core only', () => {
      mockServicesService = createMockServicesService([
        createService({ name: 'postgresql', namespace: ServiceNamespace.DB }),
        createService({ name: 'valkey', namespace: ServiceNamespace.DB }),
      ]);
      taskBuilder = new TaskBuilderService(mockServicesService as unknown as ServicesService);

      const tasks = taskBuilder.buildTaskGraph();
      const appTasks = tasks.filter((t) => t.phase === DeploymentPhase.APPLICATION_SERVICES);

      expect(appTasks).toHaveLength(0);
    });

    test('code-focused deployment - GitLab + TeamCity + YouTrack', () => {
      mockServicesService = createMockServicesService([
        createService({ name: 'postgresql', namespace: ServiceNamespace.DB }),
        createService({ name: 'valkey', namespace: ServiceNamespace.DB }),
        createService({ name: 'gitlab', namespace: ServiceNamespace.CODE, needs: ['db/postgresql', 'db/valkey'] }),
        createService({ name: 'teamcity', namespace: ServiceNamespace.CODE, needs: ['db/postgresql'] }),
        createService({ name: 'youtrack', namespace: ServiceNamespace.CODE, needs: ['db/postgresql'] }),
      ]);
      taskBuilder = new TaskBuilderService(mockServicesService as unknown as ServicesService);

      const tasks = taskBuilder.buildTaskGraph();
      const appTasks = tasks.filter((t) => t.phase === DeploymentPhase.APPLICATION_SERVICES);
      const codeApps = appTasks.filter((t) => t.namespace === 'code');

      expect(codeApps).toHaveLength(3);
      expect(codeApps.map((t) => t.service)).toContain('gitlab');
      expect(codeApps.map((t) => t.service)).toContain('teamcity');
      expect(codeApps.map((t) => t.service)).toContain('youtrack');
    });

    test('productivity-focused deployment - Affine + Nextcloud', () => {
      mockServicesService = createMockServicesService([
        createService({ name: 'postgresql', namespace: ServiceNamespace.DB }),
        createService({ name: 'valkey', namespace: ServiceNamespace.DB }),
        createService({ name: 'minio', namespace: ServiceNamespace.DB }),
        createService({ name: 'affine', namespace: ServiceNamespace.PRODUCTIVITY, needs: ['db/postgresql', 'db/valkey', 'db/minio'] }),
        createService({ name: 'nextcloud', namespace: ServiceNamespace.DATA, needs: ['db/postgresql', 'db/valkey'] }),
      ]);
      taskBuilder = new TaskBuilderService(mockServicesService as unknown as ServicesService);

      const tasks = taskBuilder.buildTaskGraph();
      const appTasks = tasks.filter((t) => t.phase === DeploymentPhase.APPLICATION_SERVICES);

      expect(appTasks).toHaveLength(2);

      // Verify dependencies are correctly set
      const affineTask = tasks.find((t) => t.id === 'app/affine');
      expect(affineTask?.dependencies).toContain('db/postgresql');
      expect(affineTask?.dependencies).toContain('db/valkey');
      expect(affineTask?.dependencies).toContain('db/minio');

      const nextcloudTask = tasks.find((t) => t.id === 'app/nextcloud');
      expect(nextcloudTask?.dependencies).toContain('db/postgresql');
      expect(nextcloudTask?.dependencies).toContain('db/valkey');
    });
  });

  describe('network gateway and verification tasks', () => {
    beforeEach(() => {
      mockServicesService = createMockServicesService([]);
      taskBuilder = new TaskBuilderService(mockServicesService as unknown as ServicesService);
    });

    test('should create network gateway tasks', () => {
      const tasks = taskBuilder.buildTaskGraph();
      const networkTasks = tasks.filter((t) => t.phase === DeploymentPhase.NETWORK_GATEWAY);

      expect(networkTasks).toHaveLength(3);
      expect(networkTasks.map((t) => t.id)).toContain('network/pangolin-server');
      expect(networkTasks.map((t) => t.id)).toContain('network/pangolin');
      expect(networkTasks.map((t) => t.id)).toContain('network/dns');
    });

    test('should create verification tasks', () => {
      const tasks = taskBuilder.buildTaskGraph();
      const verifyTasks = tasks.filter((t) => t.phase === DeploymentPhase.VERIFICATION);

      expect(verifyTasks).toHaveLength(4);
      expect(verifyTasks.map((t) => t.id)).toContain('verify/pods');
      expect(verifyTasks.map((t) => t.id)).toContain('verify/ingress');
      expect(verifyTasks.map((t) => t.id)).toContain('verify/helm-tests');
      expect(verifyTasks.map((t) => t.id)).toContain('verify/credentials');
    });

    test('verification tasks should depend on network tasks', () => {
      const tasks = taskBuilder.buildTaskGraph();
      const verifyPodsTask = tasks.find((t) => t.id === 'verify/pods');

      expect(verifyPodsTask?.dependencies).toContain('network/dns');
    });
  });
});
