import { z } from 'zod';

/**
 * Service namespace categories
 */
export enum ServiceNamespace {
  INGRESS = 'ingress',
  SERVICE = 'service',
  DB = 'db',
  CODE = 'code',
  PRODUCTIVITY = 'productivity',
  SOCIAL = 'social',
  DATA = 'data',
  INFRASTRUCTURE = 'infrastructure',
  AUTOMATION = 'automation',
  CONTENT = 'content',
  UTILITIES = 'utilities',
}

/**
 * Resource requirements for a service
 */
export interface ServiceResources {
  cpu: string; // e.g., "500m", "2"
  memory: string; // e.g., "512Mi", "2Gi"
  storage: string; // e.g., "10Gi"
}

/**
 * Service configuration
 */
export interface ServiceConfig {
  enabled: boolean;
  replicas: number;
  resources: ServiceResources;
  localDomain?: string;
  publicDomain?: string;
  expose: boolean;
}

/**
 * Service definition from _others.yaml
 */
export interface ServiceDefinition {
  name: string;
  repo: string;
  chart: string;
  namespace: ServiceNamespace;
  version: string;
  installed: boolean;
  mandatory: boolean;
  tier: 'core' | 'infrastructure' | 'database' | 'application';
  needs: string[];
  description?: string;
}

/**
 * Full service with configuration
 */
export interface Service extends ServiceDefinition {
  config: ServiceConfig;
  resourceTier: 'heavy' | 'medium' | 'light';
}

/**
 * Zod schema for service configuration
 */
export const serviceConfigSchema = z.object({
  enabled: z.boolean().default(false),
  replicas: z.number().int().min(0).max(10).default(1),
  resources: z.object({
    cpu: z
      .string()
      .regex(/^\d+m?$/)
      .default('100m'),
    memory: z
      .string()
      .regex(/^\d+(Mi|Gi)?$/)
      .default('128Mi'),
    storage: z
      .string()
      .regex(/^\d+(Mi|Gi)?$/)
      .default('1Gi'),
  }),
  localDomain: z.string().optional(),
  publicDomain: z.string().optional(),
  expose: z.boolean().default(false),
});

/**
 * Default resource values by service
 */
export const SERVICE_DEFAULTS: Record<string, ServiceResources> = {
  // Databases (Tier 1 - Heavy)
  postgresql: { cpu: '2000m', memory: '2Gi', storage: '20Gi' },
  mongodb: { cpu: '1000m', memory: '1Gi', storage: '10Gi' },
  clickhouse: { cpu: '2000m', memory: '4Gi', storage: '50Gi' },
  mysql: { cpu: '1000m', memory: '1Gi', storage: '10Gi' },

  // Databases (Tier 2 - Medium)
  valkey: { cpu: '500m', memory: '512Mi', storage: '1Gi' },
  minio: { cpu: '500m', memory: '512Mi', storage: '50Gi' },
  rabbitmq: { cpu: '500m', memory: '512Mi', storage: '5Gi' },

  // Core Services
  vault: { cpu: '500m', memory: '256Mi', storage: '1Gi' },
  consul: { cpu: '500m', memory: '256Mi', storage: '1Gi' },
  traefik: { cpu: '500m', memory: '128Mi', storage: '0' },
  authentik: { cpu: '1000m', memory: '512Mi', storage: '1Gi' },
  'cert-manager': { cpu: '100m', memory: '128Mi', storage: '0' },
  monitoring: { cpu: '1000m', memory: '1Gi', storage: '10Gi' },
  logging: { cpu: '500m', memory: '512Mi', storage: '10Gi' },

  // Heavy Apps
  gitlab: { cpu: '4000m', memory: '4Gi', storage: '50Gi' },
  nextcloud: { cpu: '1000m', memory: '1Gi', storage: '100Gi' },
  teamcity: { cpu: '2000m', memory: '2Gi', storage: '20Gi' },
  harbor: { cpu: '1000m', memory: '1Gi', storage: '50Gi' },

  // Medium Apps
  coder: { cpu: '1000m', memory: '1Gi', storage: '10Gi' },
  n8n: { cpu: '500m', memory: '512Mi', storage: '5Gi' },
  kestra: { cpu: '1000m', memory: '1Gi', storage: '10Gi' },
  affine: { cpu: '500m', memory: '512Mi', storage: '5Gi' },
  youtrack: { cpu: '1000m', memory: '1Gi', storage: '10Gi' },
  hub: { cpu: '500m', memory: '512Mi', storage: '5Gi' },
  penpot: { cpu: '500m', memory: '512Mi', storage: '10Gi' },
  ghost: { cpu: '500m', memory: '512Mi', storage: '5Gi' },
  stalwart: { cpu: '500m', memory: '512Mi', storage: '10Gi' },
  stoat: { cpu: '1000m', memory: '1Gi', storage: '10Gi' },
  supabase: { cpu: '1000m', memory: '1Gi', storage: '10Gi' },
  bytebase: { cpu: '500m', memory: '512Mi', storage: '5Gi' },
  rybbit: { cpu: '500m', memory: '512Mi', storage: '5Gi' },
  openclaw: { cpu: '500m', memory: '512Mi', storage: '5Gi' },
  remnawave: { cpu: '500m', memory: '512Mi', storage: '5Gi' },
  pangolin: { cpu: '200m', memory: '128Mi', storage: '1Gi' },

  // Light Apps
  vaultwarden: { cpu: '100m', memory: '128Mi', storage: '1Gi' },
  excalidraw: { cpu: '100m', memory: '128Mi', storage: '0' },
  metube: { cpu: '100m', memory: '128Mi', storage: '10Gi' },
  vert: { cpu: '100m', memory: '64Mi', storage: '0' },
  glance: { cpu: '100m', memory: '64Mi', storage: '0' },
  syncthing: { cpu: '200m', memory: '256Mi', storage: '50Gi' },
  namespaces: { cpu: '0', memory: '0', storage: '0' },
};

