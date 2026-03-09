import { BaseEntity } from './base.entity';

/**
 * Service tier classification
 */
export enum ServiceTier {
  HEAVY = 'heavy',
  MEDIUM = 'medium',
  LIGHT = 'light',
}

/**
 * Service namespace
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
 * Resource requirements
 */
export interface ServiceResources {
  cpu: number; // millicores
  memory: number; // bytes
  storage: number; // bytes
}

/**
 * Service configuration entity in database
 */
export interface ServiceConfigEntity extends BaseEntity {
  name: string;
  enabled: boolean;
  tier: ServiceTier;
  namespace: ServiceNamespace;
  resources: string; // JSON
  placement?: string; // JSON - machine IDs or labels
  overrides?: string; // JSON - Helm value overrides
}

/**
 * Service configuration domain model
 */
export interface ServiceConfig {
  id: string;
  name: string;
  enabled: boolean;
  tier: ServiceTier;
  namespace: ServiceNamespace;
  resources: ServiceResources;
  placement?: string[];
  overrides?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Service definition (from _others.yaml)
 */
export interface ServiceDefinition {
  name: string;
  repo: string;
  chart: string;
  namespace: ServiceNamespace;
  version: string;
  installed: boolean;
  needs: string[];
  tier: ServiceTier;
  resources: ServiceResources;
}

/**
 * Full service model (definition + config)
 */
export interface Service extends ServiceDefinition {
  config: ServiceConfig;
}

/**
 * Convert entity to domain model
 */
export function entityToServiceConfig(entity: ServiceConfigEntity): ServiceConfig {
  return {
    id: entity.id,
    name: entity.name,
    enabled: entity.enabled,
    tier: entity.tier,
    namespace: entity.namespace,
    resources: JSON.parse(entity.resources),
    placement: entity.placement ? JSON.parse(entity.placement) : undefined,
    overrides: entity.overrides ? JSON.parse(entity.overrides) : undefined,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

/**
 * Convert domain model to entity
 */
export function serviceConfigToEntity(config: ServiceConfig): ServiceConfigEntity {
  return {
    id: config.id,
    name: config.name,
    enabled: config.enabled,
    tier: config.tier,
    namespace: config.namespace,
    resources: JSON.stringify(config.resources),
    placement: config.placement ? JSON.stringify(config.placement) : undefined,
    overrides: config.overrides ? JSON.stringify(config.overrides) : undefined,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}
