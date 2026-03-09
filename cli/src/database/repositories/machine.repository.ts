import { Injectable, Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database.service';
import {
  Machine,
  MachineRole,
  MachineStatus,
  CreateMachineInput,
  UpdateMachineInput,
} from '../entities/machine.entity';
import { createTimestamps, updateTimestamp } from '../entities/base.entity';

/**
 * Row type returned from SQLite
 */
interface MachineRow {
  id: string;
  label: string;
  ip: string;
  roles: string;
  status: string;
  ssh_host: string;
  ssh_port: number;
  ssh_username: string;
  ssh_private_key_path: string | null;
  last_seen: string | null;
  facts: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Repository for machine CRUD operations
 */
@Injectable()
export class MachineRepository {
  constructor(
    @Inject(DatabaseService)
    private readonly db: DatabaseService,
  ) {}

  /**
   * Find all machines
   */
  findAll(): Machine[] {
    const rows = this.db.query<MachineRow>('SELECT * FROM machines ORDER BY label');
    return rows.map((row) => this.rowToMachine(row));
  }

  /**
   * Find machine by ID
   */
  findById(id: string): Machine | null {
    const row = this.db.queryOne<MachineRow>('SELECT * FROM machines WHERE id = ?', [id]);
    return row ? this.rowToMachine(row) : null;
  }

  /**
   * Find machine by label
   */
  findByLabel(label: string): Machine | null {
    const row = this.db.queryOne<MachineRow>('SELECT * FROM machines WHERE label = ?', [label]);
    return row ? this.rowToMachine(row) : null;
  }

  /**
   * Find machine by IP
   */
  findByIp(ip: string): Machine | null {
    const row = this.db.queryOne<MachineRow>('SELECT * FROM machines WHERE ip = ?', [ip]);
    return row ? this.rowToMachine(row) : null;
  }

  /**
   * Find machines by role
   */
  findByRole(role: MachineRole): Machine[] {
    const rows = this.db.query<MachineRow>(
      "SELECT * FROM machines WHERE roles LIKE '%' || ? || '%' ORDER BY label",
      [role]
    );
    return rows.map((row) => this.rowToMachine(row));
  }

  /**
   * Find machines by status
   */
  findByStatus(status: MachineStatus): Machine[] {
    const rows = this.db.query<MachineRow>(
      'SELECT * FROM machines WHERE status = ? ORDER BY label',
      [status]
    );
    return rows.map((row) => this.rowToMachine(row));
  }

  /**
   * Create a new machine
   */
  create(input: CreateMachineInput): Machine {
    const id = randomUUID();
    const timestamps = createTimestamps();

    const stmt = this.db.prepare(`
      INSERT INTO machines (
        id, label, ip, roles, status,
        ssh_host, ssh_port, ssh_username, ssh_private_key_path,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.label,
      input.ip,
      JSON.stringify(input.roles),
      MachineStatus.UNKNOWN,
      input.ssh.host ?? input.ip,
      input.ssh.port ?? 22,
      input.ssh.username ?? 'root',
      input.ssh.privateKeyPath ?? null,
      timestamps.createdAt,
      timestamps.updatedAt,
    );

    return this.findById(id)!;
  }

  /**
   * Update a machine
   */
  update(id: string, input: UpdateMachineInput): Machine | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (input.label !== undefined) {
      updates.push('label = ?');
      values.push(input.label);
    }
    if (input.ip !== undefined) {
      updates.push('ip = ?');
      values.push(input.ip);
    }
    if (input.roles !== undefined) {
      updates.push('roles = ?');
      values.push(JSON.stringify(input.roles));
    }
    if (input.status !== undefined) {
      updates.push('status = ?');
      values.push(input.status);
    }
    if (input.ssh?.host !== undefined) {
      updates.push('ssh_host = ?');
      values.push(input.ssh.host);
    }
    if (input.ssh?.port !== undefined) {
      updates.push('ssh_port = ?');
      values.push(input.ssh.port);
    }
    if (input.ssh?.username !== undefined) {
      updates.push('ssh_username = ?');
      values.push(input.ssh.username);
    }
    if (input.ssh?.privateKeyPath !== undefined) {
      updates.push('ssh_private_key_path = ?');
      values.push(input.ssh.privateKeyPath);
    }
    if (input.lastSeen !== undefined) {
      updates.push('last_seen = ?');
      values.push(input.lastSeen);
    }
    if (input.facts !== undefined) {
      updates.push('facts = ?');
      values.push(JSON.stringify(input.facts));
    }

    // Always update timestamp
    updates.push('updated_at = ?');
    values.push(updateTimestamp().updatedAt);

    // Add id for WHERE clause
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE machines SET ${updates.join(', ')} WHERE id = ?
    `);
    stmt.run(...values);

    return this.findById(id);
  }

  /**
   * Delete a machine
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM machines WHERE id = ?');
    stmt.run(id);
    return this.db.getConnection().changes > 0;
  }

  /**
   * Delete all machines
   */
  deleteAll(): number {
    const stmt = this.db.prepare('DELETE FROM machines');
    stmt.run();
    return this.db.getConnection().changes;
  }

  /**
   * Count machines
   */
  count(): number {
    const row = this.db.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM machines');
    return row?.count ?? 0;
  }

  /**
   * Count by status
   */
  countByStatus(): Record<MachineStatus, number> {
    const rows = this.db.query<{ status: string; count: number }>(
      'SELECT status, COUNT(*) as count FROM machines GROUP BY status'
    );

    const result: Record<MachineStatus, number> = {
      [MachineStatus.ONLINE]: 0,
      [MachineStatus.OFFLINE]: 0,
      [MachineStatus.ERROR]: 0,
      [MachineStatus.UNKNOWN]: 0,
    };

    for (const row of rows) {
      result[row.status as MachineStatus] = row.count;
    }

    return result;
  }

  /**
   * Count by role
   */
  countByRole(): Record<MachineRole, number> {
    const machines = this.findAll();
    const result: Record<MachineRole, number> = {
      [MachineRole.MASTER]: 0,
      [MachineRole.WORKER]: 0,
      [MachineRole.GATEWAY]: 0,
      [MachineRole.STORAGE]: 0,
      [MachineRole.BACKUPS]: 0,
    };

    for (const machine of machines) {
      for (const role of machine.roles) {
        result[role]++;
      }
    }

    return result;
  }

  /**
   * Convert SQLite row to Machine model
   */
  private rowToMachine(row: MachineRow): Machine {
    return {
      id: row.id,
      label: row.label,
      ip: row.ip,
      roles: JSON.parse(row.roles) as MachineRole[],
      status: row.status as MachineStatus,
      ssh: {
        host: row.ssh_host,
        port: row.ssh_port,
        username: row.ssh_username,
        privateKeyPath: row.ssh_private_key_path ?? undefined,
      },
      lastSeen: row.last_seen ?? undefined,
      facts: row.facts ? JSON.parse(row.facts) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
