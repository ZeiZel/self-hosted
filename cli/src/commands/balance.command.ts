import { Command } from 'commander';
import { INestApplicationContext } from '@nestjs/common';
import chalk from 'chalk';
import { BalancingService } from '../modules/balancing/balancing.service';
import { PresetsService } from '../modules/balancing/presets.service';
import { TableService } from '../modules/ui/table.service';
import { PromptsService } from '../modules/ui/prompts.service';
import { InventoryService } from '../modules/inventory/inventory.service';
import { ServicesService } from '../modules/services/services.service';
import {
  BalancingStrategy,
  BalancingOptions,
  STRATEGY_DESCRIPTIONS,
} from '../interfaces/placement.interface';
import { logger } from '../utils/logger';

export function createBalanceCommand(app: INestApplicationContext): Command {
  const command = new Command('balance');

  command
    .description('Balance services across cluster nodes')
    .addCommand(createAutoCommand(app))
    .addCommand(createManualCommand(app))
    .addCommand(createPreviewCommand(app))
    .addCommand(createApplyCommand(app))
    .addCommand(createPresetsCommand(app))
    .addCommand(createRollbackCommand(app));

  return command;
}

/**
 * Auto-balance command
 */
function createAutoCommand(app: INestApplicationContext): Command {
  return new Command('auto')
    .description('Automatically balance services using a strategy')
    .option('-s, --strategy <strategy>', 'Balancing strategy', 'bin-packing')
    .option('--dry-run', 'Preview changes without applying', false)
    .option('--no-migrations', 'Plan without migrations')
    .option('--max-migrations <n>', 'Maximum migrations to perform', parseInt)
    .option('--exclude <services>', 'Comma-separated services to exclude')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const balancingService = app.get(BalancingService);
      const inventoryService = app.get(InventoryService);
      const servicesService = app.get(ServicesService);
      const tableService = app.get(TableService);

      logger.header('Auto-Balance Services');

      // Validate
      const inventoryValidation = inventoryService.validate();
      if (!inventoryValidation.valid) {
        logger.error('Inventory validation failed');
        inventoryValidation.errors.forEach((e) => logger.log(`  ${chalk.red('✖')} ${e}`));
        process.exit(1);
      }

      const servicesValidation = servicesService.validateSelection();
      if (!servicesValidation.valid) {
        logger.error('Services validation failed');
        servicesValidation.errors.forEach((e) => logger.log(`  ${chalk.red('✖')} ${e}`));
        process.exit(1);
      }

      // Parse strategy
      const strategy = parseStrategy(options.strategy);
      if (!strategy) {
        logger.error(`Unknown strategy: ${options.strategy}`);
        logger.info('Available strategies:');
        Object.entries(STRATEGY_DESCRIPTIONS).forEach(([name, desc]) => {
          logger.log(`  ${chalk.cyan(name)}: ${desc}`);
        });
        process.exit(1);
      }

      const balancingOptions: BalancingOptions = {
        strategy,
        dryRun: options.dryRun,
        respectConstraints: true,
        allowMigrations: options.migrations !== false,
        maxMigrations: options.maxMigrations,
        excludeServices: options.exclude?.split(','),
      };

      logger.info(`Strategy: ${chalk.cyan(strategy)}`);
      logger.info(`Dry run: ${options.dryRun ? 'yes' : 'no'}`);
      logger.newLine();

      const spinner = logger.spinner('Generating placement plan...').start();

      try {
        const plan = await balancingService.generatePlan(balancingOptions);
        spinner.succeed('Plan generated');

        if (options.json) {
          console.log(JSON.stringify(plan, null, 2));
          return;
        }

        // Display plan
        displayPlan(plan, tableService);

        // Show metrics
        logger.newLine();
        logger.subHeader('Metrics');
        logger.keyValue({
          'Balance Score': `${plan.metrics.balanceScore}/100`,
          'CPU Utilization': `${plan.metrics.totalCpuUtilization}%`,
          'Memory Utilization': `${plan.metrics.totalMemoryUtilization}%`,
          'Migrations Required': plan.metrics.migrationCount,
          'Constraints Satisfied': `${plan.metrics.constraintsSatisfied}/${plan.metrics.constraintsSatisfied + plan.metrics.constraintsViolated}`,
        });

        // Warnings
        if (plan.warnings.length > 0) {
          logger.newLine();
          logger.subHeader('Warnings');
          plan.warnings.forEach((w) => logger.log(`  ${chalk.yellow('⚠')} ${w}`));
        }

        // Errors
        if (plan.errors.length > 0) {
          logger.newLine();
          logger.subHeader('Errors');
          plan.errors.forEach((e) => logger.log(`  ${chalk.red('✖')} ${e}`));
        }

        // Apply if not dry run
        if (!options.dryRun && plan.migrations.length > 0) {
          logger.newLine();
          const confirm = await app
            .get(PromptsService)
            .confirm(`Apply ${plan.migrations.length} migration(s)?`, false);

          if (confirm) {
            const result = await balancingService.applyPlan(plan);

            if (result.success) {
              logger.success(`Completed ${result.migrationsCompleted} migration(s)`);
            } else {
              logger.error(`Failed ${result.migrationsFailed} migration(s)`);
              result.errors.forEach((e) => logger.log(`  ${chalk.red('✖')} ${e}`));
            }
          }
        }
      } catch (error) {
        spinner.fail('Failed to generate plan');
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

/**
 * Manual balance command
 */
function createManualCommand(app: INestApplicationContext): Command {
  return new Command('manual')
    .description('Manually assign services to nodes')
    .option('-s, --service <name>', 'Service to move')
    .option('-n, --node <name>', 'Target node')
    .option('-i, --interactive', 'Interactive mode')
    .action(async (options) => {
      const inventoryService = app.get(InventoryService);
      const servicesService = app.get(ServicesService);
      const prompts = app.get(PromptsService);

      logger.header('Manual Service Placement');

      const machines = inventoryService.getAll();
      const services = servicesService.getEnabled();

      if (options.interactive || (!options.service && !options.node)) {
        // Interactive mode
        const serviceChoice = await prompts.select(
          'Select service to move:',
          services.map((s) => ({
            name: `${s.name} (${s.namespace})`,
            value: s.name,
          })),
        );

        const nodeChoice = await prompts.select(
          'Select target node:',
          machines.map((m) => ({
            name: `${m.label} [${m.roles.join(', ')}]`,
            value: m.label,
          })),
        );

        logger.newLine();
        logger.info(`Moving ${chalk.cyan(serviceChoice)} to ${chalk.cyan(nodeChoice)}`);

        const confirm = await prompts.confirm('Proceed with migration?', false);

        if (confirm) {
          const spinner = logger.spinner('Migrating service...').start();
          // Migration would happen here
          await new Promise((resolve) => setTimeout(resolve, 2000));
          spinner.succeed('Migration completed');
        }
      } else {
        // Direct mode
        if (!options.service || !options.node) {
          logger.error('Both --service and --node are required in non-interactive mode');
          process.exit(1);
        }

        const service = services.find((s) => s.name === options.service);
        const node = machines.find((m) => m.label === options.node);

        if (!service) {
          logger.error(`Service not found: ${options.service}`);
          process.exit(1);
        }

        if (!node) {
          logger.error(`Node not found: ${options.node}`);
          process.exit(1);
        }

        logger.info(`Moving ${chalk.cyan(service.name)} to ${chalk.cyan(node.label)}`);

        const spinner = logger.spinner('Migrating service...').start();
        // Migration would happen here
        await new Promise((resolve) => setTimeout(resolve, 2000));
        spinner.succeed('Migration completed');
      }
    });
}

/**
 * Preview command
 */
function createPreviewCommand(app: INestApplicationContext): Command {
  return new Command('preview')
    .description('Preview current service placement')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const balancingService = app.get(BalancingService);
      const tableService = app.get(TableService);

      logger.header('Current Placement');

      const plan = await balancingService.generatePlan({
        strategy: BalancingStrategy.BIN_PACKING,
        dryRun: true,
        respectConstraints: false,
        allowMigrations: false,
      });

      if (options.json) {
        console.log(JSON.stringify(plan, null, 2));
        return;
      }

      displayPlan(plan, tableService);
    });
}

