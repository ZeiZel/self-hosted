import { describe, test, expect } from 'bun:test';
import {
  mockNodes,
  mockPods,
  mockNodeMetrics,
  mockNamespaces,
  mockKubectlResponses,
  createMockClusterClient,
} from '../../mocks/kubectl.mock';
import {
  createTestDatabase,
  seedTestData,
  createMockDatabaseService,
} from '../../mocks/database.mock';
import {
  mockConsulState,
  mockPrometheusState,
  mockVaultState,
  mockTraefikState,
  createMockConsulClient,
  createMockPrometheusClient,
  createMockVaultClient,
  createMockTraefikClient,
} from '../../mocks/api.mock';
import { NodeHealth, PodStatus } from '../../../interfaces/monitor.interface';
import { ApiHealthStatus } from '../../../modules/monitor/apis/interfaces/api.interface';

describe('kubectl mocks', () => {
  describe('mockNodes', () => {
    test('contains expected number of nodes', () => {
      expect(mockNodes.items).toHaveLength(3);
    });

    test('contains master and worker nodes', () => {
      const master = mockNodes.items.find((n) =>
        n.metadata.labels['node-role.kubernetes.io/control-plane'] !== undefined,
      );
      const workers = mockNodes.items.filter(
        (n) => n.metadata.labels['node-role.kubernetes.io/worker'] !== undefined,
      );

      expect(master).toBeDefined();
      expect(workers).toHaveLength(2);
    });

    test('nodes have valid structure', () => {
      for (const node of mockNodes.items) {
        expect(node.metadata.name).toBeDefined();
        expect(node.status.capacity.cpu).toBeDefined();
        expect(node.status.capacity.memory).toBeDefined();
        expect(node.status.addresses).toBeDefined();
        expect(node.status.conditions).toBeDefined();
      }
    });
  });

  describe('mockPods', () => {
    test('contains expected pods', () => {
      expect(mockPods.items).toHaveLength(4);
    });

    test('pods have required fields', () => {
      for (const pod of mockPods.items) {
        expect(pod.metadata.name).toBeDefined();
        expect(pod.metadata.namespace).toBeDefined();
        expect(pod.spec.nodeName).toBeDefined();
        expect(pod.status.phase).toBeDefined();
      }
    });

    test('contains failing pod for testing', () => {
      const failingPod = mockPods.items.find((p) =>
        p.status.containerStatuses?.[0]?.state?.waiting?.reason === 'CrashLoopBackOff',
      );
      expect(failingPod).toBeDefined();
      expect(failingPod!.status.containerStatuses[0].restartCount).toBeGreaterThan(10);
    });
  });

  describe('mockNodeMetrics', () => {
    test('contains metrics for all nodes', () => {
      const lines = mockNodeMetrics.trim().split('\n');
      expect(lines).toHaveLength(3);
    });

    test('metrics have correct format', () => {
      const lines = mockNodeMetrics.trim().split('\n');
      for (const line of lines) {
        const parts = line.split(/\s+/);
        expect(parts.length).toBeGreaterThanOrEqual(5);
      }
    });
  });

  describe('mockNamespaces', () => {
    test('contains expected namespaces', () => {
      const names = mockNamespaces.items.map((n) => n.metadata.name);
      expect(names).toContain('ingress');
      expect(names).toContain('service');
      expect(names).toContain('db');
      expect(names).toContain('code');
    });
  });

  describe('mockKubectlResponses', () => {
    test('has response for cluster-info', () => {
      expect(mockKubectlResponses['cluster-info']).toBeDefined();
      expect(mockKubectlResponses['cluster-info'].code).toBe(0);
    });

    test('has response for get nodes', () => {
      expect(mockKubectlResponses['get nodes -o json']).toBeDefined();
    });

    test('has response for get pods', () => {
      expect(mockKubectlResponses['get pods -A -o json']).toBeDefined();
    });
  });

  describe('createMockClusterClient', () => {
    test('returns mock client with all methods', () => {
      const client = createMockClusterClient();

      expect(client.checkConnection).toBeDefined();
      expect(client.getNodeMetrics).toBeDefined();
      expect(client.getServiceMetrics).toBeDefined();
      expect(client.getClusterSummary).toBeDefined();
    });

    test('checkConnection returns connected', async () => {
      const client = createMockClusterClient();
      const result = await client.checkConnection();
      expect(result.connected).toBe(true);
    });

    test('getNodeMetrics returns mock nodes', async () => {
      const client = createMockClusterClient();
      const nodes = await client.getNodeMetrics();

      expect(nodes).toHaveLength(2);
      expect(nodes[0].name).toBe('master-01');
      expect(nodes[0].health).toBe(NodeHealth.HEALTHY);
    });

    test('getServiceMetrics returns mock services', async () => {
      const client = createMockClusterClient();
      const services = await client.getServiceMetrics();

      expect(services).toHaveLength(2);
      expect(services[0].name).toBe('traefik');
      expect(services[0].status).toBe(PodStatus.RUNNING);
    });

    test('getClusterSummary returns mock summary', async () => {
      const client = createMockClusterClient();
      const summary = await client.getClusterSummary();

      expect(summary.nodes.total).toBe(3);
      expect(summary.nodes.healthy).toBe(2);
      expect(summary.nodes.warning).toBe(1);
    });
  });
});

