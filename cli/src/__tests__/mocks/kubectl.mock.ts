/**
 * Mock kubectl responses for testing
 */

import { NodeHealth, PodStatus } from '../../interfaces/monitor.interface';
import { MachineRole } from '../../interfaces/machine.interface';

/**
 * Mock node data
 */
export const mockNodes = {
  items: [
    {
      metadata: {
        name: 'master-01',
        labels: {
          'node-role.kubernetes.io/control-plane': '',
        },
      },
      status: {
        capacity: {
          cpu: '8',
          memory: '16Gi',
        },
        addresses: [{ type: 'InternalIP', address: '192.168.1.10' }],
        conditions: [{ type: 'Ready', status: 'True' }],
      },
    },
    {
      metadata: {
        name: 'worker-01',
        labels: {
          'node-role.kubernetes.io/worker': '',
        },
      },
      status: {
        capacity: {
          cpu: '16',
          memory: '32Gi',
        },
        addresses: [{ type: 'InternalIP', address: '192.168.1.11' }],
        conditions: [{ type: 'Ready', status: 'True' }],
      },
    },
    {
      metadata: {
        name: 'worker-02',
        labels: {
          'node-role.kubernetes.io/worker': '',
        },
      },
      status: {
        capacity: {
          cpu: '16',
          memory: '32Gi',
        },
        addresses: [{ type: 'InternalIP', address: '192.168.1.12' }],
        conditions: [{ type: 'Ready', status: 'True' }],
      },
    },
  ],
};

/**
 * Mock pod data
 */