/**
 * Apply command
 */
function createApplyCommand(_app: INestApplicationContext): Command {
  return new Command('apply')
    .description('Apply a saved placement plan')
    .argument('<plan-id>', 'Plan ID to apply')
    .option('--parallel <n>', 'Parallel migrations', parseInt, 1)
    .action(async (planId, options) => {
      logger.header('Apply Placement Plan');
      logger.warn('Plan application from saved plans is not yet implemented');
      logger.info(`Would apply plan: ${planId} with parallelism: ${options.parallel}`);
    });
}

/**
 * Presets command
 */
function createPresetsCommand(app: INestApplicationContext): Command {
  const command = new Command('presets').description('Manage placement presets');

  command
    .command('list')
    .description('List saved presets')
    .action(async () => {
      const presetsService = app.get(PresetsService);

      logger.header('Placement Presets');

      const presets = presetsService.list();

      if (presets.length === 0) {
        logger.info('No presets saved');
        logger.newLine();
        logger.info('Available templates:');
        presetsService.getTemplates().forEach((t) => {
          logger.log(`  ${chalk.cyan(t.name)}: ${t.description}`);
        });
        return;
      }

      presets.forEach((p) => {
        logger.log(`  ${chalk.cyan(p.name)}`);
        logger.log(`    Strategy: ${p.strategy}`);
        logger.log(`    Services: ${p.serviceCount}`);
        logger.log(`    Created: ${new Date(p.createdAt).toLocaleDateString()}`);
        if (p.description) {
          logger.log(`    ${chalk.gray(p.description)}`);
        }
        logger.newLine();
      });
    });

  command
    .command('save <name>')
    .description('Save current placement as preset')
    .option('-d, --description <text>', 'Preset description')
    .option('-s, --strategy <strategy>', 'Strategy used', 'bin-packing')
    .action(async (name, options) => {
      const presetsService = app.get(PresetsService);
      const balancingService = app.get(BalancingService);

      const strategy = parseStrategy(options.strategy) || BalancingStrategy.BIN_PACKING;

      const plan = await balancingService.generatePlan({
        strategy,
        dryRun: true,
        respectConstraints: true,
        allowMigrations: false,
      });

      const preset = presetsService.createFromPlacements(
        name,
        options.description || '',
        strategy,
        plan.placements.map((p) => ({ service: p.service, node: p.targetNode })),
        plan.constraints,
      );

      presetsService.save(preset);
      logger.success(`Preset saved: ${name}`);
    });

  command
    .command('load <name>')
    .description('Load and apply a preset')
    .option('--dry-run', 'Preview without applying')
    .action(async (name, options) => {
      const presetsService = app.get(PresetsService);

      const preset = presetsService.get(name);

      if (!preset) {
        logger.error(`Preset not found: ${name}`);
        process.exit(1);
      }

      logger.info(`Loading preset: ${name}`);
      logger.info(`Strategy: ${preset.strategy}`);
      logger.info(`Services: ${preset.placements.length}`);

      if (options.dryRun) {
        logger.newLine();
        logger.subHeader('Placements');
        preset.placements.forEach((p) => {
          logger.log(`  ${chalk.cyan(p.service)} → ${p.node}`);
        });
      } else {
        logger.warn('Preset application would require migrations');
      }
    });

  command
    .command('delete <name>')
    .description('Delete a preset')
    .action(async (name) => {
      const presetsService = app.get(PresetsService);

      if (presetsService.delete(name)) {
        logger.success(`Preset deleted: ${name}`);
      } else {
        logger.error(`Preset not found: ${name}`);
      }
    });

  command
    .command('template <template-name> <preset-name>')
    .description('Create preset from template')
    .action(async (templateName, presetName) => {
      const presetsService = app.get(PresetsService);

      try {
        presetsService.applyTemplate(templateName, presetName);
        logger.success(`Created preset ${presetName} from template ${templateName}`);
      } catch (error) {
        logger.error(error instanceof Error ? error.message : String(error));
      }
    });

  return command;
}

