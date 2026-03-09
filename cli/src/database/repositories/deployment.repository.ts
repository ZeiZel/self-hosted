import { Injectable, Inject } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import {
  Deployment,
  DeploymentStatus,
  DeploymentPhase,
  DeploymentLogEntry,
  CreateDeploymentInput,
} from '../entities/deployment.entity';
import { createTimestamps, updateTimestamp } from '../entities/base.entity';

/**
 * Row type returned from SQLite
 */
interface DeploymentRow {
  id: string;
  repo_path: string;
  status: string;
  current_phase: number;
  completed_phases: string;
  failed_phases: string;
  skipped_phases: string;
  config: string;
  logs: string;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Repository for deployment CRUD operations
 */
@Injectable()
export class DeploymentRepository {
  constructor(
    @Inject(DatabaseService)
    private readonly db: DatabaseService,
  ) {}

  /**
   * Find all deployments
   */
  findAll(limit?: number): Deployment[] {
    let sql = 'SELECT * FROM deployments ORDER BY started_at DESC';
    if (limit) {
      sql += ` LIMIT ${limit}`;
    }
    const stmt = this.db.prepare<DeploymentRow>(sql);
    const rows = stmt.all();
    return rows.map((row) => this.rowToDeployment(row));
  }

  /**
   * Find deployment by ID
   */
  findById(id: string): Deployment | null {
    const stmt = this.db.prepare<DeploymentRow>('SELECT * FROM deployments WHERE id = ?');
    const row = stmt.get(id);
    return row ? this.rowToDeployment(row) : null;
  }

  /**
   * Find active deployment (running or pending)
   */
  findActive(): Deployment | null {
    const stmt = this.db.prepare<DeploymentRow>(
      "SELECT * FROM deployments WHERE status IN ('pending', 'running') ORDER BY started_at DESC LIMIT 1",
    );
    const row = stmt.get();
    return row ? this.rowToDeployment(row) : null;
  }

  /**
   * Find deployments by status
   */
  findByStatus(status: DeploymentStatus): Deployment[] {
    const stmt = this.db.prepare<DeploymentRow>(
      'SELECT * FROM deployments WHERE status = ? ORDER BY started_at DESC',
    );
    const rows = stmt.all(status);
    return rows.map((row) => this.rowToDeployment(row));
  }

  /**
   * Create a new deployment
   */
  create(input: CreateDeploymentInput): Deployment {
    const id = `deploy-${Date.now()}`;
    const timestamps = createTimestamps();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO deployments (
        id, repo_path, status, current_phase,
        completed_phases, failed_phases, skipped_phases,
        config, logs, started_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.repoPath,
      DeploymentStatus.PENDING,
      DeploymentPhase.INFRASTRUCTURE_SETUP,
      '[]',
      '[]',
      '[]',
      JSON.stringify(input.config),
      '[]',
      now,
      timestamps.createdAt,
      timestamps.updatedAt,
    );

    return this.findById(id)!;
  }

  /**
   * Update deployment status
   */
  updateStatus(id: string, status: DeploymentStatus): Deployment | null {
    const completedAt =
      status === DeploymentStatus.SUCCESS ||
      status === DeploymentStatus.FAILED ||
      status === DeploymentStatus.CANCELLED
        ? new Date().toISOString()
        : null;

    const stmt = this.db.prepare(`
      UPDATE deployments
      SET status = ?, completed_at = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(status, completedAt, updateTimestamp().updatedAt, id);
    return this.findById(id);
  }

  /**
   * Update current phase
   */
  updatePhase(id: string, phase: DeploymentPhase): Deployment | null {
    const stmt = this.db.prepare(`
      UPDATE deployments
      SET current_phase = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(phase, updateTimestamp().updatedAt, id);
    return this.findById(id);
  }

  /**
   * Mark phase as completed
   */
  markPhaseCompleted(id: string, phase: DeploymentPhase): Deployment | null {
    const deployment = this.findById(id);
    if (!deployment) return null;

    if (!deployment.completedPhases.includes(phase)) {
      deployment.completedPhases.push(phase);
    }

    const stmt = this.db.prepare(`
      UPDATE deployments
      SET completed_phases = ?, current_phase = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      JSON.stringify(deployment.completedPhases),
      phase + 1,
      updateTimestamp().updatedAt,
      id,
    );

    return this.findById(id);
  }

  /**
   * Mark phase as failed
   */
  markPhaseFailed(id: string, phase: DeploymentPhase, error: string): Deployment | null {
    const deployment = this.findById(id);
    if (!deployment) return null;

    if (!deployment.failedPhases.includes(phase)) {
      deployment.failedPhases.push(phase);
    }

    // Add error log
    deployment.logs.push({
      timestamp: new Date().toISOString(),
      phase,
      level: 'error',
      message: error,
    });

    const stmt = this.db.prepare(`
      UPDATE deployments
      SET failed_phases = ?, logs = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      JSON.stringify(deployment.failedPhases),
      JSON.stringify(deployment.logs),
      updateTimestamp().updatedAt,
      id,
    );

    return this.findById(id);
  }

  /**
   * Mark phase as skipped
   */
  markPhaseSkipped(id: string, phase: DeploymentPhase): Deployment | null {
    const deployment = this.findById(id);
    if (!deployment) return null;

    if (!deployment.skippedPhases.includes(phase)) {
      deployment.skippedPhases.push(phase);
    }

    const stmt = this.db.prepare(`
      UPDATE deployments
      SET skipped_phases = ?, current_phase = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(JSON.stringify(deployment.skippedPhases), phase + 1, updateTimestamp().updatedAt, id);

    return this.findById(id);
  }

  /**
   * Add log entry
   */
  addLog(id: string, entry: DeploymentLogEntry): Deployment | null {
    const deployment = this.findById(id);
    if (!deployment) return null;

    deployment.logs.push(entry);

    const stmt = this.db.prepare(`
      UPDATE deployments
      SET logs = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(JSON.stringify(deployment.logs), updateTimestamp().updatedAt, id);
    return this.findById(id);
  }

  /**
   * Delete deployment
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM deployments WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Delete old deployments (keep last N)
   */
  deleteOld(keepCount: number = 10): number {
    const stmt = this.db.prepare(`
      DELETE FROM deployments
      WHERE id NOT IN (
        SELECT id FROM deployments
        ORDER BY started_at DESC
        LIMIT ?
      )
    `);
    const result = stmt.run(keepCount);
    return result.changes;
  }

  /**
   * Convert SQLite row to Deployment model
   */
  private rowToDeployment(row: DeploymentRow): Deployment {
    return {
      id: row.id,
      repoPath: row.repo_path,
      status: row.status as DeploymentStatus,
      currentPhase: row.current_phase as DeploymentPhase,
      completedPhases: JSON.parse(row.completed_phases),
      failedPhases: JSON.parse(row.failed_phases),
      skippedPhases: JSON.parse(row.skipped_phases),
      config: JSON.parse(row.config),
      logs: JSON.parse(row.logs),
      startedAt: row.started_at,
      completedAt: row.completed_at ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
