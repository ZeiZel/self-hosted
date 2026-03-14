import { Injectable, Inject } from '@nestjs/common';
import {
  BalancingStrategy,
  BalancingOptions,
  NodeState,
  PlacementPlan,
  PlacementDecision,
  PlacementConstraint,
  PlacementMetrics,
  MigrationPlan,
  getUtilization,
} from '../../interfaces/placement.interface';
import { Machine, MachineFacts } from '../../interfaces/machine.interface';
import { InventoryService } from '../inventory/inventory.service';
import { ServicesService } from '../services/services.service';
import { ConstraintsService } from './constraints.service';
import { MigratorService } from './migrator.service';
import { PresetsService } from './presets.service';
import {
  BinPackingStrategy,
  RoundRobinStrategy,
  WeightedStrategy,
  AffinityStrategy,
  SpreadStrategy,
  BaseStrategy,
} from './strategies';
import { v4 as uuidv4 } from 'uuid';

/**
 * Main balancing orchestration service
 */
@Injectable()
export class BalancingService {
  private strategies: Map<BalancingStrategy, BaseStrategy> = new Map();

  constructor(
    @Inject(InventoryService) private inventoryService: InventoryService,
    @Inject(ServicesService) private servicesService: ServicesService,
    @Inject(ConstraintsService) private constraintsService: ConstraintsService,
    @Inject(MigratorService) private migratorService: MigratorService,
    @Inject(PresetsService) private presetsService: PresetsService,
    @Inject(BinPackingStrategy) private binPackingStrategy: BinPackingStrategy,
    @Inject(RoundRobinStrategy) private roundRobinStrategy: RoundRobinStrategy,
    @Inject(WeightedStrategy) private weightedStrategy: WeightedStrategy,
    @Inject(AffinityStrategy) private affinityStrategy: AffinityStrategy,
    @Inject(SpreadStrategy) private spreadStrategy: SpreadStrategy,
  ) {
    this.strategies.set(BalancingStrategy.BIN_PACKING, this.binPackingStrategy);
    this.strategies.set(BalancingStrategy.ROUND_ROBIN, this.roundRobinStrategy);
    this.strategies.set(BalancingStrategy.WEIGHTED, this.weightedStrategy);
    this.strategies.set(BalancingStrategy.AFFINITY, this.affinityStrategy);
    this.strategies.set(BalancingStrategy.SPREAD, this.spreadStrategy);
  }

  /**
   * Generate a placement plan using the specified strategy
   */
  async generatePlan(options: BalancingOptions): Promise<PlacementPlan> {
    const machines = this.inventoryService.getAll();
    const services = this.servicesService.getEnabled();

    // Filter services if specified
    const targetServices = options.excludeServices
      ? services.filter((s) => !options.excludeServices!.includes(s.name))
      : services;

    // Build node state
    const nodes = this.buildNodeState(machines, options);

    // Generate constraints
    const defaultConstraints = this.constraintsService.generateDefaultConstraints(targetServices);
    const constraints = options.respectConstraints ? defaultConstraints : [];

    // Get strategy
    const strategy = this.strategies.get(options.strategy);
    if (!strategy) {
      throw new Error(`Unknown strategy: ${options.strategy}`);
    }

    // Execute strategy
    const placements = strategy.execute(targetServices, nodes, constraints);

    // Calculate migrations if needed
    let migrations: MigrationPlan[] = [];
    if (options.allowMigrations) {
      const currentPlacements = await this.migratorService.getCurrentPlacements();
      migrations = this.migratorService.createMigrationPlans(placements, currentPlacements);

      // Limit migrations if specified
      if (options.maxMigrations && migrations.length > options.maxMigrations) {
        migrations = migrations.slice(0, options.maxMigrations);
      }
    }

    // Validate constraints
    const validation = this.constraintsService.validatePlacements(placements, constraints, nodes);

    // Calculate metrics
    const metrics = this.calculateMetrics(placements, nodes, constraints, migrations);

    // Build plan
    const plan: PlacementPlan = {
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      strategy: options.strategy,
      nodes: nodes.map((n) => ({
        ...n,
        allocatedCpu: placements
          .filter((p) => p.targetNode === n.label)
          .reduce((sum, p) => sum + p.resources.cpu * p.replicas, 0),
        allocatedMemory: placements
          .filter((p) => p.targetNode === n.label)
          .reduce((sum, p) => sum + p.resources.memory * p.replicas, 0),
      })),
      placements,
      migrations,
      constraints,
      warnings: validation.warnings,
      errors: validation.violations.filter((v) => v.hard).map((v) => v.message),
      score: metrics.balanceScore,
      metrics,
    };

    return plan;
  }

