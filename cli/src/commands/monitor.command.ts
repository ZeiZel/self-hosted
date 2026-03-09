import { Command } from 'commander';
import { INestApplicationContext } from '@nestjs/common';
import chalk from 'chalk';
import { MonitorService } from '../modules/monitor/monitor.service';
import { ClusterClientService } from '../modules/monitor/cluster-client.service';
import { DEFAULT_ALERT_THRESHOLDS } from '../interfaces/monitor.interface';
import { logger } from '../utils/logger';

export function createMonitorCommand(app: INestApplicationContext): Command {
  const command = new Command('monitor');

  command
    .description('Real-time cluster monitoring dashboard')
    .option('-r, --refresh <seconds>', 'Refresh interval in seconds', parseInt, 5)
    .option('--headless', 'Output JSON instead of TUI', false)
    .option('-n, --namespace <namespace>', 'Filter by namespace')
    .option('--node <node>', 'Filter by node')
    .option('--no-alerts', 'Disable alert display')
    .option('--cpu-warn <percent>', 'CPU warning threshold', parseInt)
    .option('--cpu-crit <percent>', 'CPU critical threshold', parseInt)
    .option('--mem-warn <percent>', 'Memory warning threshold', parseInt)
    .option('--mem-crit <percent>', 'Memory critical threshold', parseInt)
    .action(async (options) => {
      const monitorService = app.get(MonitorService);
      const clusterClient = app.get(ClusterClientService);

      // Check cluster connection first
      if (!options.headless) {
        const spinner = logger.spinner('Connecting to cluster...').start();

        const connection = await clusterClient.checkConnection();

        if (!connection.connected) {
          spinner.fail('Cannot connect to cluster');
          logger.error(connection.error || 'Unknown error');
          logger.newLine();
          logger.info('Make sure:');
          logger.log('  1. kubectl is installed and in PATH');
          logger.log('  2. Kubeconfig is properly configured');
          logger.log('  3. The cluster is reachable');
          process.exit(1);
        }

        spinner.succeed('Connected to cluster');
        logger.newLine();
      }

      // Build alert thresholds
      const alertThresholds = {
        ...DEFAULT_ALERT_THRESHOLDS,
        cpu: {
          warning: options.cpuWarn ?? DEFAULT_ALERT_THRESHOLDS.cpu.warning,
          critical: options.cpuCrit ?? DEFAULT_ALERT_THRESHOLDS.cpu.critical,
        },
        memory: {
          warning: options.memWarn ?? DEFAULT_ALERT_THRESHOLDS.memory.warning,
          critical: options.memCrit ?? DEFAULT_ALERT_THRESHOLDS.memory.critical,
        },
      };

      try {
        await monitorService.start({
          refreshInterval: options.refresh,
          headless: options.headless,
          showAlerts: options.alerts !== false,
          alertThresholds,
          filterNamespace: options.namespace,
          filterNode: options.node,
        });
      } catch (error) {
        logger.error('Monitor error:');
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // Add subcommands
  command.addCommand(createStatusSubcommand(app));
  command.addCommand(createAlertsSubcommand(app));
  command.addCommand(createNodesSubcommand(app));
  command.addCommand(createServicesSubcommand(app));

  return command;
}

/**
 * Quick status check subcommand
 */
function createStatusSubcommand(app: INestApplicationContext): Command {
  return new Command('status')
    .description('Quick cluster status check')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const monitorService = app.get(MonitorService);

      const spinner = logger.spinner('Fetching cluster status...').start();

      try {
        const state = await monitorService.getClusterState();
        spinner.stop();

        if (options.json) {
          console.log(JSON.stringify(state.summary, null, 2));
          return;
        }

        logger.header('Cluster Status');
        logger.newLine();

        // Nodes
        const nodesStatus = state.summary.nodes;
        const nodesColor =
          nodesStatus.critical > 0
            ? chalk.red
            : nodesStatus.warning > 0
              ? chalk.yellow
              : chalk.green;
        logger.log(
          `  Nodes:   ${nodesColor(`${nodesStatus.healthy}/${nodesStatus.total} healthy`)}`,
        );

        // Pods
        const podsStatus = state.summary.pods;
        const podsColor =
          podsStatus.failed > 0 ? chalk.red : podsStatus.pending > 0 ? chalk.yellow : chalk.green;
        logger.log(`  Pods:    ${podsColor(`${podsStatus.running}/${podsStatus.total} running`)}`);

        // Resources
        logger.newLine();
        logger.log(
          `  CPU:     ${createBar(state.summary.cpu.percent)} ${state.summary.cpu.percent}%`,
        );
        logger.log(
          `  Memory:  ${createBar(state.summary.memory.percent)} ${state.summary.memory.percent}%`,
        );

        // Alerts summary
        const alertCounts = {
          critical: state.alerts.filter((a) => a.severity === 'critical').length,
          warning: state.alerts.filter((a) => a.severity === 'warning').length,
        };

        logger.newLine();
        if (alertCounts.critical > 0) {
          logger.log(
            `  Alerts:  ${chalk.red(`${alertCounts.critical} critical`)}, ${chalk.yellow(`${alertCounts.warning} warning`)}`,
          );
        } else if (alertCounts.warning > 0) {
          logger.log(`  Alerts:  ${chalk.yellow(`${alertCounts.warning} warning`)}`);
        } else {
          logger.log(`  Alerts:  ${chalk.green('None')}`);
        }

        logger.newLine();
        logger.info('Run `selfhost monitor` for live dashboard');
      } catch (error) {
        spinner.fail('Failed to fetch status');
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

/**
 * List alerts subcommand
 */
function createAlertsSubcommand(app: INestApplicationContext): Command {
  return new Command('alerts')
    .description('List active alerts')
    .option('--severity <level>', 'Filter by severity (critical, warning, info)')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const monitorService = app.get(MonitorService);

      const spinner = logger.spinner('Fetching alerts...').start();

      try {
        const state = await monitorService.getClusterState();
        spinner.stop();

        let alerts = state.alerts;

        if (options.severity) {
          alerts = alerts.filter((a) => a.severity === options.severity);
        }

        if (options.json) {
          console.log(JSON.stringify(alerts, null, 2));
          return;
        }

        logger.header('Active Alerts');
        logger.newLine();

        if (alerts.length === 0) {
          logger.success('No active alerts');
          return;
        }

        // Group by severity
        const critical = alerts.filter((a) => a.severity === 'critical');
        const warning = alerts.filter((a) => a.severity === 'warning');
        const info = alerts.filter((a) => a.severity === 'info');

        if (critical.length > 0) {
          logger.log(chalk.red.bold('  Critical:'));
          critical.forEach((a) => {
            logger.log(`    ${chalk.red('⚠')} ${a.title}`);
            logger.log(`      ${chalk.gray(a.message)}`);
          });
          logger.newLine();
        }

        if (warning.length > 0) {
          logger.log(chalk.yellow.bold('  Warning:'));
          warning.forEach((a) => {
            logger.log(`    ${chalk.yellow('⚠')} ${a.title}`);
            logger.log(`      ${chalk.gray(a.message)}`);
          });
          logger.newLine();
        }

        if (info.length > 0) {
          logger.log(chalk.blue.bold('  Info:'));
          info.forEach((a) => {
            logger.log(`    ${chalk.blue('ℹ')} ${a.title}`);
            logger.log(`      ${chalk.gray(a.message)}`);
          });
        }
      } catch (error) {
        spinner.fail('Failed to fetch alerts');
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

/**
 * List nodes subcommand
 */
function createNodesSubcommand(app: INestApplicationContext): Command {
  return new Command('nodes')
    .description('List cluster nodes with metrics')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const monitorService = app.get(MonitorService);

      const spinner = logger.spinner('Fetching nodes...').start();

      try {
        const state = await monitorService.getClusterState();
        spinner.stop();

        if (options.json) {
          console.log(JSON.stringify(state.nodes, null, 2));
          return;
        }

        logger.header('Cluster Nodes');
        logger.newLine();

        for (const node of state.nodes) {
          const healthIcon =
            node.health === 'healthy'
              ? chalk.green('●')
              : node.health === 'warning'
                ? chalk.yellow('●')
                : chalk.red('●');

          logger.log(`  ${healthIcon} ${chalk.bold(node.name)}`);
          logger.log(`    IP: ${node.ip}`);
          logger.log(`    Roles: ${node.roles.join(', ')}`);
          logger.log(`    CPU: ${createBar(node.cpu.percent)} ${node.cpu.percent}%`);
          logger.log(`    Memory: ${createBar(node.memory.percent)} ${node.memory.percent}%`);
          logger.log(`    Pods: ${node.pods.running}/${node.pods.total} running`);
          logger.newLine();
        }
      } catch (error) {
        spinner.fail('Failed to fetch nodes');
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

/**
 * List services subcommand
 */
function createServicesSubcommand(app: INestApplicationContext): Command {
  return new Command('pods')
    .description('List running services/pods')
    .option('-n, --namespace <namespace>', 'Filter by namespace')
    .option('--node <node>', 'Filter by node')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const monitorService = app.get(MonitorService);

      const spinner = logger.spinner('Fetching services...').start();

      try {
        const state = await monitorService.getClusterState();
        spinner.stop();

        let services = state.services;

        if (options.namespace) {
          services = services.filter((s) => s.namespace === options.namespace);
        }

        if (options.node) {
          services = services.filter((s) => s.node === options.node);
        }

        if (options.json) {
          console.log(JSON.stringify(services, null, 2));
          return;
        }

        logger.header('Running Services');
        logger.newLine();

        // Group by namespace
        const byNamespace = new Map<string, typeof services>();
        for (const service of services) {
          if (!byNamespace.has(service.namespace)) {
            byNamespace.set(service.namespace, []);
          }
          byNamespace.get(service.namespace)!.push(service);
        }

        for (const [namespace, nsServices] of byNamespace) {
          logger.log(chalk.bold(`  ${namespace}/`));

          for (const service of nsServices) {
            const statusIcon =
              service.status === 'Running'
                ? chalk.green('●')
                : service.status === 'Pending'
                  ? chalk.yellow('◐')
                  : chalk.red('✖');

            const restarts =
              service.restarts > 0 ? chalk.yellow(` (${service.restarts} restarts)`) : '';

            logger.log(`    ${statusIcon} ${service.name} on ${service.node}${restarts}`);
          }
          logger.newLine();
        }
      } catch (error) {
        spinner.fail('Failed to fetch services');
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
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