export const mockPods = {
  items: [
    {
      metadata: {
        name: 'traefik-abc123',
        namespace: 'ingress',
        labels: {
          'app.kubernetes.io/name': 'traefik',
        },
        creationTimestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
      spec: {
        nodeName: 'master-01',
        containers: [
          {
            resources: {
              requests: { cpu: '500m', memory: '128Mi' },
              limits: { cpu: '1000m', memory: '512Mi' },
            },
          },
        ],
      },
      status: {
        phase: 'Running',
        containerStatuses: [{ ready: true, restartCount: 0 }],
      },
    },
    {
      metadata: {
        name: 'postgresql-0',
        namespace: 'db',
        labels: {
          'app.kubernetes.io/name': 'postgresql',
        },
        creationTimestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      spec: {
        nodeName: 'worker-01',
        containers: [
          {
            resources: {
              requests: { cpu: '2000m', memory: '2Gi' },
              limits: { cpu: '4000m', memory: '4Gi' },
            },
          },
        ],
      },
      status: {
        phase: 'Running',
        containerStatuses: [{ ready: true, restartCount: 0 }],
      },
    },
    {
      metadata: {
        name: 'gitlab-abc123',
        namespace: 'code',
        labels: {
          'app.kubernetes.io/name': 'gitlab',
        },
        creationTimestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      },
      spec: {
        nodeName: 'worker-01',
        containers: [
          {
            resources: {
              requests: { cpu: '4000m', memory: '4Gi' },
              limits: { cpu: '8000m', memory: '8Gi' },
            },
          },
        ],
      },
      status: {
        phase: 'Running',
        containerStatuses: [{ ready: true, restartCount: 2 }],
      },
    },
    {
      metadata: {
        name: 'failing-pod-xyz',
        namespace: 'test',
        labels: {
          'app.kubernetes.io/name': 'failing-app',
        },
        creationTimestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      },
      spec: {
        nodeName: 'worker-02',
        containers: [
          {
            resources: {
              requests: { cpu: '100m', memory: '64Mi' },
              limits: { cpu: '200m', memory: '128Mi' },
            },
          },
        ],
      },
      status: {
        phase: 'Running',
        containerStatuses: [
          {
            ready: false,
            restartCount: 15,
            state: {
              waiting: { reason: 'CrashLoopBackOff' },
            },
          },
        ],
      },
    },
  ],
};

/**
 * Mock node metrics (kubectl top nodes output)
 */
export const mockNodeMetrics = `master-01   234m   3%    1234Mi  8%
worker-01   12000m  75%   28000Mi 87%
worker-02   8000m   50%   16000Mi 50%`;

/**
 * Mock namespaces
 */
export const mockNamespaces = {
  items: [
    { metadata: { name: 'default' } },
    { metadata: { name: 'kube-system' } },
    { metadata: { name: 'ingress' } },
    { metadata: { name: 'service' } },
    { metadata: { name: 'db' } },
    { metadata: { name: 'code' } },
    { metadata: { name: 'productivity' } },
    { metadata: { name: 'social' } },
    { metadata: { name: 'data' } },
    { metadata: { name: 'infrastructure' } },
    { metadata: { name: 'automation' } },
  ],
};

/**
 * Mock kubectl response map
 */
export const mockKubectlResponses: Record<
  string,
  { stdout: string; stderr: string; code: number }
> = {
  'cluster-info': {
    stdout: 'Kubernetes control plane is running at https://192.168.1.10:6443',
    stderr: '',
    code: 0,
  },
  'get nodes -o json': {
    stdout: JSON.stringify(mockNodes),
    stderr: '',
    code: 0,
  },
  'get pods -A -o json': {
    stdout: JSON.stringify(mockPods),
    stderr: '',
    code: 0,
  },
  'top nodes --no-headers': {
    stdout: mockNodeMetrics,
    stderr: '',
    code: 0,
  },
  'get namespaces -o json': {
    stdout: JSON.stringify(mockNamespaces),
    stderr: '',
    code: 0,
  },
};

/**
 * Create a mock ClusterClientService
 */
export function createMockClusterClient() {
  return {
    checkConnection: async () => ({ connected: true }),
    getNodeMetrics: async () => [
      {
        name: 'master-01',
        ip: '192.168.1.10',
        roles: [MachineRole.MASTER],
        health: NodeHealth.HEALTHY,
        cpu: { total: 8000, used: 234, percent: 3 },
        memory: { total: 16 * 1024 * 1024 * 1024, used: 1234 * 1024 * 1024, percent: 8 },
        pods: { total: 15, running: 14, pending: 1, failed: 0 },
        conditions: [{ type: 'Ready', status: 'True' as const }],
        lastUpdated: new Date().toISOString(),
      },
      {
        name: 'worker-01',
        ip: '192.168.1.11',
        roles: [MachineRole.WORKER],
        health: NodeHealth.WARNING,
        cpu: { total: 16000, used: 12000, percent: 75 },
        memory: { total: 32 * 1024 * 1024 * 1024, used: 28 * 1024 * 1024 * 1024, percent: 87 },
        pods: { total: 25, running: 23, pending: 0, failed: 2 },
        conditions: [{ type: 'Ready', status: 'True' as const }],
        lastUpdated: new Date().toISOString(),
      },
    ],
    getServiceMetrics: async () => [
      {
        name: 'traefik',
        namespace: 'ingress',
        node: 'master-01',
        status: PodStatus.RUNNING,
        health: NodeHealth.HEALTHY,
        replicas: { desired: 1, ready: 1, available: 1 },
        cpu: { requested: 500, limit: 1000, used: 200 },
        memory: { requested: 128 * 1024 * 1024, limit: 512 * 1024 * 1024, used: 100 * 1024 * 1024 },
        restarts: 0,
        age: '5d',
        lastUpdated: new Date().toISOString(),
      },
      {
        name: 'postgresql',
        namespace: 'db',
        node: 'worker-01',
        status: PodStatus.RUNNING,
        health: NodeHealth.HEALTHY,
        replicas: { desired: 1, ready: 1, available: 1 },
        cpu: { requested: 2000, limit: 4000, used: 1500 },
        memory: {
          requested: 2 * 1024 * 1024 * 1024,
          limit: 4 * 1024 * 1024 * 1024,
          used: 1.5 * 1024 * 1024 * 1024,
        },
        restarts: 0,
        age: '7d',
        lastUpdated: new Date().toISOString(),
      },
    ],
    getClusterSummary: async () => ({
      nodes: { total: 3, healthy: 2, warning: 1, critical: 0 },
      pods: { total: 4, running: 3, pending: 0, failed: 1 },
      cpu: { total: 40000, used: 20234, percent: 51 },
      memory: { total: 80 * 1024 * 1024 * 1024, used: 45 * 1024 * 1024 * 1024, percent: 56 },
      namespaces: 11,
      lastUpdated: new Date().toISOString(),
    }),
  };
}