  /**
   * Apply a placement plan
   */
  async applyPlan(
    plan: PlacementPlan,
    options: { dryRun?: boolean; parallel?: number } = {},
  ): Promise<{
    success: boolean;
    migrationsCompleted: number;
    migrationsFailed: number;
    errors: string[];
  }> {
    if (options.dryRun) {
      return {
        success: true,
        migrationsCompleted: plan.migrations.length,
        migrationsFailed: 0,
        errors: [],
      };
    }

    if (plan.migrations.length === 0) {
      return {
        success: true,
        migrationsCompleted: 0,
        migrationsFailed: 0,
        errors: [],
      };
    }

    const results = await this.migratorService.executeMigrations(plan.migrations, {
      parallel: options.parallel || 1,
      stopOnError: false,
    });

    const completed = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const errors = results
      .filter((r) => !r.success)
      .map((r) => `${r.migration.service}: ${r.error}`);

    // Save migration history
    this.migratorService.saveMigrationHistory(results);

    return {
      success: failed === 0,
      migrationsCompleted: completed,
      migrationsFailed: failed,
      errors,
    };
  }

  /**
   * Get available strategies
   */
  getStrategies(): {
    name: BalancingStrategy;
    description: string;
  }[] {
    return Array.from(this.strategies.values()).map((s) => ({
      name: s.name,
      description: s.description,
    }));
  }

  /**
   * Build node state from machines
   */
  private buildNodeState(machines: Machine[], options: BalancingOptions): NodeState[] {
    return machines
      .filter((m) => !options.excludeNodes?.includes(m.label))
      .filter((m) => m.status === 'online' || m.status === 'unknown')
      .map((m) => {
        // Safely extract facts with proper typing
        const facts = m.facts as MachineFacts | undefined;
        const cpuCores = typeof facts?.cpuCores === 'number' ? facts.cpuCores : 4;
        const memoryTotal = typeof facts?.memoryTotal === 'number' ? facts.memoryTotal : 8 * 1024 * 1024 * 1024;

        return {
          label: m.label,
          ip: m.ip,
          roles: m.roles,
          totalCpu: cpuCores * 1000,
          totalMemory: memoryTotal,
          allocatedCpu: 0,
          allocatedMemory: 0,
          services: [] as string[],
        };
      });
  }

