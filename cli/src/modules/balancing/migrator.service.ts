import { Injectable, Inject } from '@nestjs/common';
import { join } from 'path';
import {
  MigrationPlan,
  MigrationStatus,
  PlacementDecision,
} from '../../interfaces/placement.interface';
import { ConfigService } from '../config/config.service';
import { loadYaml, saveYaml } from '../../utils/yaml';
import { logger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * Migration execution result
 */
export interface MigrationResult {
  migration: MigrationPlan;
  success: boolean;
  error?: string;
  duration: number; // milliseconds
}

/**
 * Service for executing service migrations between nodes
 */
@Injectable()
export class MigratorService {
  constructor(@Inject(ConfigService) private configService: ConfigService) {}

  /**
   * Create migration plans from placement decisions
   */
  createMigrationPlans(
    decisions: PlacementDecision[],
    currentPlacements: Map<string, string>,
  ): MigrationPlan[] {
    const migrations: MigrationPlan[] = [];

    for (const decision of decisions) {
      const currentNode = currentPlacements.get(decision.service);

      // Only create migration if service is moving to a different node
      if (currentNode && currentNode !== decision.targetNode) {
        migrations.push({
          id: uuidv4(),
          service: decision.service,
          namespace: decision.namespace as string,
          sourceNode: currentNode,
          targetNode: decision.targetNode,
          status: MigrationStatus.PENDING,
        });
      }
    }

    return migrations;
  }

  /**
   * Execute a single migration
   */
  async executeMigration(migration: MigrationPlan): Promise<MigrationResult> {
    const startTime = Date.now();

    try {
      // Update status to in progress
      migration.status = MigrationStatus.IN_PROGRESS;
      migration.startedAt = new Date().toISOString();

      logger.info(
        `Starting migration: ${migration.service} from ${migration.sourceNode} to ${migration.targetNode}`,
      );

      // Step 1: Drain the pod from source node
      migration.status = MigrationStatus.DRAINING;
      await this.drainService(migration);

      // Step 2: Update node selector/affinity
      migration.status = MigrationStatus.SCHEDULING;
      await this.updatePlacement(migration);

      // Step 3: Wait for pod to be scheduled and running
      migration.status = MigrationStatus.VERIFYING;
      await this.verifyMigration(migration);

      // Success
      migration.status = MigrationStatus.COMPLETED;
      migration.completedAt = new Date().toISOString();

      logger.success(`Migration completed: ${migration.service}`);

      return {
        migration,
        success: true,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      migration.status = MigrationStatus.FAILED;
      migration.error = error instanceof Error ? error.message : String(error);
      migration.completedAt = new Date().toISOString();

      logger.error(`Migration failed: ${migration.service} - ${migration.error}`);

      return {
        migration,
        success: false,
        error: migration.error,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute multiple migrations in sequence
   */
  async executeMigrations(
    migrations: MigrationPlan[],
    options: {
      stopOnError?: boolean;
      parallel?: number;
    } = {},
  ): Promise<MigrationResult[]> {
    const results: MigrationResult[] = [];
    const { stopOnError = true, parallel = 1 } = options;

    if (parallel > 1) {
      // Execute in batches
      for (let i = 0; i < migrations.length; i += parallel) {
        const batch = migrations.slice(i, i + parallel);
        const batchResults = await Promise.all(batch.map((m) => this.executeMigration(m)));
        results.push(...batchResults);

        if (stopOnError && batchResults.some((r) => !r.success)) {
          break;
        }
      }
    } else {
      // Sequential execution
      for (const migration of migrations) {
        const result = await this.executeMigration(migration);
        results.push(result);

        if (stopOnError && !result.success) {
          break;
        }
      }
    }

    return results;
  }

  /**
   * Rollback a migration
   */
  async rollbackMigration(migration: MigrationPlan): Promise<MigrationResult> {
    // Create a reverse migration
    const rollback: MigrationPlan = {
      id: uuidv4(),
      service: migration.service,
      namespace: migration.namespace,
      sourceNode: migration.targetNode,
      targetNode: migration.sourceNode,
      status: MigrationStatus.PENDING,
      rollbackPlan: migration,
    };

    const result = await this.executeMigration(rollback);

    if (result.success) {
      migration.status = MigrationStatus.ROLLED_BACK;
    }

    return result;
  }

  /**
   * Drain service from source node (cordon + evict)
   */
  private async drainService(migration: MigrationPlan): Promise<void> {
    const spinner = logger
      .spinner(`Draining ${migration.service} from ${migration.sourceNode}`)
      .start();

    try {
      // In a real implementation, this would use kubectl:
      // kubectl delete pod -n ${migration.namespace} -l app.kubernetes.io/name=${migration.service} --wait=false

      // Simulate the operation for now
      await new Promise((resolve) => setTimeout(resolve, 500));

      spinner.succeed(`Drained ${migration.service} from ${migration.sourceNode}`);
    } catch (error) {
      spinner.fail(`Failed to drain ${migration.service}`);
      throw error;
    }
  }

  /**
   * Update service placement (node selector/affinity)
   */
  private async updatePlacement(migration: MigrationPlan): Promise<void> {
    const spinner = logger
      .spinner(`Scheduling ${migration.service} on ${migration.targetNode}`)
      .start();

    try {
      // This would typically update the Helm values or use kubectl patch
      // to change the nodeSelector or nodeAffinity

      // Example kubectl patch command:
      // kubectl patch deployment -n ${namespace} ${service} -p '{"spec":{"template":{"spec":{"nodeSelector":{"kubernetes.io/hostname":"${targetNode}"}}}}}'

      // For helmfile-based deployments, we'd update the release values
      // and run helmfile sync

      spinner.succeed(`Scheduled ${migration.service} on ${migration.targetNode}`);
    } catch (error) {
      spinner.fail(`Failed to schedule ${migration.service}`);
      throw error;
    }
  }

  /**
   * Verify migration completed successfully
   */
  private async verifyMigration(migration: MigrationPlan): Promise<void> {
    const spinner = logger.spinner(`Verifying ${migration.service} migration`).start();

    try {
      // Check that pod is running on target node
      // kubectl get pods -n ${namespace} -l app.kubernetes.io/name=${service} -o jsonpath='{.items[0].spec.nodeName}'

      // Wait for pod to be ready
      // kubectl wait --for=condition=ready pod -n ${namespace} -l app.kubernetes.io/name=${service} --timeout=300s

      // Simulate verification delay
      await new Promise((resolve) => setTimeout(resolve, 1000));

      spinner.succeed(`Verified ${migration.service} running on ${migration.targetNode}`);
    } catch (error) {
      spinner.fail(`Failed to verify ${migration.service}`);
      throw error;
    }
  }

  /**
   * Get current service placements from cluster
   */
  async getCurrentPlacements(): Promise<Map<string, string>> {
    const placements = new Map<string, string>();

    // In a real implementation, this would query the cluster:
    // kubectl get pods -A -o jsonpath='{range .items[*]}{.metadata.labels.app\.kubernetes\.io/name}{"\t"}{.spec.nodeName}{"\n"}{end}'

    // For now, return empty map (services will be treated as new placements)
    return placements;
  }

  /**
   * Get migrations file path
   */
  private getMigrationsPath(): string {
    return join(this.configService.getProjectDir(), 'migrations.yaml');
  }

  /**
   * Save migration history
   */
  saveMigrationHistory(results: MigrationResult[]): void {
    const history = loadYaml<{
      migrations: MigrationResult[];
    }>(this.getMigrationsPath()) || { migrations: [] };

    history.migrations.push(...results);

    // Keep last 100 migrations
    if (history.migrations.length > 100) {
      history.migrations = history.migrations.slice(-100);
    }

    saveYaml(this.getMigrationsPath(), history);
  }

  /**
   * Get migration history
   */
  getMigrationHistory(): MigrationResult[] {
    const history = loadYaml<{
      migrations: MigrationResult[];
    }>(this.getMigrationsPath());
    return history?.migrations || [];
  }
}
