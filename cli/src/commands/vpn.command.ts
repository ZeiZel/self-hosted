import { Command } from 'commander';
import { INestApplicationContext } from '@nestjs/common';
import { spawn } from 'child_process';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import { ConfigService } from '../modules/config/config.service';
import { logger } from '../utils/logger';

const WIREGUARD_CONFIG_DIR = join(homedir(), '.selfhosted', 'wireguard');
const WIREGUARD_CONFIG = join(WIREGUARD_CONFIG_DIR, 'wg0.conf');

export function createVpnCommand(app: INestApplicationContext): Command {
  const command = new Command('vpn');

  command.description('VPN connection management for cluster access');

  command.addCommand(createSetupSubcommand(app));
  command.addCommand(createUpSubcommand());
  command.addCommand(createDownSubcommand());
  command.addCommand(createStatusSubcommand());

  // Default action shows status
  command.action(async () => {
    await showStatus();
  });

  return command;
}

/**
 * Setup subcommand - run Ansible playbook
 */
function createSetupSubcommand(app: INestApplicationContext): Command {
  return new Command('setup')
    .description('Configure WireGuard VPN client (runs Ansible)')
    .option('--gateway <ip>', 'VPN gateway IP address', '80.90.178.207')
    .option('--client-ip <ip>', 'Client VPN IP address', '10.99.0.2')
    .action(async (options) => {
      const configService = app.get(ConfigService);

      logger.header('VPN Setup');
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

      const playbookPath = join(repoRoot, 'ansible', 'vpn-client.yml');

      // Check if playbook exists
      const playbookFile = Bun.file(playbookPath);
      if (!(await playbookFile.exists())) {
        logger.error(`Playbook not found: ${playbookPath}`);
        process.exit(1);
      }

      logger.info('Running Ansible playbook to configure VPN...');
      logger.log(`  Gateway: ${options.gateway}`);
      logger.log(`  Client IP: ${options.clientIp}`);
      logger.newLine();

      const extraVars = [
        '-e', `wireguard_gateway_host=${options.gateway}`,
        '-e', `wireguard_client_ip=${options.clientIp}`,
      ];

      const result = await runAnsiblePlaybook(playbookPath, extraVars);

      if (result.success) {
        logger.newLine();
        logger.success('VPN configured successfully!');
        logger.newLine();
        logger.info('To start VPN connection:');
        logger.log(chalk.cyan('  selfhost vpn up'));
      } else {
        logger.error('VPN setup failed');
        if (result.error) {
          logger.log(result.error);
        }
        process.exit(1);
      }
    });
}

/**
 * Up subcommand - start VPN
 */
