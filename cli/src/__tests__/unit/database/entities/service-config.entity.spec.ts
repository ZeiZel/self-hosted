import { describe, test, expect } from 'bun:test';
import {
  ServiceTier,
  ServiceNamespace,
  entityToServiceConfig,
  serviceConfigToEntity,
  type ServiceConfigEntity,
  type ServiceConfig,
} from '../../../../database/entities/service-config.entity';

describe('service-config entity', () => {
  describe('enums', () => {
    test('ServiceTier has expected values', () => {
      expect(ServiceTier.HEAVY).toBe('heavy');
      expect(ServiceTier.MEDIUM).toBe('medium');
      expect(ServiceTier.LIGHT).toBe('light');
    });

    test('ServiceNamespace has expected values', () => {
      expect(ServiceNamespace.INGRESS).toBe('ingress');
      expect(ServiceNamespace.SERVICE).toBe('service');
      expect(ServiceNamespace.DB).toBe('db');
      expect(ServiceNamespace.CODE).toBe('code');
      expect(ServiceNamespace.PRODUCTIVITY).toBe('productivity');
      expect(ServiceNamespace.SOCIAL).toBe('social');
      expect(ServiceNamespace.DATA).toBe('data');
      expect(ServiceNamespace.INFRASTRUCTURE).toBe('infrastructure');
      expect(ServiceNamespace.AUTOMATION).toBe('automation');
      expect(ServiceNamespace.CONTENT).toBe('content');
      expect(ServiceNamespace.UTILITIES).toBe('utilities');
    });
  });

  describe('entityToServiceConfig', () => {
    test('converts entity to domain model', () => {
      const entity: ServiceConfigEntity = {
        id: 'service-123',
        name: 'traefik',
        enabled: true,
        tier: ServiceTier.HEAVY,
        namespace: ServiceNamespace.INGRESS,
        resources: JSON.stringify({ cpu: 500, memory: 536870912, storage: 1073741824 }),
        placement: JSON.stringify(['master-01', 'master-02']),
        overrides: JSON.stringify({ replicas: 3, autoscaling: true }),
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T12:00:00Z',
      };

      const config = entityToServiceConfig(entity);

      expect(config.id).toBe('service-123');
      expect(config.name).toBe('traefik');
      expect(config.enabled).toBe(true);
      expect(config.tier).toBe(ServiceTier.HEAVY);
      expect(config.namespace).toBe(ServiceNamespace.INGRESS);
      expect(config.resources).toEqual({ cpu: 500, memory: 536870912, storage: 1073741824 });
      expect(config.placement).toEqual(['master-01', 'master-02']);
      expect(config.overrides).toEqual({ replicas: 3, autoscaling: true });
      expect(config.createdAt).toBe('2024-01-01T00:00:00Z');
      expect(config.updatedAt).toBe('2024-01-01T12:00:00Z');
    });

    test('handles missing optional fields', () => {
      const entity: ServiceConfigEntity = {
        id: 'service-456',
        name: 'postgresql',
        enabled: true,
        tier: ServiceTier.HEAVY,
        namespace: ServiceNamespace.DB,
        resources: JSON.stringify({ cpu: 1000, memory: 2147483648, storage: 10737418240 }),
        placement: undefined,
        overrides: undefined,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const config = entityToServiceConfig(entity);

      expect(config.placement).toBeUndefined();
      expect(config.overrides).toBeUndefined();
    });

    test('handles disabled service', () => {
      const entity: ServiceConfigEntity = {
        id: 'service-789',
        name: 'gitlab',
        enabled: false,
        tier: ServiceTier.HEAVY,
        namespace: ServiceNamespace.CODE,
        resources: JSON.stringify({ cpu: 2000, memory: 4294967296, storage: 53687091200 }),
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const config = entityToServiceConfig(entity);

      expect(config.enabled).toBe(false);
    });

    test('handles all service tiers', () => {
      const tiers = [ServiceTier.HEAVY, ServiceTier.MEDIUM, ServiceTier.LIGHT];

      for (const tier of tiers) {
        const entity: ServiceConfigEntity = {
          id: `service-${tier}`,
          name: 'test',
          enabled: true,
          tier,
          namespace: ServiceNamespace.UTILITIES,
          resources: JSON.stringify({ cpu: 100, memory: 134217728, storage: 0 }),
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        };

        const config = entityToServiceConfig(entity);
        expect(config.tier).toBe(tier);
      }
    });

    test('handles all namespaces', () => {
      const namespaces = [
        ServiceNamespace.INGRESS,
        ServiceNamespace.SERVICE,
        ServiceNamespace.DB,
        ServiceNamespace.CODE,
        ServiceNamespace.PRODUCTIVITY,
        ServiceNamespace.SOCIAL,
        ServiceNamespace.DATA,
        ServiceNamespace.INFRASTRUCTURE,
        ServiceNamespace.AUTOMATION,
        ServiceNamespace.CONTENT,
        ServiceNamespace.UTILITIES,
      ];

      for (const namespace of namespaces) {
        const entity: ServiceConfigEntity = {
          id: `service-${namespace}`,
          name: 'test',
          enabled: true,
          tier: ServiceTier.LIGHT,
          namespace,
          resources: JSON.stringify({ cpu: 100, memory: 134217728, storage: 0 }),
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        };

        const config = entityToServiceConfig(entity);
        expect(config.namespace).toBe(namespace);
      }
    });
  });

  describe('serviceConfigToEntity', () => {
    test('converts domain model to entity', () => {
      const config: ServiceConfig = {
        id: 'config-123',
        name: 'vault',
        enabled: true,
        tier: ServiceTier.MEDIUM,
        namespace: ServiceNamespace.SERVICE,
        resources: { cpu: 250, memory: 268435456, storage: 536870912 },
        placement: ['worker-01'],
        overrides: { ha: { enabled: true }, dataStorage: { size: '10Gi' } },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T06:00:00Z',
      };

      const entity = serviceConfigToEntity(config);

      expect(entity.id).toBe('config-123');
      expect(entity.name).toBe('vault');
      expect(entity.enabled).toBe(true);
      expect(entity.tier).toBe(ServiceTier.MEDIUM);
      expect(entity.namespace).toBe(ServiceNamespace.SERVICE);
      expect(JSON.parse(entity.resources)).toEqual({ cpu: 250, memory: 268435456, storage: 536870912 });
      expect(JSON.parse(entity.placement!)).toEqual(['worker-01']);
      expect(JSON.parse(entity.overrides!)).toEqual({ ha: { enabled: true }, dataStorage: { size: '10Gi' } });
      expect(entity.createdAt).toBe('2024-01-01T00:00:00Z');
      expect(entity.updatedAt).toBe('2024-01-01T06:00:00Z');
    });

    test('handles missing optional fields', () => {
      const config: ServiceConfig = {
        id: 'config-456',
        name: 'mongodb',
        enabled: true,
        tier: ServiceTier.HEAVY,
        namespace: ServiceNamespace.DB,
        resources: { cpu: 500, memory: 1073741824, storage: 10737418240 },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const entity = serviceConfigToEntity(config);

      expect(entity.placement).toBeUndefined();
      expect(entity.overrides).toBeUndefined();
    });

    test('handles complex overrides', () => {
      const config: ServiceConfig = {
        id: 'config-789',
        name: 'prometheus',
        enabled: true,
        tier: ServiceTier.MEDIUM,
        namespace: ServiceNamespace.SERVICE,
        resources: { cpu: 500, memory: 1073741824, storage: 5368709120 },
        overrides: {
          server: {
            retention: '15d',
            persistentVolume: { size: '50Gi' },
          },
          alertmanager: { enabled: true },
          scrapeConfigs: [
            { job_name: 'kubernetes-pods' },
            { job_name: 'kubernetes-nodes' },
          ],
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const entity = serviceConfigToEntity(config);

      const parsedOverrides = JSON.parse(entity.overrides!);
      expect(parsedOverrides.server.retention).toBe('15d');
      expect(parsedOverrides.scrapeConfigs).toHaveLength(2);
    });

    test('handles empty placement array', () => {
      const config: ServiceConfig = {
        id: 'config-empty',
        name: 'test',
        enabled: true,
        tier: ServiceTier.LIGHT,
        namespace: ServiceNamespace.UTILITIES,
        resources: { cpu: 100, memory: 134217728, storage: 0 },
        placement: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const entity = serviceConfigToEntity(config);

      expect(JSON.parse(entity.placement!)).toEqual([]);
    });
  });

  describe('roundtrip conversion', () => {
    test('entity -> config -> entity preserves data', () => {
      const originalEntity: ServiceConfigEntity = {
        id: 'roundtrip-test',
        name: 'authentik',
        enabled: true,
        tier: ServiceTier.MEDIUM,
        namespace: ServiceNamespace.SERVICE,
        resources: JSON.stringify({ cpu: 300, memory: 536870912, storage: 1073741824 }),
        placement: JSON.stringify(['master-01']),
        overrides: JSON.stringify({ worker: { replicas: 2 } }),
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const config = entityToServiceConfig(originalEntity);
      const convertedEntity = serviceConfigToEntity(config);

      expect(convertedEntity.id).toBe(originalEntity.id);
      expect(convertedEntity.name).toBe(originalEntity.name);
      expect(convertedEntity.enabled).toBe(originalEntity.enabled);
      expect(convertedEntity.tier).toBe(originalEntity.tier);
      expect(convertedEntity.namespace).toBe(originalEntity.namespace);
      expect(convertedEntity.resources).toBe(originalEntity.resources);
      expect(convertedEntity.placement).toBe(originalEntity.placement);
      expect(convertedEntity.overrides).toBe(originalEntity.overrides);
      expect(convertedEntity.createdAt).toBe(originalEntity.createdAt);
      expect(convertedEntity.updatedAt).toBe(originalEntity.updatedAt);
    });

    test('config -> entity -> config preserves data', () => {
      const originalConfig: ServiceConfig = {
        id: 'roundtrip-test-2',
        name: 'grafana',
        enabled: true,
        tier: ServiceTier.LIGHT,
        namespace: ServiceNamespace.SERVICE,
        resources: { cpu: 200, memory: 268435456, storage: 1073741824 },
        placement: ['worker-01', 'worker-02'],
        overrides: { dashboardProviders: { enabled: true } },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T12:00:00Z',
      };

      const entity = serviceConfigToEntity(originalConfig);
      const convertedConfig = entityToServiceConfig(entity);

      expect(convertedConfig.id).toBe(originalConfig.id);
      expect(convertedConfig.name).toBe(originalConfig.name);
      expect(convertedConfig.enabled).toBe(originalConfig.enabled);
      expect(convertedConfig.tier).toBe(originalConfig.tier);
      expect(convertedConfig.namespace).toBe(originalConfig.namespace);
      expect(convertedConfig.resources).toEqual(originalConfig.resources);
      expect(convertedConfig.placement).toEqual(originalConfig.placement);
      expect(convertedConfig.overrides).toEqual(originalConfig.overrides);
      expect(convertedConfig.createdAt).toBe(originalConfig.createdAt);
      expect(convertedConfig.updatedAt).toBe(originalConfig.updatedAt);
    });
  });
});