describe('database mocks', () => {
  describe('createTestDatabase', () => {
    test('creates in-memory database', () => {
      const db = createTestDatabase();
      expect(db).toBeDefined();

      // Verify schema
      const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all();
      const tableNames = tables.map((t: any) => t.name);

      expect(tableNames).toContain('machines');
      expect(tableNames).toContain('deployments');
      expect(tableNames).toContain('service_configs');
      expect(tableNames).toContain('metrics');
    });
  });

  describe('seedTestData', () => {
    test('seeds machines', () => {
      const db = createTestDatabase();
      seedTestData(db);

      const machines = db.query('SELECT * FROM machines').all();
      expect(machines.length).toBeGreaterThanOrEqual(2);
    });

    test('seeds service configs', () => {
      const db = createTestDatabase();
      seedTestData(db);

      const configs = db.query('SELECT * FROM service_configs').all();
      expect(configs.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('createMockDatabaseService', () => {
    test('returns mock service with all methods', () => {
      const service = createMockDatabaseService();

      expect(service.getConnection).toBeDefined();
      expect(service.exec).toBeDefined();
      expect(service.prepare).toBeDefined();
      expect(service.query).toBeDefined();
      expect(service.queryOne).toBeDefined();
      expect(service.transaction).toBeDefined();
    });

    test('query returns results', () => {
      const db = createTestDatabase();
      seedTestData(db);
      const service = createMockDatabaseService(db);

      const results = service.query<{ label: string }>('SELECT label FROM machines');
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    test('queryOne returns single result', () => {
      const db = createTestDatabase();
      seedTestData(db);
      const service = createMockDatabaseService(db);

      const result = service.queryOne<{ label: string }>("SELECT label FROM machines WHERE id = 'machine-1'");
      expect(result?.label).toBe('master-01');
    });

    test('transaction commits on success', () => {
      const db = createTestDatabase();
      const service = createMockDatabaseService(db);

      service.transaction(() => {
        service.exec("INSERT INTO machines (id, label, ip, roles, status, ssh_host, ssh_port, ssh_username, created_at, updated_at) VALUES ('test', 'test-machine', '10.0.0.1', '[]', 'online', '10.0.0.1', 22, 'root', datetime(), datetime())");
      });

      const result = service.queryOne<{ label: string }>("SELECT label FROM machines WHERE id = 'test'");
      expect(result?.label).toBe('test-machine');
    });

    test('transaction rolls back on error', () => {
      const db = createTestDatabase();
      seedTestData(db);
      const service = createMockDatabaseService(db);

      expect(() => {
        service.transaction(() => {
          service.exec("INSERT INTO machines (id, label, ip, roles, status, ssh_host, ssh_port, ssh_username, created_at, updated_at) VALUES ('new', 'new-machine', '10.0.0.2', '[]', 'online', '10.0.0.2', 22, 'root', datetime(), datetime())");
          // This will fail due to duplicate label
          service.exec("INSERT INTO machines (id, label, ip, roles, status, ssh_host, ssh_port, ssh_username, created_at, updated_at) VALUES ('new2', 'master-01', '10.0.0.3', '[]', 'online', '10.0.0.3', 22, 'root', datetime(), datetime())");
        });
      }).toThrow();

      // new-machine should not exist due to rollback
      const result = service.queryOne<{ label: string }>("SELECT label FROM machines WHERE id = 'new'");
      expect(result).toBeNull();
    });
  });
});

describe('API mocks', () => {
  describe('mockConsulState', () => {
    test('has expected structure', () => {
      expect(mockConsulState.available).toBe(true);
      expect(mockConsulState.leader).toBeDefined();
      expect(mockConsulState.services).toBeDefined();
      expect(mockConsulState.healthChecks).toBeDefined();
    });

    test('contains services', () => {
      expect(mockConsulState.services.length).toBeGreaterThan(0);
      const traefik = mockConsulState.services.find((s) => s.name === 'traefik');
      expect(traefik).toBeDefined();
    });
  });

  describe('mockPrometheusState', () => {
    test('has expected structure', () => {
      expect(mockPrometheusState.available).toBe(true);
      expect(mockPrometheusState.alerts).toBeDefined();
      expect(mockPrometheusState.firingAlerts).toBeGreaterThanOrEqual(0);
    });

    test('contains alerts', () => {
      expect(mockPrometheusState.alerts.length).toBeGreaterThan(0);
    });
  });

  describe('mockVaultState', () => {
    test('has expected structure', () => {
      expect(mockVaultState.available).toBe(true);
      expect(mockVaultState.status).toBeDefined();
      expect(mockVaultState.status.initialized).toBe(true);
      expect(mockVaultState.status.sealed).toBe(false);
    });
  });

  describe('mockTraefikState', () => {
    test('has expected structure', () => {
      expect(mockTraefikState.available).toBe(true);
      expect(mockTraefikState.overview).toBeDefined();
      expect(mockTraefikState.routers).toBeDefined();
      expect(mockTraefikState.services).toBeDefined();
    });

    test('contains routers', () => {
      expect(mockTraefikState.routers.length).toBeGreaterThan(0);
    });
  });

  describe('createMockConsulClient', () => {
    test('returns mock with all methods', () => {
      const client = createMockConsulClient();
      expect(client.checkHealth).toBeDefined();
      expect(client.getLeader).toBeDefined();
      expect(client.listServices).toBeDefined();
      expect(client.getState).toBeDefined();
    });

    test('checkHealth returns healthy', async () => {
      const client = createMockConsulClient();
      const result = await client.checkHealth();
      expect(result.status).toBe(ApiHealthStatus.HEALTHY);
    });
  });

  describe('createMockPrometheusClient', () => {
    test('returns mock with all methods', () => {
      const client = createMockPrometheusClient();
      expect(client.checkHealth).toBeDefined();
      expect(client.getAlerts).toBeDefined();
      expect(client.getFiringAlerts).toBeDefined();
      expect(client.getState).toBeDefined();
    });

    test('getFiringAlerts returns only firing alerts', async () => {
      const client = createMockPrometheusClient();
      const alerts = await client.getFiringAlerts();
      expect(alerts.every((a) => a.state === 'firing')).toBe(true);
    });
  });

  describe('createMockVaultClient', () => {
    test('returns mock with all methods', () => {
      const client = createMockVaultClient();
      expect(client.checkHealth).toBeDefined();
      expect(client.getSealStatus).toBeDefined();
      expect(client.isUnsealed).toBeDefined();
      expect(client.isInitialized).toBeDefined();
    });

    test('isUnsealed returns true', async () => {
      const client = createMockVaultClient();
      expect(await client.isUnsealed()).toBe(true);
    });

    test('isInitialized returns true', async () => {
      const client = createMockVaultClient();
      expect(await client.isInitialized()).toBe(true);
    });
  });

  describe('createMockTraefikClient', () => {
    test('returns mock with all methods', () => {
      const client = createMockTraefikClient();
      expect(client.checkHealth).toBeDefined();
      expect(client.getOverview).toBeDefined();
      expect(client.getHttpRouters).toBeDefined();
      expect(client.getHttpServices).toBeDefined();
    });
  });
});