function createUpSubcommand(): Command {
  return new Command('up')
    .description('Start VPN connection')
    .action(async () => {
      logger.header('Starting VPN');

      // Check if config exists
      const configFile = Bun.file(WIREGUARD_CONFIG);
      if (!(await configFile.exists())) {
        logger.error('VPN not configured. Run `selfhost vpn setup` first.');
        process.exit(1);
      }

      // Check if already running
      const status = await getVpnStatus();
      if (status.connected) {
        logger.info('VPN is already connected.');
        return;
      }

      const spinner = logger.spinner('Connecting to VPN...').start();

      try {
        const wgUpScript = join(WIREGUARD_CONFIG_DIR, 'wg-up.sh');
        const scriptFile = Bun.file(wgUpScript);

        if (await scriptFile.exists()) {
          // Use the wrapper script
          await runCommand('sudo', [wgUpScript]);
        } else {
          // Direct wg-quick
          const wgQuick = await findWgQuick();
          const homebrewBash = '/opt/homebrew/bin/bash';
          await runCommand('sudo', [homebrewBash, wgQuick, 'up', WIREGUARD_CONFIG]);
        }

        spinner.succeed('VPN connected');

        // Show connection info
        const newStatus = await getVpnStatus();
        if (newStatus.connected) {
          logger.newLine();
          logger.log(`  Interface: ${newStatus.interface}`);
          logger.log(`  IP: ${newStatus.ip}`);
        }
      } catch (error) {
        spinner.fail('Failed to connect VPN');
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

/**
 * Down subcommand - stop VPN
 */
function createDownSubcommand(): Command {
  return new Command('down')
    .description('Stop VPN connection')
    .action(async () => {
      logger.header('Stopping VPN');

      const status = await getVpnStatus();
      if (!status.connected) {
        logger.info('VPN is not connected.');
        return;
      }

      const spinner = logger.spinner('Disconnecting VPN...').start();

      try {
        const wgDownScript = join(WIREGUARD_CONFIG_DIR, 'wg-down.sh');
        const scriptFile = Bun.file(wgDownScript);

        if (await scriptFile.exists()) {
          await runCommand('sudo', [wgDownScript]);
        } else {
          const wgQuick = await findWgQuick();
          const homebrewBash = '/opt/homebrew/bin/bash';
          await runCommand('sudo', [homebrewBash, wgQuick, 'down', WIREGUARD_CONFIG]);
        }

        spinner.succeed('VPN disconnected');
      } catch (error) {
        spinner.fail('Failed to disconnect VPN');
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

/**
 * Status subcommand
 */
function createStatusSubcommand(): Command {
  return new Command('status')
    .description('Show VPN connection status')
    .action(async () => {
      await showStatus();
    });
}

/**
 * Show VPN status
 */
async function showStatus(): Promise<void> {
  logger.header('VPN Status');
  logger.newLine();

  // Check if configured
  const configFile = Bun.file(WIREGUARD_CONFIG);
  const isConfigured = await configFile.exists();

  if (!isConfigured) {
    logger.log(`  Configured: ${chalk.red('No')}`);
    logger.newLine();
    logger.info('Run `selfhost vpn setup` to configure VPN');
    return;
  }

  logger.log(`  Configured: ${chalk.green('Yes')}`);

  const status = await getVpnStatus();

  if (status.connected) {
    logger.log(`  Status:     ${chalk.green('● Connected')}`);
    logger.log(`  Interface:  ${status.interface}`);
    logger.log(`  IP:         ${status.ip}`);

    // Check cluster connectivity
    const clusterReachable = await checkClusterConnection();
    logger.log(`  Cluster:    ${clusterReachable ? chalk.green('● Reachable') : chalk.red('● Unreachable')}`);
  } else {
    logger.log(`  Status:     ${chalk.gray('○ Disconnected')}`);
    logger.newLine();
    logger.info('Run `selfhost vpn up` to connect');
  }
}

/**
 * Get VPN connection status
 */
async function getVpnStatus(): Promise<{
  connected: boolean;
  interface?: string;
  ip?: string;
}> {
  try {
    const { stdout } = await runCommandOutput('ifconfig');

    // Look for utun interface with VPN IP
    const utunMatch = stdout.match(/utun\d+:.*?inet (10\.99\.0\.\d+)/s);

    if (utunMatch) {
      const interfaceMatch = stdout.match(/(utun\d+):.*?inet (10\.99\.0\.\d+)/s);
      return {
        connected: true,
        interface: interfaceMatch?.[1],
        ip: interfaceMatch?.[2],
      };
    }

    return { connected: false };
  } catch {
    return { connected: false };
  }
}

/**
 * Check if cluster is reachable
 */
async function checkClusterConnection(): Promise<boolean> {
  try {
    const { exitCode } = await runCommandOutput('kubectl', ['cluster-info'], 5000);
    return exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Find wg-quick path
 */
async function findWgQuick(): Promise<string> {
  try {
    const { stdout } = await runCommandOutput('which', ['wg-quick']);
    return stdout.trim();
  } catch {
    throw new Error('wg-quick not found. Install wireguard-tools.');
  }
}

/**
 * Run Ansible playbook
 */
async function runAnsiblePlaybook(
  playbookPath: string,
  extraVars: string[] = [],
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const args = [
      '-i', 'localhost,',
      playbookPath,
      '--connection=local',
      ...extraVars,
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
 * Run a command
 */
async function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: 'inherit' });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
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
