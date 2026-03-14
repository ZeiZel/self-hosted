import { Command } from 'commander';
import { INestApplicationContext } from '@nestjs/common';
import { spawn } from 'child_process';
import { join } from 'path';
import chalk from 'chalk';
import { ConfigService } from '../modules/config/config.service';
import { logger } from '../utils/logger';

export function createGatewayCommand(app: INestApplicationContext): Command {
  const command = new Command('gateway');

  command.description('Pangolin VPN gateway management');

  command.addCommand(createSetupSubcommand(app));
  command.addCommand(createStatusSubcommand());

  // Default action shows status
  command.action(async () => {
    await showStatus();
  });

  return command;
}

/**
 * Setup subcommand - configure gateway
 */
function createSetupSubcommand(app: INestApplicationContext): Command {
  return new Command('setup')
    .description('Configure Pangolin gateway (runs Ansible on gateway host)')
    .option('--inventory <path>', 'Ansible inventory file', 'inventory/gateway.ini')
    .action(async (options) => {
      const configService = app.get(ConfigService);

      logger.header('Gateway Setup');
      logger.newLine();

      // Check if we have repo root for Ansible
      let repoRoot: string;
      try {
        repoRoot = configService.getRepoRoot();
      } catch {
        logger.error('Not in a selfhost repository.');
        logger.info('Run this command from the repository root.');
        process.exit(1);
      }

      const playbookPath = join(repoRoot, 'ansible', 'pangolin-gateway.yml');
      const inventoryPath = join(repoRoot, 'ansible', options.inventory);

      // Check if playbook exists
      const playbookFile = Bun.file(playbookPath);
      if (!(await playbookFile.exists())) {
        logger.error(`Playbook not found: ${playbookPath}`);
        process.exit(1);
      }

      logger.info('Configuring Pangolin gateway...');
      logger.info('This will update Traefik configuration for:');
      logger.log('  - ACME HTTP-01 challenge passthrough');
      logger.log('  - HTTP to HTTPS redirect');
      logger.log('  - Cluster routing');
      logger.newLine();

      const result = await runAnsiblePlaybook(playbookPath, inventoryPath);

      if (result.success) {
        logger.newLine();
        logger.success('Gateway configured successfully!');
        logger.newLine();
        logger.info('Changes applied:');
        logger.log(chalk.cyan('  - ACME challenges now pass through to cluster'));
        logger.log(chalk.cyan('  - HTTP traffic redirects to HTTPS (except ACME)'));
        logger.log(chalk.cyan('  - Let\'s Encrypt certificates should now be issued'));
      } else {
        logger.error('Gateway setup failed');
        if (result.error) {
          logger.log(result.error);
        }
        process.exit(1);
      }
    });
}

/**
 * Status subcommand
 */
function createStatusSubcommand(): Command {
  return new Command('status')
    .description('Show gateway status')
    .action(async () => {
      await showStatus();
    });
}

/**
 * Show gateway status
 */
async function showStatus(): Promise<void> {
  logger.header('Gateway Status');
  logger.newLine();

  // Try to check gateway health via the cluster
  try {
    const { stdout, exitCode } = await runCommandOutput('kubectl', [
      'get', 'pods', '-n', 'infrastructure', '-l', 'app.kubernetes.io/name=pangolin', '-o', 'wide',
    ]);

    if (exitCode === 0 && stdout.trim()) {
      logger.log(chalk.bold('Pangolin Client (in cluster):'));
      logger.log(stdout);
    }
  } catch {
    logger.info('Could not get Pangolin client status');
  }

  // Check if gateway is reachable
  logger.newLine();
  logger.log(chalk.bold('Gateway Connectivity:'));

  try {
    const { stdout, exitCode } = await runCommandOutput('curl', [
      '-s', '-o', '/dev/null', '-w', '%{http_code}', '-m', '5',
      'http://80.90.178.207/',
    ]);

    if (exitCode === 0) {
      const statusCode = stdout.trim();
      if (statusCode === '301' || statusCode === '302') {
        logger.log(`  HTTP: ${chalk.green('● Reachable')} (redirects to HTTPS)`);
      } else if (statusCode === '200') {
        logger.log(`  HTTP: ${chalk.green('● Reachable')}`);
      } else {
        logger.log(`  HTTP: ${chalk.yellow('● Reachable')} (status: ${statusCode})`);
      }
    } else {
      logger.log(`  HTTP: ${chalk.red('● Unreachable')}`);
    }
  } catch {
    logger.log(`  HTTP: ${chalk.red('● Unreachable')}`);
  }

  try {
    const { exitCode } = await runCommandOutput('curl', [
      '-s', '-o', '/dev/null', '-w', '%{http_code}', '-m', '5', '-k',
      'https://80.90.178.207/',
    ]);

    if (exitCode === 0) {
      logger.log(`  HTTPS: ${chalk.green('● Reachable')}`);
    } else {
      logger.log(`  HTTPS: ${chalk.red('● Unreachable')}`);
    }
  } catch {
    logger.log(`  HTTPS: ${chalk.red('● Unreachable')}`);
  }
}

/**
 * Run Ansible playbook
 */
async function runAnsiblePlaybook(
  playbookPath: string,
  inventoryPath: string,
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const args = [
      '-i', inventoryPath,
      playbookPath,
    ];

    const proc = spawn('ansible-playbook', args, {
      stdio: 'inherit',
    });

    proc.on('close', (code) => {
      resolve({ success: code === 0 });
    });

    proc.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Run command and capture output
 */
async function runCommandOutput(
  command: string,
  args: string[] = [],
  timeout: number = 10000,
): Promise<{ stdout: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let timedOut = false;

    const proc = spawn(command, args);

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
      reject(new Error('Command timed out'));
    }, timeout);

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.on('close', (code) => {
      if (!timedOut) {
        clearTimeout(timer);
        resolve({ stdout, exitCode: code ?? 1 });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
