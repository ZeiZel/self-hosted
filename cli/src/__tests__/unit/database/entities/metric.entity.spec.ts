import { describe, test, expect } from 'bun:test';
import {
  MetricType,
  entityToMetric,
  metricToEntity,
  type MetricEntity,
  type Metric,
} from '../../../../database/entities/metric.entity';

describe('metric entity', () => {
  describe('enums', () => {
    test('MetricType has expected values', () => {
      expect(MetricType.CPU_USAGE).toBe('cpu_usage' as MetricType);
      expect(MetricType.MEMORY_USAGE).toBe('memory_usage' as MetricType);
      expect(MetricType.DISK_USAGE).toBe('disk_usage' as MetricType);
      expect(MetricType.NETWORK_IN).toBe('network_in' as MetricType);
      expect(MetricType.NETWORK_OUT).toBe('network_out' as MetricType);
      expect(MetricType.POD_COUNT).toBe('pod_count' as MetricType);
      expect(MetricType.SERVICE_STATUS).toBe('service_status' as MetricType);
      expect(MetricType.NODE_STATUS).toBe('node_status' as MetricType);
    });
  });

  describe('entityToMetric', () => {
    test('converts entity to domain model', () => {
      const entity: MetricEntity = {
        id: 1,
        type: MetricType.CPU_USAGE,
        targetId: 'machine-123',
        targetType: 'machine',
        value: 75.5,
        unit: 'percent',
        metadata: JSON.stringify({ cores: 8, loadAvg: 2.5 }),
        timestamp: '2024-01-01T00:00:00Z',
      };

      const metric = entityToMetric(entity);

      expect(metric.id).toBe(1);
      expect(metric.type).toBe(MetricType.CPU_USAGE);
      expect(metric.targetId).toBe('machine-123');
      expect(metric.targetType).toBe('machine');
      expect(metric.value).toBe(75.5);
      expect(metric.unit).toBe('percent');
      expect(metric.metadata).toEqual({ cores: 8, loadAvg: 2.5 });
      expect(metric.timestamp).toBe('2024-01-01T00:00:00Z');
    });

    test('handles missing metadata', () => {
      const entity: MetricEntity = {
        id: 2,
        type: MetricType.MEMORY_USAGE,
        targetId: 'service-456',
        targetType: 'service',
        value: 1024000000,
        unit: 'bytes',
        metadata: undefined,
        timestamp: '2024-01-01T00:00:00Z',
      };

      const metric = entityToMetric(entity);

      expect(metric.id).toBe(2);
      expect(metric.metadata).toBeUndefined();
    });

    test('handles all metric types', () => {
      const types = [
        MetricType.CPU_USAGE,
        MetricType.MEMORY_USAGE,
        MetricType.DISK_USAGE,
        MetricType.NETWORK_IN,
        MetricType.NETWORK_OUT,
        MetricType.POD_COUNT,
        MetricType.SERVICE_STATUS,
        MetricType.NODE_STATUS,
      ];

      for (const type of types) {
        const entity: MetricEntity = {
          id: 1,
          type,
          targetId: 'test',
          targetType: 'machine',
          value: 100,
          unit: 'test',
          timestamp: '2024-01-01T00:00:00Z',
        };

        const metric = entityToMetric(entity);
        expect(metric.type).toBe(type);
      }
    });

    test('handles service target type', () => {
      const entity: MetricEntity = {
        id: 3,
        type: MetricType.SERVICE_STATUS,
        targetId: 'traefik',
        targetType: 'service',
        value: 1,
        unit: 'status',
        timestamp: '2024-01-01T00:00:00Z',
      };

      const metric = entityToMetric(entity);

      expect(metric.targetType).toBe('service');
      expect(metric.targetId).toBe('traefik');
    });
  });

  describe('metricToEntity', () => {
    test('converts domain model to entity', () => {
      const metric: Omit<Metric, 'id'> = {
        type: MetricType.DISK_USAGE,
        targetId: 'machine-789',
        targetType: 'machine',
        value: 500000000000,
        unit: 'bytes',
        metadata: { filesystem: '/dev/sda1', mountpoint: '/' },
        timestamp: '2024-01-01T12:00:00Z',
      };

      const entity = metricToEntity(metric);

      expect(entity.type).toBe(MetricType.DISK_USAGE);
      expect(entity.targetId).toBe('machine-789');
      expect(entity.targetType).toBe('machine');
      expect(entity.value).toBe(500000000000);
      expect(entity.unit).toBe('bytes');
      expect(entity.metadata).toBe(JSON.stringify({ filesystem: '/dev/sda1', mountpoint: '/' }));
      expect(entity.timestamp).toBe('2024-01-01T12:00:00Z');
    });

    test('handles missing metadata', () => {
      const metric: Omit<Metric, 'id'> = {
        type: MetricType.POD_COUNT,
        targetId: 'cluster',
        targetType: 'service',
        value: 42,
        unit: 'count',
        timestamp: '2024-01-01T00:00:00Z',
      };

      const entity = metricToEntity(metric);

      expect(entity.metadata).toBeUndefined();
    });

    test('handles complex metadata', () => {
      const metric: Omit<Metric, 'id'> = {
        type: MetricType.NETWORK_IN,
        targetId: 'machine-123',
        targetType: 'machine',
        value: 1000000,
        unit: 'bytes/s',
        metadata: {
          interfaces: [
            { name: 'eth0', bytes: 500000 },
            { name: 'eth1', bytes: 500000 },
          ],
          timestamp: '2024-01-01T00:00:00Z',
        },
        timestamp: '2024-01-01T00:00:00Z',
      };

      const entity = metricToEntity(metric);

      const parsedMetadata = JSON.parse(entity.metadata!);
      expect(parsedMetadata.interfaces).toHaveLength(2);
      expect(parsedMetadata.interfaces[0].name).toBe('eth0');
    });
  });

  describe('roundtrip conversion', () => {
    test('entity -> metric -> entity preserves data', () => {
      const originalEntity: MetricEntity = {
        id: 100,
        type: MetricType.CPU_USAGE,
        targetId: 'roundtrip-test',
        targetType: 'machine',
        value: 85.5,
        unit: 'percent',
        metadata: JSON.stringify({ test: true, value: 123 }),
        timestamp: '2024-01-01T00:00:00Z',
      };

      const metric = entityToMetric(originalEntity);
      // Note: metricToEntity omits id, so we need to exclude it from comparison
      const convertedEntity = metricToEntity(metric);

      expect(convertedEntity.type).toBe(originalEntity.type);
      expect(convertedEntity.targetId).toBe(originalEntity.targetId);
      expect(convertedEntity.targetType).toBe(originalEntity.targetType);
      expect(convertedEntity.value).toBe(originalEntity.value);
      expect(convertedEntity.unit).toBe(originalEntity.unit);
      expect(convertedEntity.metadata).toBe(originalEntity.metadata);
      expect(convertedEntity.timestamp).toBe(originalEntity.timestamp);
    });

    test('handles undefined metadata in roundtrip', () => {
      const originalEntity: MetricEntity = {
        id: 101,
        type: MetricType.NODE_STATUS,
        targetId: 'node-1',
        targetType: 'machine',
        value: 1,
        unit: 'status',
        metadata: undefined,
        timestamp: '2024-01-01T00:00:00Z',
      };

      const metric = entityToMetric(originalEntity);
      const convertedEntity = metricToEntity(metric);

      expect(metric.metadata).toBeUndefined();
      expect(convertedEntity.metadata).toBeUndefined();
    });
  });
});
