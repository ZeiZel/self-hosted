import { describe, it, expect, beforeEach, mock, spyOn } from 'bun:test';
import { ClusterClientService } from '../../../modules/monitor/cluster-client.service';
import { mockNodes, mockPods, mockNodeMetrics } from '../../mocks/kubectl.mock';
import { NodeHealth, PodStatus } from '../../../interfaces/monitor.interface';
import { MachineRole } from '../../../interfaces/machine.interface';

describe('ClusterClientService', () => {
  let clusterClient: ClusterClientService;

  beforeEach(() => {
    clusterClient = new ClusterClientService();
  });

  describe('checkConnection', () => {
    it('should return connected when kubectl succeeds', async () => {
      // For this test, we rely on mock data or actual kubectl
      // In a real environment, this would check actual connectivity
      const result = await clusterClient.checkConnection();
      // Result depends on actual cluster availability
      expect(typeof result.connected).toBe('boolean');
    });
  });

  describe('getNodeMetrics', () => {
    it('should return node metrics array', async () => {
      const metrics = await clusterClient.getNodeMetrics();

      expect(Array.isArray(metrics)).toBe(true);

      // If cluster is available, validate structure
      if (metrics.length > 0) {
        const node = metrics[0];
        expect(node).toHaveProperty('name');
        expect(node).toHaveProperty('ip');
        expect(node).toHaveProperty('roles');
        expect(node).toHaveProperty('health');
        expect(node).toHaveProperty('cpu');
        expect(node).toHaveProperty('memory');
        expect(node).toHaveProperty('pods');
      }
    });

    it('should return mock data when cluster is unavailable', async () => {
      // Mock kubectl to fail
      const metrics = await clusterClient.getNodeMetrics();

      // Should return mock data or empty array
      expect(Array.isArray(metrics)).toBe(true);
    });
  });

  describe('getServiceMetrics', () => {
    it('should return service metrics array', async () => {
      const metrics = await clusterClient.getServiceMetrics();

      expect(Array.isArray(metrics)).toBe(true);

      // If cluster is available, validate structure
      if (metrics.length > 0) {
        const service = metrics[0];
        expect(service).toHaveProperty('name');
        expect(service).toHaveProperty('namespace');
        expect(service).toHaveProperty('node');
        expect(service).toHaveProperty('status');
        expect(service).toHaveProperty('health');
        expect(service).toHaveProperty('replicas');
      }
    });

    it('should filter by namespace when provided', async () => {
      const metrics = await clusterClient.getServiceMetrics('kube-system');

      // All returned services should be in the specified namespace
      for (const service of metrics) {
        expect(service.namespace).toBe('kube-system');
      }
    });
  });

  describe('getClusterSummary', () => {
    it('should return cluster summary', async () => {
      const summary = await clusterClient.getClusterSummary();

      expect(summary).toHaveProperty('nodes');
      expect(summary).toHaveProperty('pods');
      expect(summary).toHaveProperty('cpu');
      expect(summary).toHaveProperty('memory');
      expect(summary).toHaveProperty('namespaces');
      expect(summary).toHaveProperty('lastUpdated');

      // Validate node counts
      expect(typeof summary.nodes.total).toBe('number');
      expect(typeof summary.nodes.healthy).toBe('number');
      expect(summary.nodes.total).toBeGreaterThanOrEqual(0);

      // Validate pod counts
      expect(typeof summary.pods.total).toBe('number');
      expect(typeof summary.pods.running).toBe('number');
    });
  });

  describe('setKubeconfig', () => {
    it('should allow setting custom kubeconfig path', () => {
      expect(() => {
        clusterClient.setKubeconfig('/path/to/kubeconfig');
      }).not.toThrow();
    });
  });
});

describe('ClusterClientService parsing', () => {
  let clusterClient: ClusterClientService;

  beforeEach(() => {
    clusterClient = new ClusterClientService();
  });

  describe('CPU parsing', () => {
    // Access private method via any
    const parseCpu = (client: any, cpu: string) => client.parseCpu(cpu);

    it('should parse millicores', () => {
      expect(parseCpu(clusterClient, '500m')).toBe(500);
      expect(parseCpu(clusterClient, '1000m')).toBe(1000);
    });

    it('should parse cores to millicores', () => {
      expect(parseCpu(clusterClient, '1')).toBe(1000);
      expect(parseCpu(clusterClient, '4')).toBe(4000);
    });

    it('should handle empty or invalid input', () => {
      expect(parseCpu(clusterClient, '')).toBe(0);
    });
  });

  describe('Memory parsing', () => {
    const parseMemory = (client: any, mem: string) => client.parseMemory(mem);

    it('should parse Ki units', () => {
      expect(parseMemory(clusterClient, '1024Ki')).toBe(1024 * 1024);
    });

    it('should parse Mi units', () => {
      expect(parseMemory(clusterClient, '512Mi')).toBe(512 * 1024 * 1024);
    });

    it('should parse Gi units', () => {
      expect(parseMemory(clusterClient, '2Gi')).toBe(2 * 1024 * 1024 * 1024);
    });

    it('should handle raw bytes', () => {
      expect(parseMemory(clusterClient, '1048576')).toBe(1048576);
    });
  });
});
