/**
 * Mock API responses for testing
 */

import {
  ConsulState,
  PrometheusState,
  VaultState,
  TraefikState,
  ApiHealthStatus,
} from '../../modules/monitor/apis/interfaces/api.interface';

/**
 * Mock Consul state
 */
export const mockConsulState: ConsulState = {
  available: true,
  leader: '192.168.1.10:8300',
  services: [
    {
      id: 'traefik-1',
      name: 'traefik',
      address: '192.168.1.10',
      port: 80,
      tags: ['http', 'proxy'],
      meta: {},
      status: 'passing',
    },
    {
      id: 'postgresql-1',
      name: 'postgresql',
      address: '192.168.1.11',
      port: 5432,
      tags: ['database', 'sql'],
      meta: {},
      status: 'passing',
    },
    {
      id: 'redis-1',
      name: 'redis',
      address: '192.168.1.11',
      port: 6379,
      tags: ['cache', 'kv'],
      meta: {},
      status: 'warning',
    },
  ],
  healthChecks: [
    {
      node: 'master-01',
      checkId: 'svc:traefik-1',
      name: 'Service traefik check',
      status: 'passing',
      output: 'TCP connection successful',
      serviceId: 'traefik-1',
      serviceName: 'traefik',
    },
    {
      node: 'worker-01',
      checkId: 'svc:redis-1',
      name: 'Service redis check',
      status: 'warning',
      output: 'High memory usage',
      serviceId: 'redis-1',
      serviceName: 'redis',
    },
  ],
  failingChecks: 1,
  lastUpdated: new Date().toISOString(),
};

/**
 * Mock Prometheus state
 */
export const mockPrometheusState: PrometheusState = {
  available: true,
  alerts: [
    {
      labels: { alertname: 'HighMemoryUsage', instance: 'worker-01', severity: 'warning' },
      annotations: { summary: 'Memory usage above 80%' },
      state: 'firing',
      activeAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    },
    {
      labels: { alertname: 'PodRestarts', instance: 'test-pod', severity: 'warning' },
      annotations: { summary: 'Pod has restarted 15 times' },
      state: 'firing',
      activeAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    },
    {
      labels: { alertname: 'CertificateExpiry', instance: 'gitlab', severity: 'info' },
      annotations: { summary: 'Certificate expires in 30 days' },
      state: 'pending',
      activeAt: new Date().toISOString(),
    },
  ],
  firingAlerts: 2,
  pendingAlerts: 1,
  lastUpdated: new Date().toISOString(),
};

/**
 * Mock Vault state
 */
export const mockVaultState: VaultState = {
  available: true,
  status: {
    initialized: true,
    sealed: false,
    version: '1.15.0',
    clusterName: 'selfhost-vault',
    clusterLeader: 'http://vault-0:8200',
    haEnabled: true,
    standby: false,
  },
  health: ApiHealthStatus.HEALTHY,
  lastUpdated: new Date().toISOString(),
};

/**
 * Mock Traefik state
 */
export const mockTraefikState: TraefikState = {
  available: true,
  overview: {
    http: {
      routers: { total: 15, warnings: 0, errors: 1 },
      services: { total: 15, warnings: 0, errors: 0 },
      middlewares: { total: 8, warnings: 0, errors: 0 },
    },
  },
  routers: [
    {
      name: 'gitlab-http@kubernetes',
      rule: 'Host(`gitlab.example.com`)',
      service: 'code-gitlab-webservice-default@kubernetes',
      entryPoints: ['web', 'websecure'],
      status: 'enabled',
      middlewares: ['authentik@kubernetes'],
      tls: true,
    },
    {
      name: 'grafana-http@kubernetes',
      rule: 'Host(`grafana.example.com`)',
      service: 'monitoring-grafana@kubernetes',
      entryPoints: ['web', 'websecure'],
      status: 'enabled',
      tls: true,
    },
    {
      name: 'broken-router@kubernetes',
      rule: 'Host(`broken.example.com`)',
      service: 'missing-service@kubernetes',
      entryPoints: ['web'],
      status: 'disabled',
      tls: false,
    },
  ],
  services: [
    {
      name: 'code-gitlab-webservice-default@kubernetes',
      type: 'loadbalancer',
      status: 'enabled',
      loadBalancer: {
        servers: [{ url: 'http://10.0.0.5:8080' }],
      },
    },
    {
      name: 'monitoring-grafana@kubernetes',
      type: 'loadbalancer',
      status: 'enabled',
      loadBalancer: {
        servers: [{ url: 'http://10.0.0.10:3000' }],
      },
    },
  ],
  errorCount: 1,
  lastUpdated: new Date().toISOString(),
};

/**
 * Create mock API clients
 */
export function createMockConsulClient() {
  return {
    checkHealth: async () => ({ status: ApiHealthStatus.HEALTHY }),
    getLeader: async () => mockConsulState.leader,
    listServices: async () => mockConsulState.services,
    getAllHealthChecks: async () => mockConsulState.healthChecks,
    getState: async () => mockConsulState,
  };
}

export function createMockPrometheusClient() {
  return {
    checkHealth: async () => ({ status: ApiHealthStatus.HEALTHY }),
    getAlerts: async () => mockPrometheusState.alerts,
    getFiringAlerts: async () => mockPrometheusState.alerts.filter((a) => a.state === 'firing'),
    query: async () => [],
    getState: async () => mockPrometheusState,
  };
}

export function createMockVaultClient() {
  return {
    checkHealth: async () => ({ status: ApiHealthStatus.HEALTHY }),
    getSealStatus: async () => mockVaultState.status,
    getHealthInfo: async () => mockVaultState.status,
    isUnsealed: async () => true,
    isInitialized: async () => true,
    getState: async () => mockVaultState,
  };
}

export function createMockTraefikClient() {
  return {
    checkHealth: async () => ({ status: ApiHealthStatus.HEALTHY }),
    getOverview: async () => mockTraefikState.overview,
    getHttpRouters: async () => mockTraefikState.routers,
    getHttpServices: async () => mockTraefikState.services,
    getState: async () => mockTraefikState,
  };
}
