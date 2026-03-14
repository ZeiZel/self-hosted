/**
 * In-memory database mock for testing
 */

import { Database } from 'bun:sqlite';

/**
 * Create an in-memory test database with schema
 */
export function createTestDatabase(): Database {
  const db = new Database(':memory:');

  // Enable WAL mode
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  // Create schema (matching database.service.ts)
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

  db.exec(`
    CREATE TABLE IF NOT EXISTS daemon_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_machines_status ON machines(status);
    CREATE INDEX IF NOT EXISTS idx_machines_roles ON machines(roles);
    CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);
    CREATE INDEX IF NOT EXISTS idx_service_configs_enabled ON service_configs(enabled);
    CREATE INDEX IF NOT EXISTS idx_metrics_target ON metrics(target_id, target_type);
    CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp);
    CREATE INDEX IF NOT EXISTS idx_daemon_health_logs_status ON daemon_health_logs(status);
    CREATE INDEX IF NOT EXISTS idx_daemon_health_logs_timestamp ON daemon_health_logs(timestamp);
  `);

  return db;
}

/**
 * Seed test data into the database
 */
export function seedTestData(db: Database): void {
  const now = new Date().toISOString();

  // Seed machines
  db.run(
    `
    INSERT INTO machines (id, label, ip, roles, status, ssh_host, ssh_port, ssh_username, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      'machine-1',
      'master-01',
      '192.168.1.10',
      '["master"]',
      'online',
      '192.168.1.10',
      22,
      'root',
      now,
      now,
    ],
  );

  db.run(
    `
    INSERT INTO machines (id, label, ip, roles, status, ssh_host, ssh_port, ssh_username, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      'machine-2',
      'worker-01',
      '192.168.1.11',
      '["worker"]',
      'online',
      '192.168.1.11',
      22,
      'root',
      now,
      now,
    ],
  );

  // Seed service configs
  db.run(
    `
    INSERT INTO service_configs (id, name, enabled, tier, namespace, resources, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      'svc-1',
      'traefik',
      1,
      'infrastructure',
      'ingress',
      '{"cpu": "500m", "memory": "512Mi"}',
      now,
      now,
    ],
  );

  db.run(
    `
    INSERT INTO service_configs (id, name, enabled, tier, namespace, resources, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
    ['svc-2', 'postgresql', 1, 'database', 'db', '{"cpu": "2000m", "memory": "4Gi"}', now, now],
  );
}

/**
 * Create a mock DatabaseService
 */
export function createMockDatabaseService(db?: Database) {
  const database = db || createTestDatabase();

  return {
    getConnection: () => database,
    exec: (sql: string) => database.exec(sql),
    prepare: (sql: string) => database.prepare(sql),
    query: <T>(sql: string, params: unknown[] = []): T[] => {
      const stmt = database.prepare(sql);
      return stmt.all(...(params as (string | number | null)[])) as T[];
    },
    queryOne: <T>(sql: string, params: unknown[] = []): T | null => {
      const stmt = database.prepare(sql);
      return (stmt.get(...(params as (string | number | null)[])) as T) ?? null;
    },
    transaction: <T>(fn: () => T): T => {
      database.exec('BEGIN TRANSACTION');
      try {
        const result = fn();
        database.exec('COMMIT');
        return result;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
    cleanOldMetrics: () => 0,
    vacuum: () => {},
    getSize: () => 0,
  };
}