  /**
   * Calculate placement metrics
   */
  private calculateMetrics(
    placements: PlacementDecision[],
    nodes: NodeState[],
    constraints: PlacementConstraint[],
    migrations: MigrationPlan[],
  ): PlacementMetrics {
    // Calculate per-node utilization
    const nodeUtilizations = nodes.map((node) => {
      const nodePlacements = placements.filter((p) => p.targetNode === node.label);
      const cpuUsed = nodePlacements.reduce((sum, p) => sum + p.resources.cpu * p.replicas, 0);
      const memUsed = nodePlacements.reduce((sum, p) => sum + p.resources.memory * p.replicas, 0);

      return {
        cpu: getUtilization(cpuUsed, node.totalCpu),
        memory: getUtilization(memUsed, node.totalMemory),
      };
    });

    // Calculate total utilization
    const totalCpu = nodes.reduce((sum, n) => sum + n.totalCpu, 0);
    const usedCpu = placements.reduce((sum, p) => sum + p.resources.cpu * p.replicas, 0);
    const totalMemory = nodes.reduce((sum, n) => sum + n.totalMemory, 0);
    const usedMemory = placements.reduce((sum, p) => sum + p.resources.memory * p.replicas, 0);

    // Calculate balance score (how evenly distributed)
    const memoryUtils = nodeUtilizations.map((u) => u.memory);
    const avgUtil = memoryUtils.reduce((a, b) => a + b, 0) / memoryUtils.length || 0;
    const variance =
      memoryUtils.reduce((sum, u) => sum + Math.pow(u - avgUtil, 2), 0) / memoryUtils.length || 0;
    const stdDev = Math.sqrt(variance);

    // Balance score: 100 = perfectly balanced, lower = more unbalanced
    const balanceScore = Math.max(0, Math.round(100 - stdDev));

    // Count constraint satisfaction
    const validation = this.constraintsService.validatePlacements(placements, constraints, nodes);

    return {
      totalCpuUtilization: getUtilization(usedCpu, totalCpu),
      totalMemoryUtilization: getUtilization(usedMemory, totalMemory),
      balanceScore,
      migrationCount: migrations.length,
      constraintsSatisfied: constraints.length - validation.violations.length,
      constraintsViolated: validation.violations.length,
    };
  }

  /**
   * Compare two placement plans
   */
  comparePlans(
    planA: PlacementPlan,
    planB: PlacementPlan,
  ): {
    winner: 'A' | 'B' | 'tie';
    comparison: {
      metric: string;
      planA: number;
      planB: number;
      winner: 'A' | 'B' | 'tie';
    }[];
  } {
    const comparison = [
      {
        metric: 'Balance Score',
        planA: planA.metrics.balanceScore,
        planB: planB.metrics.balanceScore,
        winner: this.compareMetric(
          planA.metrics.balanceScore,
          planB.metrics.balanceScore,
          'higher',
        ),
      },
      {
        metric: 'CPU Utilization',
        planA: planA.metrics.totalCpuUtilization,
        planB: planB.metrics.totalCpuUtilization,
        winner: this.compareMetric(
          planA.metrics.totalCpuUtilization,
          planB.metrics.totalCpuUtilization,
          'lower',
        ),
      },
      {
        metric: 'Memory Utilization',
        planA: planA.metrics.totalMemoryUtilization,
        planB: planB.metrics.totalMemoryUtilization,
        winner: this.compareMetric(
          planA.metrics.totalMemoryUtilization,
          planB.metrics.totalMemoryUtilization,
          'lower',
        ),
      },
      {
        metric: 'Migration Count',
        planA: planA.metrics.migrationCount,
        planB: planB.metrics.migrationCount,
        winner: this.compareMetric(
          planA.metrics.migrationCount,
          planB.metrics.migrationCount,
          'lower',
        ),
      },
      {
        metric: 'Constraints Satisfied',
        planA: planA.metrics.constraintsSatisfied,
        planB: planB.metrics.constraintsSatisfied,
        winner: this.compareMetric(
          planA.metrics.constraintsSatisfied,
          planB.metrics.constraintsSatisfied,
          'higher',
        ),
      },
    ];

    // Count wins
    const winsA = comparison.filter((c) => c.winner === 'A').length;
    const winsB = comparison.filter((c) => c.winner === 'B').length;

    return {
      winner: winsA > winsB ? 'A' : winsB > winsA ? 'B' : 'tie',
      comparison,
    };
  }

  private compareMetric(a: number, b: number, preference: 'higher' | 'lower'): 'A' | 'B' | 'tie' {
    if (a === b) return 'tie';
    if (preference === 'higher') {
      return a > b ? 'A' : 'B';
    }
    return a < b ? 'A' : 'B';
  }

  /**
   * Get presets service
   */
  get presets(): PresetsService {
    return this.presetsService;
  }

  /**
   * Get migrator service
   */
  get migrator(): MigratorService {
    return this.migratorService;
  }
}
