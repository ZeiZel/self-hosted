import { Injectable, Inject } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

/**
 * Timeseries data point
 */
export interface TimeseriesPoint {
  timestamp: number;
  value: number;
}

/**
 * Metric types for timeseries storage
 */
export type TimeseriesMetricType =
  | 'node_cpu'
  | 'node_memory'
  | 'node_disk'
  | 'pod_cpu'
  | 'pod_memory'
  | 'cluster_cpu'
  | 'cluster_memory';

/**
 * Prediction result
 */
export interface PredictionResult {
  metricType: TimeseriesMetricType;
  targetId: string;
  currentValue: number;
  predictedValue: number;
  confidence: number;
  predictionHorizon: number; // seconds
  estimatedBreachTime: string | null;
  trend: 'increasing' | 'decreasing' | 'stable';
  slope: number;
  intercept: number;
}

/**
 * Row type for timeseries table
 */
interface TimeseriesRow {
  id: number;
  metric_type: string;
  target_id: string;
  value: number;
  timestamp: number;
}

/**
 * Row type for predictions table
 */
interface PredictionRow {
  metric_type: string;
  target_id: string;
  predicted_value: number;
  confidence: number;
  prediction_horizon: number;
  estimated_breach_time: string | null;
  slope: number;
  intercept: number;
  updated_at: string;
}

/**
 * Repository for timeseries metrics storage and prediction
 */
@Injectable()
export class TimeseriesRepository {
  private initialized: boolean = false;

  constructor(
    @Inject(DatabaseService)
    private readonly db: DatabaseService,
  ) {
    this.ensureTable();
  }

  /**
   * Create tables if they don't exist
   */
  private ensureTable(): void {
    if (this.initialized) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metrics_timeseries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metric_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        value REAL NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_timeseries_lookup
        ON metrics_timeseries(metric_type, target_id, timestamp);

      CREATE INDEX IF NOT EXISTS idx_timeseries_timestamp
        ON metrics_timeseries(timestamp);

      CREATE TABLE IF NOT EXISTS predictions (
        metric_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        predicted_value REAL NOT NULL,
        confidence REAL NOT NULL,
        prediction_horizon INTEGER NOT NULL,
        estimated_breach_time TEXT,
        slope REAL NOT NULL,
        intercept REAL NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (metric_type, target_id)
      );
    `);

    this.initialized = true;
  }

  /**
   * Record a single data point
   */
  record(metricType: TimeseriesMetricType, targetId: string, value: number, timestamp?: number): void {
    const ts = timestamp || Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO metrics_timeseries (metric_type, target_id, value, timestamp)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(metricType, targetId, value, ts);
  }

  /**
   * Record multiple data points in a transaction
   */
  recordBatch(
    points: Array<{ metricType: TimeseriesMetricType; targetId: string; value: number; timestamp?: number }>,
  ): number {
    const stmt = this.db.prepare(`
      INSERT INTO metrics_timeseries (metric_type, target_id, value, timestamp)
      VALUES (?, ?, ?, ?)
    `);

    return this.db.transaction(() => {
      let count = 0;
      const now = Date.now();
      for (const point of points) {
        stmt.run(point.metricType, point.targetId, point.value, point.timestamp || now);
        count++;
      }
      return count;
    });
  }

  /**
   * Get time series data for a metric
   */
  getTimeSeries(
    metricType: TimeseriesMetricType,
    targetId: string,
    fromTimestamp: number,
    toTimestamp?: number,
  ): TimeseriesPoint[] {
    const to = toTimestamp || Date.now();
    const stmt = this.db.prepare(`
      SELECT timestamp, value
      FROM metrics_timeseries
      WHERE metric_type = ? AND target_id = ? AND timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC
    `);

    const rows = stmt.all(metricType, targetId, fromTimestamp, to) as TimeseriesRow[];
    return rows.map(row => ({
      timestamp: row.timestamp,
      value: row.value,
    }));
  }

  /**
   * Get latest data points for prediction
   */
  getLatestPoints(
    metricType: TimeseriesMetricType,
    targetId: string,
    count: number = 60,
  ): TimeseriesPoint[] {
    const stmt = this.db.prepare(`
      SELECT timestamp, value
      FROM metrics_timeseries
      WHERE metric_type = ? AND target_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const rows = stmt.all(metricType, targetId, count) as TimeseriesRow[];
    // Reverse to get chronological order
    return rows.reverse().map(row => ({
      timestamp: row.timestamp,
      value: row.value,
    }));
  }

  /**
   * Calculate prediction using linear regression
   */
  calculatePrediction(
    metricType: TimeseriesMetricType,
    targetId: string,
    threshold: number = 90,
    horizonSeconds: number = 300,
  ): PredictionResult | null {
    const data = this.getLatestPoints(metricType, targetId, 60);

    if (data.length < 10) return null;

    // Linear regression
    const n = data.length;
    const sumX = data.reduce((s, d) => s + d.timestamp, 0);
    const sumY = data.reduce((s, d) => s + d.value, 0);
    const sumXY = data.reduce((s, d) => s + d.timestamp * d.value, 0);
    const sumX2 = data.reduce((s, d) => s + d.timestamp * d.timestamp, 0);

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) return null;

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    // Predict future value
    const futureTimestamp = Date.now() + horizonSeconds * 1000;
    const predictedValue = slope * futureTimestamp + intercept;

