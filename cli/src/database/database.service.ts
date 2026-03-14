import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { Database } from 'bun:sqlite';
import { MODULE_OPTIONS } from '../core/constants';
import type { DatabaseModuleOptions } from '../core/interfaces';

/**
 * Database service providing SQLite connection and schema management
 * Uses Bun's built-in SQLite for native performance
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private db: Database | null = null;

  constructor(
    @Inject(MODULE_OPTIONS.DATABASE)
    private readonly options: DatabaseModuleOptions,
  ) {}

  /**
   * Initialize database on module startup
   */
  onModuleInit(): void {
    this.connect();
    this.createSchema();
  }

  /**
   * Close database on module shutdown
   */
  onModuleDestroy(): void {
    this.close();
  }

  /**
   * Get database connection
   */
  getConnection(): Database {
    if (!this.db) {
      throw new Error('Database not connected');
    }
    return this.db;
  }

  /**
   * Connect to SQLite database
   */
  private connect(): void {
    const filename = this.options.inMemory ? ':memory:' : this.options.filename;

    this.db = new Database(filename, {
      readonly: this.options.readonly ?? false,
      create: true,
    });

    // Enable WAL mode for better concurrency
    this.db.exec('PRAGMA journal_mode = WAL');
    // Enable foreign keys
    this.db.exec('PRAGMA foreign_keys = ON');
  }

  /**
   * Close database connection
   */
  private close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Create database schema
   */
  private createSchema(): void {
    const db = this.getConnection();

    // Machines table
    db.exec(`
      CREATE TABLE IF NOT EXISTS machines (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL UNIQUE,
        ip TEXT NOT NULL UNIQUE,
        roles TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'unknown',
        ssh_host TEXT NOT NULL,
        ssh_port INTEGER NOT NULL DEFAULT 22,
        ssh_username TEXT NOT NULL DEFAULT 'root',
        ssh_private_key_path TEXT,
        last_seen TEXT,
        facts TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Deployments table
    db.exec(`
      CREATE TABLE IF NOT EXISTS deployments (
        id TEXT PRIMARY KEY,
        repo_path TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        current_phase INTEGER NOT NULL DEFAULT 0,
        completed_phases TEXT NOT NULL DEFAULT '[]',
        failed_phases TEXT NOT NULL DEFAULT '[]',
        skipped_phases TEXT NOT NULL DEFAULT '[]',
        config TEXT NOT NULL DEFAULT '{}',
        logs TEXT NOT NULL DEFAULT '[]',
        started_at TEXT NOT NULL,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Service configs table
    db.exec(`
      CREATE TABLE IF NOT EXISTS service_configs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        enabled INTEGER NOT NULL DEFAULT 0,
        tier TEXT NOT NULL,
        namespace TEXT NOT NULL,
        resources TEXT NOT NULL DEFAULT '{}',
        placement TEXT,
        overrides TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Metrics table with auto-increment ID
    db.exec(`
      CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        target_type TEXT NOT NULL,
        value REAL NOT NULL,
        unit TEXT NOT NULL,
        metadata TEXT,
        timestamp TEXT NOT NULL
      )
    `);

    // Daemon health check logs table
    db.exec(`
      CREATE TABLE IF NOT EXISTS daemon_health_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        check_type TEXT NOT NULL,
        target TEXT NOT NULL,
        status TEXT NOT NULL,
        message TEXT,
        metadata TEXT,
        timestamp TEXT NOT NULL
      )
    `);

    // Daemon state tracking table
    db.exec(`
      CREATE TABLE IF NOT EXISTS daemon_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Telegram config table
    db.exec(`
      CREATE TABLE IF NOT EXISTS telegram_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        rate_limit_seconds INTEGER DEFAULT 60,
        alert_on_critical INTEGER DEFAULT 1,
        alert_on_degraded INTEGER DEFAULT 0,
        last_alert_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Telegram alert log table
    db.exec(`
      CREATE TABLE IF NOT EXISTS telegram_alert_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        check_type TEXT NOT NULL,
        target TEXT NOT NULL,
        status TEXT NOT NULL,
        message_id TEXT,
        sent_at TEXT NOT NULL,
        error TEXT
      )
    `);

    // Create indexes for common queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_machines_status ON machines(status);
      CREATE INDEX IF NOT EXISTS idx_machines_roles ON machines(roles);
      CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);
      CREATE INDEX IF NOT EXISTS idx_service_configs_enabled ON service_configs(enabled);
      CREATE INDEX IF NOT EXISTS idx_metrics_target ON metrics(target_id, target_type);
      CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp);
      CREATE INDEX IF NOT EXISTS idx_metrics_type ON metrics(type);
      CREATE INDEX IF NOT EXISTS idx_daemon_health_logs_status ON daemon_health_logs(status);
      CREATE INDEX IF NOT EXISTS idx_daemon_health_logs_timestamp ON daemon_health_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_daemon_health_logs_target ON daemon_health_logs(target);
      CREATE INDEX IF NOT EXISTS idx_telegram_alert_log_sent_at ON telegram_alert_log(sent_at);
    `);
  }

  /**
   * Execute a raw SQL query
   */
  exec(sql: string): void {
    this.getConnection().exec(sql);
  }

  /**
   * Prepare a statement
   */
  prepare<T = unknown>(sql: string): ReturnType<Database['prepare']> {
    return this.getConnection().prepare(sql);
  }

  /**
   * Query and return all results
   */
  query<T = unknown>(sql: string, params: unknown[] = []): T[] {
    const stmt = this.getConnection().prepare(sql);
    return stmt.all(...(params as (string | number | null)[])) as T[];
  }

  /**
   * Query and return first result
   */
  queryOne<T = unknown>(sql: string, params: unknown[] = []): T | null {
    const stmt = this.getConnection().prepare(sql);
    return (stmt.get(...(params as (string | number | null)[])) as T) ?? null;
  }

  /**
   * Run a transaction
   */
  transaction<T>(fn: () => T): T {
    const db = this.getConnection();
    db.exec('BEGIN TRANSACTION');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  /**
   * Clean old metrics (retention policy)
   */
  cleanOldMetrics(retentionDays: number = 7): number {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const stmt = this.prepare('DELETE FROM metrics WHERE timestamp < ?');
    const result = stmt.run(cutoff.toISOString());
    return result.changes;
  }

  /**
   * Vacuum database to reclaim space
   */
  vacuum(): void {
    this.getConnection().exec('VACUUM');
  }

  /**
   * Get database file size in bytes
   */
  getSize(): number {
    if (this.options.inMemory) {
      return 0;
    }
    try {
      const file = Bun.file(this.options.filename);
      return file.size;
    } catch {
      return 0;
    }
  }
}
