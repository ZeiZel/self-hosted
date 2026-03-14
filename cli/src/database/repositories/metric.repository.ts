import { Injectable, Inject } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import {
  Metric,
  MetricType,
  RecordMetricInput,
  MetricQueryOptions,
  AggregatedMetric,
} from '../entities/metric.entity';

/**
 * Row type returned from SQLite
 */
interface MetricRow {
  id: number;
  type: string;
  target_id: string;
  target_type: string;
  value: number;
  unit: string;
  metadata: string | null;
  timestamp: string;
}

/**
 * Repository for metric operations
 */
@Injectable()
export class MetricRepository {
  constructor(
    @Inject(DatabaseService)
    private readonly db: DatabaseService,
  ) {}

  /**
   * Record a new metric
   */
  record(input: RecordMetricInput): Metric {
    const stmt = this.db.prepare(`
      INSERT INTO metrics (type, target_id, target_type, value, unit, metadata, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      input.type,
      input.targetId,
      input.targetType,
      input.value,
      input.unit,
      input.metadata ? JSON.stringify(input.metadata) : null,
      new Date().toISOString(),
    );

    return this.findById(Number(result.lastInsertRowid))!;
  }

  /**
   * Record multiple metrics in a transaction
   */
  recordBatch(inputs: RecordMetricInput[]): number {
    const stmt = this.db.prepare(`
      INSERT INTO metrics (type, target_id, target_type, value, unit, metadata, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const timestamp = new Date().toISOString();

    return this.db.transaction(() => {
      for (const input of inputs) {
        stmt.run(
          input.type,
          input.targetId,
          input.targetType,
          input.value,
          input.unit,
          input.metadata ? JSON.stringify(input.metadata) : null,
          timestamp,
        );
      }
      return inputs.length;
    });
  }

  /**
   * Find metric by ID
   */
  findById(id: number): Metric | null {
    const stmt = this.db.prepare('SELECT * FROM metrics WHERE id = ?');
    const row = stmt.get(id) as MetricRow | null;
    return row ? this.rowToMetric(row) : null;
  }

  /**
   * Query metrics with filters
   */
  query(options: MetricQueryOptions): Metric[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.type) {
      conditions.push('type = ?');
      params.push(options.type);
    }

    if (options.targetId) {
      conditions.push('target_id = ?');
      params.push(options.targetId);
    }

    if (options.targetType) {
      conditions.push('target_type = ?');
      params.push(options.targetType);
    }

    if (options.from) {
      conditions.push('timestamp >= ?');
      params.push(options.from);
    }

    if (options.to) {
      conditions.push('timestamp <= ?');
      params.push(options.to);
    }

    let sql = 'SELECT * FROM metrics';
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ` ORDER BY timestamp ${options.orderBy ?? 'DESC'}`;

    if (options.limit) {
      sql += ` LIMIT ${options.limit}`;
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...(params as (string | number | null)[])) as MetricRow[];
    return rows.map((row) => this.rowToMetric(row));
  }

  /**
   * Get latest metrics for a target
   */
  getLatest(targetId: string, targetType: 'machine' | 'service'): Metric[] {
    const stmt = this.db.prepare(`
      SELECT m1.*
      FROM metrics m1
      INNER JOIN (
        SELECT type, MAX(timestamp) as max_ts
        FROM metrics
        WHERE target_id = ? AND target_type = ?
        GROUP BY type
      ) m2 ON m1.type = m2.type AND m1.timestamp = m2.max_ts
      WHERE m1.target_id = ? AND m1.target_type = ?
    `);

    const rows = stmt.all(targetId, targetType, targetId, targetType) as MetricRow[];
    return rows.map((row) => this.rowToMetric(row));
  }

  /**
   * Get aggregated metrics
   */
  aggregate(
    targetId: string,
    targetType: 'machine' | 'service',
    period: 'hour' | 'day' | 'week',
  ): AggregatedMetric[] {
    const cutoff = new Date();
    switch (period) {
      case 'hour':
        cutoff.setHours(cutoff.getHours() - 1);
        break;
      case 'day':
        cutoff.setDate(cutoff.getDate() - 1);
        break;
      case 'week':
        cutoff.setDate(cutoff.getDate() - 7);
        break;
    }

    interface AggRow {
      type: string;
      avg_value: number;
      min_value: number;
      max_value: number;
      count: number;
    }

    const stmt = this.db.prepare(`
      SELECT
        type,
        AVG(value) as avg_value,
        MIN(value) as min_value,
        MAX(value) as max_value,
        COUNT(*) as count
      FROM metrics
      WHERE target_id = ? AND target_type = ? AND timestamp >= ?
      GROUP BY type
    `);

    const rows = stmt.all(targetId, targetType, cutoff.toISOString()) as AggRow[];

    return rows.map((row) => ({
      type: row.type as MetricType,
      targetId,
      avg: row.avg_value,
      min: row.min_value,
      max: row.max_value,
      count: row.count,
      period,
    }));
  }

  /**
   * Get time series data for a metric
   */
  getTimeSeries(
    targetId: string,
    type: MetricType,
    from: string,
    to: string,
  ): Array<{ timestamp: string; value: number }> {
    const stmt = this.db.prepare(`
      SELECT timestamp, value
      FROM metrics
      WHERE target_id = ? AND type = ? AND timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC
    `);

    return stmt.all(targetId, type, from, to) as Array<{ timestamp: string; value: number }>;
  }

  /**
   * Delete old metrics
   */
  deleteOld(retentionDays: number = 7): number {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const stmt = this.db.prepare('DELETE FROM metrics WHERE timestamp < ?');
    const result = stmt.run(cutoff.toISOString());
    return result.changes;
  }

  /**
   * Delete metrics for a target
   */
  deleteByTarget(targetId: string, targetType: 'machine' | 'service'): number {
    const stmt = this.db.prepare('DELETE FROM metrics WHERE target_id = ? AND target_type = ?');
    const result = stmt.run(targetId, targetType);
    return result.changes;
  }

  /**
   * Get count of metrics
   */
  count(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM metrics');
    const row = stmt.get() as { count: number } | null;
    return row?.count ?? 0;
  }

  /**
   * Convert SQLite row to Metric model
   */
  private rowToMetric(row: MetricRow): Metric {
    return {
      id: row.id,
      type: row.type as MetricType,
      targetId: row.target_id,
      targetType: row.target_type as 'machine' | 'service',
      value: row.value,
      unit: row.unit,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      timestamp: row.timestamp,
    };
  }
}
