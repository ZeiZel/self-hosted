import { BaseEntity } from './base.entity';

/**
 * Metric types
 */
export enum MetricType {
  CPU_USAGE = 'cpu_usage',
  MEMORY_USAGE = 'memory_usage',
  DISK_USAGE = 'disk_usage',
  NETWORK_IN = 'network_in',
  NETWORK_OUT = 'network_out',
  POD_COUNT = 'pod_count',
  SERVICE_STATUS = 'service_status',
  NODE_STATUS = 'node_status',
}

/**
 * Metric entity stored in database
 */
export interface MetricEntity {
  id: number; // Auto-increment for metrics
  type: MetricType;
  targetId: string; // Machine ID or Service ID
  targetType: 'machine' | 'service';
  value: number;
  unit: string;
  metadata?: string; // JSON
  timestamp: string;
}

/**
 * Metric domain model
 */
export interface Metric {
  id: number;
  type: MetricType;
  targetId: string;
  targetType: 'machine' | 'service';
  value: number;
  unit: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

/**
 * Input for recording a metric
 */
export interface RecordMetricInput {
  type: MetricType;
  targetId: string;
  targetType: 'machine' | 'service';
  value: number;
  unit: string;
  metadata?: Record<string, unknown>;
}

/**
 * Metric query options
 */
export interface MetricQueryOptions {
  type?: MetricType;
  targetId?: string;
  targetType?: 'machine' | 'service';
  from?: string; // ISO timestamp
  to?: string; // ISO timestamp
  limit?: number;
  orderBy?: 'asc' | 'desc';
}

/**
 * Aggregated metric result
 */
export interface AggregatedMetric {
  type: MetricType;
  targetId: string;
  avg: number;
  min: number;
  max: number;
  count: number;
  period: string;
}

/**
 * Convert entity to domain model
 */
export function entityToMetric(entity: MetricEntity): Metric {
  return {
    id: entity.id,
    type: entity.type,
    targetId: entity.targetId,
    targetType: entity.targetType,
    value: entity.value,
    unit: entity.unit,
    metadata: entity.metadata ? JSON.parse(entity.metadata) : undefined,
    timestamp: entity.timestamp,
  };
}

/**
 * Convert domain model to entity
 */
export function metricToEntity(metric: Omit<Metric, 'id'>): Omit<MetricEntity, 'id'> {
  return {
    type: metric.type,
    targetId: metric.targetId,
    targetType: metric.targetType,
    value: metric.value,
    unit: metric.unit,
    metadata: metric.metadata ? JSON.stringify(metric.metadata) : undefined,
    timestamp: metric.timestamp,
  };
}
