import { Command } from 'commander';
import { INestApplicationContext } from '@nestjs/common';
import chalk from 'chalk';
import { DaemonService } from '../daemon/daemon.service';
import { DaemonState, DaemonHealthStatus } from '../daemon/interfaces/daemon.interface';
import { logger } from '../utils/logger';

export function createDaemonCommand(app: INestApplicationContext): Command {
  const command = new Command('daemon');

  command.description('Background monitoring daemon management');

  // Init subcommand
  command.addCommand(createInitSubcommand(app));

  // Start subcommand
  command.addCommand(createStartSubcommand(app));

  // Stop subcommand
  command.addCommand(createStopSubcommand(app));

  // Status subcommand
  command.addCommand(createStatusSubcommand(app));

  // Logs subcommand
  command.addCommand(createLogsSubcommand(app));

  // Restart subcommand
  command.addCommand(createRestartSubcommand(app));

  // Remove subcommand
  command.addCommand(createRemoveSubcommand(app));

  // Default action shows status
  command.action(async () => {
    const daemonService = app.get(DaemonService);

    const initialized = await daemonService.isInitialized();
    if (!initialized) {
      logger.info('Daemon is not initialized.');
      logger.newLine();
      logger.log('To set up background monitoring, run:');
      logger.log(chalk.cyan('  selfhost daemon init'));
      logger.newLine();
      logger.log('Available commands:');
      logger.log('  init     Initialize daemon for background monitoring');
      logger.log('  start    Start the daemon container');
      logger.log('  stop     Stop the daemon container');
      logger.log('  status   Show daemon status and recent alerts');
      logger.log('  logs     View daemon health logs');
      logger.log('  restart  Restart the daemon');
      logger.log('  remove   Remove daemon completely');
      return;
    }

    // Show status by default
    await showStatus(daemonService);
  });

  return command;
}

/**
 * Init subcommand
 */
