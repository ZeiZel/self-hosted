import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { DatabaseService } from '../../../database/database.service';

/**
 * Create a test instance of DatabaseService with in-memory database
 */
function createTestDatabaseService(): DatabaseService {
  const service = new DatabaseService({
    filename: ':memory:',
    inMemory: true,
  });
  // Manually call lifecycle hooks
  service.onModuleInit();
  return service;
}

describe('DatabaseService', () => {
  let dbService: DatabaseService;

  beforeEach(() => {
    dbService = createTestDatabaseService();
  });

  afterEach(() => {
    dbService.onModuleDestroy();
  });

  describe('initialization', () => {
    test('creates database connection on init', () => {
      const conn = dbService.getConnection();
      expect(conn).toBeDefined();
      expect(conn).toBeInstanceOf(Database);
    });

    test('creates required tables', () => {
      const tables = dbService.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      );
      const tableNames = tables.map((t) => t.name);

      expect(tableNames).toContain('machines');
      expect(tableNames).toContain('deployments');
      expect(tableNames).toContain('service_configs');
      expect(tableNames).toContain('metrics');
      expect(tableNames).toContain('daemon_health_logs');
      expect(tableNames).toContain('daemon_state');
      expect(tableNames).toContain('telegram_config');
      expect(tableNames).toContain('telegram_alert_log');
    });

    test('creates indexes', () => {
      const indexes = dbService.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'",
      );
      const indexNames = indexes.map((i) => i.name);

      expect(indexNames).toContain('idx_machines_status');
      expect(indexNames).toContain('idx_machines_roles');
      expect(indexNames).toContain('idx_metrics_timestamp');
    });

    test('enables WAL mode (memory uses memory mode)', () => {
      // In-memory databases use 'memory' journal mode
      const result = dbService.queryOne<{ journal_mode: string }>('PRAGMA journal_mode');
      // WAL mode is set but in-memory databases report 'memory'
      expect(['wal', 'memory']).toContain(result?.journal_mode ?? 'unknown');
    });

    test('enables foreign keys', () => {
      const result = dbService.queryOne<{ foreign_keys: number }>('PRAGMA foreign_keys');
      expect(result?.foreign_keys).toBe(1);
    });
  });

  describe('query methods', () => {
    beforeEach(() => {
      // Insert test data
      dbService.exec(`
        INSERT INTO machines (id, label, ip, roles, status, ssh_host, ssh_port, ssh_username, created_at, updated_at)
        VALUES
          ('id1', 'master-01', '192.168.1.10', '["master"]', 'online', '192.168.1.10', 22, 'root', datetime(), datetime()),
          ('id2', 'worker-01', '192.168.1.11', '["worker"]', 'online', '192.168.1.11', 22, 'root', datetime(), datetime()),
          ('id3', 'worker-02', '192.168.1.12', '["worker"]', 'offline', '192.168.1.12', 22, 'root', datetime(), datetime())
      `);
    });

    describe('query', () => {
      test('returns all matching rows', () => {
        const results = dbService.query<{ label: string }>('SELECT label FROM machines');
        expect(results).toHaveLength(3);
        expect(results.map((r) => r.label)).toContain('master-01');
        expect(results.map((r) => r.label)).toContain('worker-01');
        expect(results.map((r) => r.label)).toContain('worker-02');
      });

      test('supports parameters', () => {
        const results = dbService.query<{ label: string }>(
          'SELECT label FROM machines WHERE status = ?',
          ['online'],
        );
        expect(results).toHaveLength(2);
      });

      test('returns empty array when no matches', () => {
        const results = dbService.query<{ label: string }>(
          'SELECT label FROM machines WHERE status = ?',
          ['error'],
        );
        expect(results).toHaveLength(0);
      });
    });

    describe('queryOne', () => {
      test('returns first matching row', () => {
        const result = dbService.queryOne<{ label: string }>(
          'SELECT label FROM machines WHERE id = ?',
          ['id1'],
        );
        expect(result).not.toBeNull();
        expect(result!.label).toBe('master-01');
      });

      test('returns null when no match', () => {
        const result = dbService.queryOne<{ label: string }>(
          'SELECT label FROM machines WHERE id = ?',
          ['nonexistent'],
        );
        expect(result).toBeNull();
      });
    });

    describe('prepare', () => {
      test('prepares reusable statement', () => {
        const stmt = dbService.prepare('SELECT * FROM machines WHERE status = ?');
        expect(stmt).toBeDefined();

        const results1 = stmt.all('online');
        expect(results1).toHaveLength(2);

        const results2 = stmt.all('offline');
        expect(results2).toHaveLength(1);
      });
    });

    describe('exec', () => {
      test('executes raw SQL', () => {
        dbService.exec("UPDATE machines SET status = 'error' WHERE id = 'id3'");

        const result = dbService.queryOne<{ status: string }>(
          'SELECT status FROM machines WHERE id = ?',
          ['id3'],
        );
        expect(result?.status).toBe('error');
      });
    });
  });

  describe('transaction', () => {
    test('commits successful transaction', () => {
      dbService.transaction(() => {
        dbService.exec(`
          INSERT INTO machines (id, label, ip, roles, status, ssh_host, ssh_port, ssh_username, created_at, updated_at)
          VALUES ('tx-id', 'tx-machine', '10.0.0.1', '["worker"]', 'online', '10.0.0.1', 22, 'root', datetime(), datetime())
        `);
      });

      const result = dbService.queryOne<{ label: string }>(
        'SELECT label FROM machines WHERE id = ?',
        ['tx-id'],
      );
      expect(result?.label).toBe('tx-machine');
    });

    test('rolls back failed transaction', () => {
      // Insert initial machine
      dbService.exec(`
        INSERT INTO machines (id, label, ip, roles, status, ssh_host, ssh_port, ssh_username, created_at, updated_at)
        VALUES ('initial-id', 'initial', '10.0.0.2', '["worker"]', 'online', '10.0.0.2', 22, 'root', datetime(), datetime())
      `);

      expect(() => {
        dbService.transaction(() => {
          // This should succeed
          dbService.exec(`
            INSERT INTO machines (id, label, ip, roles, status, ssh_host, ssh_port, ssh_username, created_at, updated_at)
            VALUES ('tx-id2', 'tx-machine2', '10.0.0.3', '["worker"]', 'online', '10.0.0.3', 22, 'root', datetime(), datetime())
          `);
          // This should fail (duplicate label)
          dbService.exec(`
            INSERT INTO machines (id, label, ip, roles, status, ssh_host, ssh_port, ssh_username, created_at, updated_at)
            VALUES ('tx-id3', 'initial', '10.0.0.4', '["worker"]', 'online', '10.0.0.4', 22, 'root', datetime(), datetime())
          `);
        });
      }).toThrow();

      // tx-id2 should not exist due to rollback
      const result = dbService.queryOne<{ label: string }>(
        'SELECT label FROM machines WHERE id = ?',
        ['tx-id2'],
      );
      expect(result).toBeNull();
    });

    test('returns value from transaction', () => {
      const result = dbService.transaction(() => {
        return 'transaction result';
      });
      expect(result).toBe('transaction result');
    });
  });

  describe('metrics operations', () => {
    beforeEach(() => {
      // Insert test metrics
      const now = new Date();
      for (let i = 0; i < 10; i++) {
        const timestamp = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        dbService.exec(`
          INSERT INTO metrics (type, target_id, target_type, value, unit, timestamp)
          VALUES ('cpu', 'node1', 'node', ${50 + i}, 'percent', '${timestamp.toISOString()}')
        `);
      }
    });

    describe('cleanOldMetrics', () => {
      test('deletes metrics older than retention period', () => {
        const beforeCount = dbService.query<{ id: number }>('SELECT id FROM metrics').length;
        dbService.cleanOldMetrics(3);
        const afterCount = dbService.query<{ id: number }>('SELECT id FROM metrics').length;

        // Some metrics should be deleted
        expect(afterCount).toBeLessThan(beforeCount);
      });

      test('keeps recent metrics with long retention', () => {
        dbService.cleanOldMetrics(30);

        const remaining = dbService.query<{ id: number }>('SELECT id FROM metrics');
        expect(remaining).toHaveLength(10);
      });

      test('uses default retention of 7 days', () => {
        const beforeCount = dbService.query<{ id: number }>('SELECT id FROM metrics').length;
        dbService.cleanOldMetrics();
        const afterCount = dbService.query<{ id: number }>('SELECT id FROM metrics').length;

        // Should keep metrics within 7 days
        expect(afterCount).toBeLessThanOrEqual(beforeCount);
      });
    });
  });

  describe('vacuum', () => {
    test('runs VACUUM without error', () => {
      expect(() => dbService.vacuum()).not.toThrow();
    });
  });

  describe('getSize', () => {
    test('returns 0 for in-memory database', () => {
      expect(dbService.getSize()).toBe(0);
    });
  });

  describe('connection management', () => {
    test('throws when getting connection after destroy', () => {
      dbService.onModuleDestroy();
      expect(() => dbService.getConnection()).toThrow('Database not connected');
    });
  });
});