    // Calculate R-squared for confidence
    const meanY = sumY / n;
    const ssTotal = data.reduce((s, d) => s + Math.pow(d.value - meanY, 2), 0);
    const ssResidual = data.reduce((s, d) => s + Math.pow(d.value - (slope * d.timestamp + intercept), 2), 0);
    const rSquared = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

    // Determine trend
    let trend: PredictionResult['trend'] = 'stable';
    const slopePerSecond = slope * 1000; // Convert from per-ms to per-second
    if (slopePerSecond > 0.01) trend = 'increasing';
    else if (slopePerSecond < -0.01) trend = 'decreasing';

    // Calculate breach time if trending up
    let estimatedBreachTime: string | null = null;
    const currentValue = data[data.length - 1].value;
    if (slope > 0 && currentValue < threshold) {
      const breachTimestamp = (threshold - intercept) / slope;
      if (breachTimestamp > Date.now()) {
        estimatedBreachTime = new Date(breachTimestamp).toISOString();
      }
    }

    return {
      metricType,
      targetId,
      currentValue,
      predictedValue: Math.max(0, Math.min(100, predictedValue)),
      confidence: Math.max(0, Math.min(1, rSquared)),
      predictionHorizon: horizonSeconds,
      estimatedBreachTime,
      trend,
      slope,
      intercept,
    };
  }

  /**
   * Save prediction result
   */
  savePrediction(prediction: PredictionResult): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO predictions
        (metric_type, target_id, predicted_value, confidence, prediction_horizon,
         estimated_breach_time, slope, intercept, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      prediction.metricType,
      prediction.targetId,
      prediction.predictedValue,
      prediction.confidence,
      prediction.predictionHorizon,
      prediction.estimatedBreachTime,
      prediction.slope,
      prediction.intercept,
      new Date().toISOString(),
    );
  }

  /**
   * Get stored predictions
   */
  getPredictions(metricType?: TimeseriesMetricType): PredictionResult[] {
    let sql = 'SELECT * FROM predictions';
    const params: string[] = [];

    if (metricType) {
      sql += ' WHERE metric_type = ?';
      params.push(metricType);
    }

    sql += ' ORDER BY estimated_breach_time ASC NULLS LAST';

    const stmt = this.db.prepare(sql);
    const rows = (params.length ? stmt.all(...params) : stmt.all()) as PredictionRow[];

    return rows.map(row => ({
      metricType: row.metric_type as TimeseriesMetricType,
      targetId: row.target_id,
      currentValue: 0, // Not stored, would need to query
      predictedValue: row.predicted_value,
      confidence: row.confidence,
      predictionHorizon: row.prediction_horizon,
      estimatedBreachTime: row.estimated_breach_time,
      trend: row.slope > 0.00001 ? 'increasing' : row.slope < -0.00001 ? 'decreasing' : 'stable',
      slope: row.slope,
      intercept: row.intercept,
    }));
  }

  /**
   * Get predictions for targets that are approaching threshold
   */
  getWarningPredictions(
    warningHours: number = 24,
    minConfidence: number = 0.5,
  ): PredictionResult[] {
    const warningTime = new Date();
    warningTime.setHours(warningTime.getHours() + warningHours);

    const stmt = this.db.prepare(`
      SELECT * FROM predictions
      WHERE estimated_breach_time IS NOT NULL
        AND estimated_breach_time <= ?
        AND confidence >= ?
      ORDER BY estimated_breach_time ASC
    `);

    const rows = stmt.all(warningTime.toISOString(), minConfidence) as PredictionRow[];

    return rows.map(row => ({
      metricType: row.metric_type as TimeseriesMetricType,
      targetId: row.target_id,
      currentValue: 0,
      predictedValue: row.predicted_value,
      confidence: row.confidence,
      predictionHorizon: row.prediction_horizon,
      estimatedBreachTime: row.estimated_breach_time,
      trend: 'increasing' as const,
      slope: row.slope,
      intercept: row.intercept,
    }));
  }

  /**
   * Delete old timeseries data
   */
  cleanOldData(retentionDays: number = 7): number {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    const stmt = this.db.prepare('DELETE FROM metrics_timeseries WHERE timestamp < ?');
    const result = stmt.run(cutoff);
    return result.changes;
  }

  /**
   * Get data point count
   */
  getDataPointCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM metrics_timeseries');
    const row = stmt.get() as { count: number } | undefined;
    return row?.count ?? 0;
  }

  /**
   * Get unique targets
   */
  getUniqueTargets(metricType?: TimeseriesMetricType): string[] {
    let sql = 'SELECT DISTINCT target_id FROM metrics_timeseries';
    const params: string[] = [];

    if (metricType) {
      sql += ' WHERE metric_type = ?';
      params.push(metricType);
    }

    const stmt = this.db.prepare(sql);
    const rows = (params.length ? stmt.all(...params) : stmt.all()) as { target_id: string }[];
    return rows.map(row => row.target_id);
  }
}
