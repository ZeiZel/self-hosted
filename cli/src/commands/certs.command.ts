import { Command } from 'commander';
import { INestApplicationContext } from '@nestjs/common';
import { spawn } from 'child_process';
import { join } from 'path';
import chalk from 'chalk';
import { ConfigService } from '../modules/config/config.service';
import { logger } from '../utils/logger';

export function createCertsCommand(app: INestApplicationContext): Command {
  const command = new Command('certs');

  command.description('TLS certificate management with cert-manager');

  command.addCommand(createSetupSubcommand(app));
  command.addCommand(createListSubcommand());
  command.addCommand(createStatusSubcommand());

  // Default action shows status
  command.action(async () => {
    await showCertificates();
  });

  return command;
}

/**
 * Setup subcommand - configure cert-manager ClusterIssuers
 */
function createSetupSubcommand(app: INestApplicationContext): Command {
  return new Command('setup')
    .description('Configure cert-manager ClusterIssuers')
    .option('--email <email>', 'Email for Let\'s Encrypt registration', 'admin@zeizel.ru')
    .option('--staging', 'Use Let\'s Encrypt staging server for testing')
    .action(async (options) => {
      const configService = app.get(ConfigService);

      logger.header('Certificate Manager Setup');
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

      const playbookPath = join(repoRoot, 'ansible', 'cert-manager.yml');

      // Check if playbook exists
      const playbookFile = Bun.file(playbookPath);
      if (!(await playbookFile.exists())) {
        logger.error(`Playbook not found: ${playbookPath}`);
        process.exit(1);
      }

      logger.info('Configuring cert-manager ClusterIssuers...');
      logger.log(`  Email: ${options.email}`);
      logger.log(`  Server: ${options.staging ? 'Staging' : 'Production'}`);
      logger.newLine();

      const extraVars = [
        '-e', `cert_manager_issuer_email=${options.email}`,
      ];

      if (options.staging) {
        extraVars.push('-e', 'cert_manager_acme_server=https://acme-staging-v02.api.letsencrypt.org/directory');
      }

      const result = await runAnsiblePlaybook(playbookPath, extraVars);

      if (result.success) {
        logger.newLine();
        logger.success('Cert-manager configured successfully!');
        logger.newLine();
        logger.info('ClusterIssuers created:');
        logger.log(chalk.cyan('  - letsencrypt-prod (ACME HTTP-01)'));
        logger.log(chalk.cyan('  - selfsigned-issuer (self-signed)'));
        logger.newLine();
        logger.info('To request a certificate, add this annotation to your Ingress:');
        logger.log(chalk.gray('  cert-manager.io/cluster-issuer: "letsencrypt-prod"'));
      } else {
        logger.error('Cert-manager setup failed');
        if (result.error) {
          logger.log(result.error);
        }
        process.exit(1);
      }
    });
}

/**
 * List subcommand - show all certificates
 */
function createListSubcommand(): Command {
  return new Command('list')
    .description('List all certificates')
    .option('-n, --namespace <namespace>', 'Filter by namespace')
    .action(async (options) => {
      await showCertificates(options.namespace);
    });
}

/**
 * Status subcommand - show certificate status
 */
function createStatusSubcommand(): Command {
  return new Command('status')
    .description('Show certificate status')
    .argument('[name]', 'Certificate name')
    .option('-n, --namespace <namespace>', 'Namespace', 'infrastructure')
    .action(async (name, options) => {
      if (name) {
        await showCertificateDetails(name, options.namespace);
      } else {
        await showCertificates(options.namespace);
      }
    });
}

/**
 * Show all certificates
 */
async function showCertificates(namespace?: string): Promise<void> {
  logger.header('TLS Certificates');
  logger.newLine();

  const args = ['get', 'certificates', '-o', 'wide'];
  if (namespace) {
    args.push('-n', namespace);
  } else {
    args.push('-A');
  }

  const { stdout, exitCode } = await runCommandOutput('kubectl', args);

  if (exitCode !== 0) {
    logger.error('Failed to get certificates');
    return;
  }

  if (stdout.trim()) {
    logger.log(stdout);
  } else {
    logger.info('No certificates found');
  }

  // Also show ClusterIssuers
  logger.newLine();
  logger.log(chalk.bold('ClusterIssuers:'));
  const { stdout: issuers } = await runCommandOutput('kubectl', ['get', 'clusterissuers', '-o', 'wide']);
  if (issuers.trim()) {
    logger.log(issuers);
  }
}

/**
 * Show certificate details
 */
async function showCertificateDetails(name: string, namespace: string): Promise<void> {
  logger.header(`Certificate: ${name}`);
  logger.newLine();

  const { stdout, exitCode } = await runCommandOutput('kubectl', [
    'describe', 'certificate', name, '-n', namespace,
  ]);

  if (exitCode !== 0) {
    logger.error(`Certificate '${name}' not found in namespace '${namespace}'`);
    return;
  }

  logger.log(stdout);
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

    proc.stderr.on('data', (data) => {
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