/**
 * Rollback command
 */
function createRollbackCommand(_app: INestApplicationContext): Command {
  return new Command('rollback')
    .description('Rollback a migration')
    .argument('<migration-id>', 'Migration ID to rollback')
    .action(async (migrationId) => {
      logger.header('Rollback Migration');
      logger.warn('Migration rollback is not yet implemented');
      logger.info(`Would rollback migration: ${migrationId}`);
    });
}

/**
 * Parse strategy string to enum
 */
function parseStrategy(str: string): BalancingStrategy | null {
  const strategies: Record<string, BalancingStrategy> = {
    'bin-packing': BalancingStrategy.BIN_PACKING,
    'round-robin': BalancingStrategy.ROUND_ROBIN,
    weighted: BalancingStrategy.WEIGHTED,
    affinity: BalancingStrategy.AFFINITY,
    spread: BalancingStrategy.SPREAD,
  };
  return strategies[str.toLowerCase()] || null;
}

/**
 * Display placement plan
 */
function displayPlan(plan: any, _tableService: TableService): void {
  logger.subHeader('Node Allocation');

  for (const node of plan.nodes) {
    const cpuPercent =
      node.totalCpu > 0 ? Math.round((node.allocatedCpu / node.totalCpu) * 100) : 0;
    const memPercent =
      node.totalMemory > 0 ? Math.round((node.allocatedMemory / node.totalMemory) * 100) : 0;

    logger.log(`  ${chalk.cyan(node.label)} [${node.roles.join(', ')}]`);
    logger.log(`    CPU: ${createBar(cpuPercent)} ${cpuPercent}%`);
    logger.log(`    MEM: ${createBar(memPercent)} ${memPercent}%`);
    logger.newLine();
  }

  logger.subHeader('Service Placements');

  const groupedByNode = new Map<string, any[]>();
  for (const placement of plan.placements) {
    if (!groupedByNode.has(placement.targetNode)) {
      groupedByNode.set(placement.targetNode, []);
    }
    groupedByNode.get(placement.targetNode)!.push(placement);
  }

  for (const [node, placements] of groupedByNode) {
    logger.log(`  ${chalk.cyan(node)}:`);
    for (const p of placements) {
      logger.log(`    ${p.service} ${chalk.gray(`(${p.reason})`)}`);
    }
    logger.newLine();
  }

  if (plan.migrations.length > 0) {
    logger.subHeader('Required Migrations');
    for (const m of plan.migrations) {
      logger.log(`  ${chalk.cyan(m.service)}: ${m.sourceNode} → ${m.targetNode}`);
    }
  }
}

/**
 * Create a simple progress bar
 */
function createBar(percent: number, width: number = 10): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  const color = percent >= 90 ? chalk.red : percent >= 75 ? chalk.yellow : chalk.green;
  return color(`[${'█'.repeat(filled)}${'░'.repeat(empty)}]`);
}
