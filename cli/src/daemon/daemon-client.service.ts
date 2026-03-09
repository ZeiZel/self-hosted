import { Injectable, Inject } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  DaemonHealthLog,
  DaemonStateEntry,
  DaemonState,
  DaemonStatus,
  DaemonHealthStatus,
  DaemonCheckType,
} from './interfaces/daemon.interface';

/**
 * Client service for CLI to communicate with daemon via shared SQLite
 */
@Injectable()
export class DaemonClientService {
  constructor(
    @Inject(DatabaseService)
    private readonly db: DatabaseService,
  ) {}

  /**
   * Get daemon state value
   */
  getState(key: string): string | null {
    const result = this.db.queryOne<{ value: string }>(
      'SELECT value FROM daemon_state WHERE key = ?',
      [key],
    );
    return result?.value ?? null;
  }

  /**
   * Set daemon state value
   */
  setState(key: string, value: string): void {
    const now = new Date().toISOString();
    this.db.exec(`
      INSERT INTO daemon_state (key, value, updated_at)
      VALUES ('${key}', '${value}', '${now}')
      ON CONFLICT(key) DO UPDATE SET value = '${value}', updated_at = '${now}'
    `);
  }

  /**
   * Remove daemon state value
   */
  removeState(key: string): void {
    this.db.exec(`DELETE FROM daemon_state WHERE key = '${key}'`);
  }

  /**
   * Get current daemon status
   */
  getDaemonStatus(): DaemonStatus {
    const running = this.getState('running');
    const startedAt = this.getState('started_at');
    const lastCheck = this.getState('last_check');
    const checkInterval = parseInt(this.getState('check_interval') || '60', 10);
    const containerId = this.getState('container_id');

    // Determine state
    let state = DaemonState.STOPPED;
    if (running === 'true') {
      state = DaemonState.RUNNING;
    } else if (running === 'starting') {
      state = DaemonState.STARTING;
    } else if (running === 'stopping') {
      state = DaemonState.STOPPING;
    } else if (running === 'error') {
      state = DaemonState.ERROR;
    }

    // Get health summary
    const healthSummary = this.getHealthSummary();

    // Get recent alerts (critical and degraded from last hour)
    const recentAlerts = this.getRecentAlerts(60);

    return {
      state,
      containerId: containerId || undefined,
      startedAt: startedAt || undefined,
      lastCheck: lastCheck || undefined,
      checkInterval,
      healthSummary,
      recentAlerts,
    };
  }

  /**
   * Log health check result
   */
  logHealthCheck(log: DaemonHealthLog): void {
    const stmt = this.db.prepare(`
      INSERT INTO daemon_health_logs (check_type, target, status, message, metadata, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      log.checkType,
      log.target,
      log.status,
      log.message || null,
      log.metadata ? JSON.stringify(log.metadata) : null,
      log.timestamp,
    );
  }

  /**
   * Log multiple health checks
   */
  logHealthChecks(logs: DaemonHealthLog[]): void {
    this.db.transaction(() => {
      for (const log of logs) {
        this.logHealthCheck(log);
      }
    });
  }

  /**
   * Get health summary from recent logs
   */
  getHealthSummary(): {
    healthy: number;
    degraded: number;
    critical: number;
    unknown: number;
  } {
    // Get latest status for each unique target
    const results = this.db.query<{
      status: DaemonHealthStatus;
      count: number;
    }>(`
      SELECT status, COUNT(*) as count FROM (
        SELECT target, status FROM daemon_health_logs
        WHERE timestamp > datetime('now', '-1 hour')
        GROUP BY target
        HAVING timestamp = MAX(timestamp)
      ) GROUP BY status
    `);

    const summary = {
      healthy: 0,
      degraded: 0,
      critical: 0,
      unknown: 0,
    };

    for (const row of results) {
      if (row.status === DaemonHealthStatus.HEALTHY) summary.healthy = row.count;
      else if (row.status === DaemonHealthStatus.DEGRADED) summary.degraded = row.count;
      else if (row.status === DaemonHealthStatus.CRITICAL) summary.critical = row.count;
      else summary.unknown = row.count;
    }

    return summary;
  }

  /**
   * Get recent alerts (non-healthy logs)
   */
  getRecentAlerts(minutes: number = 60, limit: number = 10): DaemonHealthLog[] {
    const results = this.db.query<{
      id: number;
      check_type: string;
      target: string;
      status: string;
      message: string | null;
      metadata: string | null;
      timestamp: string;
    }>(`
      SELECT id, check_type, target, status, message, metadata, timestamp
      FROM daemon_health_logs
      WHERE status != '${DaemonHealthStatus.HEALTHY}'
        AND timestamp > datetime('now', '-${minutes} minutes')
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `);

    return results.map((row) => ({
      id: row.id,
      checkType: row.check_type as DaemonCheckType,
      target: row.target,
      status: row.status as DaemonHealthStatus,
      message: row.message || undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      timestamp: row.timestamp,
    }));
  }

  /**
   * Get critical alerts count
   */
  getCriticalAlertsCount(): number {
    const result = this.db.queryOne<{ count: number }>(`
      SELECT COUNT(*) as count FROM daemon_health_logs
      WHERE status = '${DaemonHealthStatus.CRITICAL}'
        AND timestamp > datetime('now', '-1 hour')
    `);
    return result?.count ?? 0;
  }

  /**
   * Get all health logs with optional filters
   */
  getHealthLogs(options: {
    status?: DaemonHealthStatus;
    checkType?: DaemonCheckType;
    target?: string;
    limit?: number;
    offset?: number;
  } = {}): DaemonHealthLog[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }

    if (options.checkType) {
      conditions.push('check_type = ?');
      params.push(options.checkType);
    }

    if (options.target) {
      conditions.push('target LIKE ?');
      params.push(`%${options.target}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit || 100;
    const offset = options.offset || 0;

    const results = this.db.query<{
      id: number;
      check_type: string;
      target: string;
      status: string;
      message: string | null;
      metadata: string | null;
      timestamp: string;
    }>(`
      SELECT id, check_type, target, status, message, metadata, timestamp
      FROM daemon_health_logs
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT ${limit} OFFSET ${offset}
    `, params);

    return results.map((row) => ({
      id: row.id,
      checkType: row.check_type as DaemonCheckType,
      target: row.target,
      status: row.status as DaemonHealthStatus,
      message: row.message || undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      timestamp: row.timestamp,
    }));
  }

  /**
   * Clean old logs based on retention policy
   */
  cleanOldLogs(retentionDays: number = 7): number {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const stmt = this.db.prepare('DELETE FROM daemon_health_logs WHERE timestamp < ?');
    stmt.run(cutoff.toISOString());
    return this.db.getConnection().changes;
  }

  /**
   * Update last check timestamp
   */
  updateLastCheck(): void {
    this.setState('last_check', new Date().toISOString());
  }

  /**
   * Mark daemon as running
   */
  markRunning(containerId?: string): void {
    this.setState('running', 'true');
    this.setState('started_at', new Date().toISOString());
    if (containerId) {
      this.setState('container_id', containerId);
    }
  }

  /**
   * Mark daemon as stopped
   */
  markStopped(): void {
    this.setState('running', 'false');
    this.removeState('started_at');
    this.removeState('container_id');
  }

  /**
   * Mark daemon as error state
   */
  markError(error: string): void {
    this.setState('running', 'error');
    this.setState('last_error', error);
    this.setState('error_at', new Date().toISOString());
  }
}