function createInitSubcommand(app: INestApplicationContext): Command {
  return new Command('init')
    .description('Initialize daemon for background monitoring')
    .option('-i, --interval <seconds>', 'Health check interval', parseInt, 60)
    .option('--force', 'Force reinitialize even if already initialized')
    .action(async (options) => {
      const daemonService = app.get(DaemonService);

      const spinner = logger.spinner('Initializing daemon...').start();

      try {
        await daemonService.init({
          checkInterval: options.interval,
          force: options.force,
        });

        spinner.succeed('Daemon initialized successfully');
        logger.newLine();
        logger.info('Configuration:');
        logger.log(`  Check interval: ${options.interval}s`);
        logger.newLine();
        logger.log('To start background monitoring, run:');
        logger.log(chalk.cyan('  selfhost daemon start'));
      } catch (error) {
        spinner.fail('Failed to initialize daemon');
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

/**
 * Start subcommand
 */
function createStartSubcommand(app: INestApplicationContext): Command {
  return new Command('start')
    .description('Start the daemon container')
    .action(async () => {
      const daemonService = app.get(DaemonService);

      // Check if initialized
      const initialized = await daemonService.isInitialized();
      if (!initialized) {
        logger.error('Daemon not initialized. Run `selfhost daemon init` first.');
        process.exit(1);
      }

      const spinner = logger.spinner('Starting daemon...').start();

      try {
        const containerId = await daemonService.start();
        spinner.succeed('Daemon started successfully');
        logger.log(`  Container ID: ${chalk.gray(containerId.slice(0, 12))}`);
        logger.newLine();
        logger.info('View logs with: selfhost daemon logs');
      } catch (error) {
        spinner.fail('Failed to start daemon');
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

/**
 * Stop subcommand
 */
function createStopSubcommand(app: INestApplicationContext): Command {
  return new Command('stop')
    .description('Stop the daemon container')
    .action(async () => {
      const daemonService = app.get(DaemonService);

      const spinner = logger.spinner('Stopping daemon...').start();

      try {
        await daemonService.stop();
        spinner.succeed('Daemon stopped successfully');
      } catch (error) {
        spinner.fail('Failed to stop daemon');
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

/**
 * Status subcommand
 */
function createStatusSubcommand(app: INestApplicationContext): Command {
  return new Command('status')
    .description('Show daemon status and recent alerts')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const daemonService = app.get(DaemonService);

      if (options.json) {
        const status = daemonService.getStatus();
        console.log(JSON.stringify(status, null, 2));
        return;
      }

      await showStatus(daemonService);
    });
}

/**
 * Logs subcommand
 */
function createLogsSubcommand(app: INestApplicationContext): Command {
  return new Command('logs')
    .description('View daemon health logs')
    .option('-f, --follow', 'Follow container logs in real-time')
    .option('-n, --tail <lines>', 'Number of log entries', parseInt, 20)
    .option('--status <status>', 'Filter by status (healthy, degraded, critical)')
    .option('--container', 'Show container logs instead of health logs')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const daemonService = app.get(DaemonService);

      if (options.container) {
        // Show container logs
        try {
          const logs = await daemonService.getContainerLogs({
            follow: options.follow,
            tail: options.tail,
          });
          console.log(logs);
        } catch (error) {
          logger.error('Failed to get container logs');
          logger.error(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
        return;
      }

      // Show health logs from SQLite
      const logs = daemonService.getLogs({
        status: options.status as DaemonHealthStatus | undefined,
        limit: options.tail,
      });

      if (options.json) {
        console.log(JSON.stringify(logs, null, 2));
        return;
      }

      logger.header('Daemon Health Logs');
      logger.newLine();

      if (logs.length === 0) {
        logger.success('No alerts in the log');
        return;
      }

      for (const log of logs) {
        const statusIcon = getStatusIcon(log.status);
        const timestamp = new Date(log.timestamp).toLocaleString();

        logger.log(
          `${statusIcon} ${chalk.gray(timestamp)} ${chalk.bold(log.target)} [${log.checkType}]`,
        );
        if (log.message) {
          logger.log(`  ${chalk.gray(log.message)}`);
        }
      }
    });
}

/**
 * Restart subcommand
 */
function createRestartSubcommand(app: INestApplicationContext): Command {
  return new Command('restart')
    .description('Restart the daemon container')
    .action(async () => {
      const daemonService = app.get(DaemonService);

      const spinner = logger.spinner('Restarting daemon...').start();

      try {
        await daemonService.restart();
        spinner.succeed('Daemon restarted successfully');
      } catch (error) {
        spinner.fail('Failed to restart daemon');
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

/**
 * Remove subcommand
 */
function createRemoveSubcommand(app: INestApplicationContext): Command {
  return new Command('remove')
    .description('Remove daemon completely')
    .option('--force', 'Skip confirmation')
    .action(async (options) => {
      const daemonService = app.get(DaemonService);

      if (!options.force) {
        logger.warn('This will remove the daemon and all its data.');
        logger.log('Press Ctrl+C to cancel or wait 3 seconds to continue...');
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      const spinner = logger.spinner('Removing daemon...').start();

      try {
        await daemonService.remove();
        spinner.succeed('Daemon removed successfully');
      } catch (error) {
        spinner.fail('Failed to remove daemon');
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

/**
 * Display daemon status
 */
async function showStatus(daemonService: DaemonService): Promise<void> {
  const status = daemonService.getStatus();

  logger.header('Daemon Status');
  logger.newLine();

  // State
  const stateIcon =
    status.state === DaemonState.RUNNING
      ? chalk.green('●')
      : status.state === DaemonState.ERROR
        ? chalk.red('●')
        : chalk.gray('●');
  const stateText =
    status.state === DaemonState.RUNNING
      ? chalk.green('Running')
      : status.state === DaemonState.ERROR
        ? chalk.red('Error')
        : chalk.gray(status.state);

  logger.log(`  State:     ${stateIcon} ${stateText}`);

  if (status.containerId) {
    logger.log(`  Container: ${chalk.gray(status.containerId.slice(0, 12))}`);
  }

  if (status.startedAt) {
    const started = new Date(status.startedAt);
    const uptime = formatUptime(Date.now() - started.getTime());
    logger.log(`  Uptime:    ${uptime}`);
  }

  logger.log(`  Interval:  ${status.checkInterval}s`);

  if (status.lastCheck) {
    const lastCheck = new Date(status.lastCheck);
    const ago = formatTimeAgo(Date.now() - lastCheck.getTime());
    logger.log(`  Last Check: ${ago}`);
  }

  logger.newLine();

  // Health summary
  logger.log(chalk.bold('  Health Summary:'));
  const summary = status.healthSummary;
  if (summary.critical > 0) {
    logger.log(`    ${chalk.red('●')} Critical: ${summary.critical}`);
  }
  if (summary.degraded > 0) {
    logger.log(`    ${chalk.yellow('●')} Degraded: ${summary.degraded}`);
  }
  if (summary.healthy > 0) {
    logger.log(`    ${chalk.green('●')} Healthy:  ${summary.healthy}`);
  }
  if (summary.unknown > 0) {
    logger.log(`    ${chalk.gray('●')} Unknown:  ${summary.unknown}`);
  }

  if (
    summary.healthy === 0 &&
    summary.degraded === 0 &&
    summary.critical === 0 &&
    summary.unknown === 0
  ) {
    logger.log(`    ${chalk.gray('No data yet')}`);
  }

  logger.newLine();

  // Recent alerts
  if (status.recentAlerts.length > 0) {
    logger.log(chalk.bold('  Recent Alerts:'));
    for (const alert of status.recentAlerts.slice(0, 5)) {
      const icon = getStatusIcon(alert.status);
      const time = formatTimeAgo(Date.now() - new Date(alert.timestamp).getTime());
      logger.log(`    ${icon} ${alert.target} - ${time}`);
      if (alert.message) {
        logger.log(`      ${chalk.gray(alert.message)}`);
      }
    }
  } else {
    logger.log(chalk.bold('  Recent Alerts:'));
    logger.log(`    ${chalk.green('No alerts')}`);
  }
}

/**
 * Get status icon
 */
function getStatusIcon(status: DaemonHealthStatus): string {
  switch (status) {
    case DaemonHealthStatus.HEALTHY:
      return chalk.green('●');
    case DaemonHealthStatus.DEGRADED:
      return chalk.yellow('●');
    case DaemonHealthStatus.CRITICAL:
      return chalk.red('●');
    default:
      return chalk.gray('●');
  }
}

/**
 * Format uptime
 */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Format time ago
 */
function formatTimeAgo(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}