/**
 * Get tier for a service based on resources
 */
export function getServiceTier(resources: ServiceResources): 'heavy' | 'medium' | 'light' {
  const memoryGi = parseFloat(resources.memory.replace(/[^\d.]/g, ''));
  const memoryUnit = resources.memory.replace(/[\d.]/g, '');
  const memoryInGi = memoryUnit === 'Mi' ? memoryGi / 1024 : memoryGi;

  if (memoryInGi >= 2) return 'heavy';
  if (memoryInGi >= 0.5) return 'medium';
  return 'light';
}

/**
 * Service tiers for deployment ordering
 */
export enum ServiceTierEnum {
  CORE = 'core',
  INFRASTRUCTURE = 'infrastructure',
  DATABASE = 'database',
  APPLICATION = 'application',
}

/**
 * Mandatory services that must always be deployed
 * These services are required for core infrastructure functionality
 */
export const MANDATORY_SERVICES = [
  // Core services (Tier 0)
  'namespaces',
  'traefik',
  'consul',
  'vault',
  'cert-manager',
  'pangolin-server',
  'pangolin',
  'authentik',
  // Infrastructure services (Tier 1)
  'openebs',
  'monitoring',
  'logging',
  'glance',
  'bytebase',
  // Required databases (needed by authentik)
  'postgres',
  'valkey',
] as const;

/**
 * Core services that are always required (Tier 0)
 * These services MUST be deployed first and cannot be disabled
 */
export const CORE_SERVICES = [
  'namespaces',
  'traefik',
  'consul',
  'vault',
  'cert-manager',
  'pangolin-server',
  'pangolin',
  'authentik',
];

/**
 * Infrastructure services (Tier 1) - Recommended but can be disabled
 */
export const INFRASTRUCTURE_SERVICES = [
  'monitoring',
  'logging',
  'glance',
  'openebs',
];

/**
 * Database services (Tier 2) - User selectable
 */
export const DATABASE_SERVICES = [
  'postgres',
  'valkey',
  'mongodb',
  'minio',
  'clickhouse',
  'mysql',
  'rabbitmq',
  'supabase',
];

/**
 * Service dependencies map (simplified)
 */
export const SERVICE_DEPENDENCIES: Record<string, string[]> = {
  // All services depend on core
  '*': ['ingress/traefik', 'service/vault'],

  // Database dependencies
  gitlab: ['db/postgresql', 'db/valkey'],
  authentik: ['db/postgresql', 'db/valkey'],
  affine: ['db/postgresql', 'db/valkey', 'db/minio'],
  coder: ['db/postgresql'],
  n8n: ['db/postgresql'],
  kestra: ['db/postgresql', 'db/minio'],
  stoat: ['db/mongodb', 'db/valkey', 'db/minio', 'db/rabbitmq'],
  supabase: ['db/postgresql'],
  bytebase: ['db/postgresql'],
  teamcity: ['db/postgresql'],
  youtrack: ['db/postgresql'],
  nextcloud: ['db/postgresql', 'db/valkey'],
  rybbit: ['db/postgresql', 'db/clickhouse', 'db/valkey'],
  hub: ['db/postgresql'],
  ghost: ['db/mysql'],
  penpot: ['db/postgresql', 'db/valkey'],
};
