/**
 * Common API interfaces for service integrations
 */

/**
 * API health status
 */
export enum ApiHealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNAVAILABLE = 'unavailable',
  UNKNOWN = 'unknown',
}

/**
 * Base API response
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  responseTime: number;
}

/**
 * API endpoint configuration
 */
export interface ApiEndpoint {
  host: string;
  port: number;
  protocol: 'http' | 'https';
  basePath: string;
}

/**
 * API client options
 */
export interface ApiClientOptions {
  timeout: number;
  retries: number;
  retryDelay: number;
}

/**
 * Default API client options
 */
export const DEFAULT_API_OPTIONS: ApiClientOptions = {
  timeout: 5000,
  retries: 2,
  retryDelay: 1000,
};

/**
 * Consul service entry
 */
export interface ConsulService {
  id: string;
  name: string;
  address: string;
  port: number;
  tags: string[];
  meta: Record<string, string>;
  status: 'passing' | 'warning' | 'critical';
}

/**
 * Consul health check
 */
export interface ConsulHealthCheck {
  node: string;
  checkId: string;
  name: string;
  status: 'passing' | 'warning' | 'critical';
  output: string;
  serviceId: string;
  serviceName: string;
}

/**
 * Consul state
 */
export interface ConsulState {
  available: boolean;
  leader?: string;
  services: ConsulService[];
  healthChecks: ConsulHealthCheck[];
  failingChecks: number;
  lastUpdated: string;
}

/**
 * Prometheus alert
 */
export interface PrometheusAlert {
  labels: Record<string, string>;
  annotations: Record<string, string>;
  state: 'firing' | 'pending' | 'inactive';
  activeAt?: string;
  value?: string;
}

/**
 * Prometheus query result
 */
export interface PrometheusQueryResult {
  metric: Record<string, string>;
  value?: [number, string];
  values?: Array<[number, string]>; // For range queries
}

/**
 * Prometheus state
 */
export interface PrometheusState {
  available: boolean;
  alerts: PrometheusAlert[];
  firingAlerts: number;
  pendingAlerts: number;
  lastUpdated: string;
}

/**
 * Vault status
 */
export interface VaultStatus {
  initialized: boolean;
  sealed: boolean;
  version: string;
  clusterName?: string;
  clusterLeader?: string;
  haEnabled: boolean;
  standby: boolean;
}

/**
 * Vault state
 */
export interface VaultState {
  available: boolean;
  status?: VaultStatus;
  health: ApiHealthStatus;
  lastUpdated: string;
}

/**
 * Traefik router
 */
export interface TraefikRouter {
  name: string;
  rule: string;
  service: string;
  entryPoints: string[];
  status: 'enabled' | 'disabled';
  middlewares?: string[];
  tls?: boolean;
}

/**
 * Traefik service
 */
export interface TraefikService {
  name: string;
  type: 'loadbalancer' | 'weighted' | 'mirroring';
  status: 'enabled' | 'disabled';
  loadBalancer?: {
    servers: Array<{ url: string }>;
    healthCheck?: {
      scheme: string;
      path: string;
      interval: string;
    };
  };
}

/**
 * Traefik overview
 */
export interface TraefikOverview {
  http: {
    routers: { total: number; warnings: number; errors: number };
    services: { total: number; warnings: number; errors: number };
    middlewares: { total: number; warnings: number; errors: number };
  };
  tcp?: {
    routers: { total: number; warnings: number; errors: number };
    services: { total: number; warnings: number; errors: number };
  };
}

/**
 * Traefik state
 */
export interface TraefikState {
  available: boolean;
  overview?: TraefikOverview;
  routers: TraefikRouter[];
  services: TraefikService[];
  errorCount: number;
  lastUpdated: string;
}

/**
 * Extended cluster state with API data
 */
export interface ExtendedClusterState {
  consul?: ConsulState;
  prometheus?: PrometheusState;
  vault?: VaultState;
  traefik?: TraefikState;
}
