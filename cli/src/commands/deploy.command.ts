import { Command } from 'commander';
import { INestApplicationContext } from '@nestjs/common';
import chalk from 'chalk';
import { ConfigService, DeploymentStateData } from '../modules/config/config.service';
import { InventoryService } from '../modules/inventory/inventory.service';
import { ServicesService } from '../modules/services/services.service';
import { PromptsService } from '../modules/ui/prompts.service';
import { DeploymentPhase, getPhaseName } from '../interfaces/deployment.interface';
import { logger } from '../utils/logger';

export function createDeployCommand(app: INestApplicationContext): Command {
  const command = new Command('deploy');

  command
    .description('Deploy infrastructure and services')
    .option('--bypass-permissions', 'Skip all confirmation prompts')
    .option('--config <path>', 'Use YAML configuration file (headless mode)')
    .option('--skip-phase <phases>', 'Skip specific phases (comma-separated)')
    .option('--only-phase <phase>', 'Run only specific phase')
    .option('--dry-run', 'Show what would be executed without making changes')
    .option('--resume', 'Resume last incomplete deployment')
    .option('--fresh', 'Start fresh deployment (ignore any incomplete)')
    .option(
      '--enable-local-access',
      'Configure local machine to access services via <app>.zeizel.local',
    )
    .option(
      '--local-domain <domain>',
      'Local domain suffix (default: zeizel.local)',
      'zeizel.local',
    )
    .addCommand(createHistoryCommand(app))
    .addCommand(createCleanCommand(app))
    .action(async (options) => {
      const configService = app.get(ConfigService);
      const inventoryService = app.get(InventoryService);
      const servicesService = app.get(ServicesService);
      const prompts = app.get(PromptsService);

      logger.header('Deployment');

      // Check initialization
      if (!configService.isInitialized()) {
        logger.error('CLI not initialized. Run `selfhost init` first.');
        process.exit(1);
      }

      // Check for active deployment
      const activeDeployment = configService.getActiveDeployment();
      let deploymentState: DeploymentStateData | null = null;

      if (activeDeployment && activeDeployment.status === 'running') {
        if (options.fresh) {
          logger.warn('Abandoning previous deployment and starting fresh');
          configService.completeDeployment(activeDeployment.id, 'cancelled');
        } else if (options.resume) {
          logger.info('Resuming previous deployment...');
          deploymentState = activeDeployment;
        } else {
          logger.warn(`Found incomplete deployment from ${activeDeployment.startedAt}`);
          logger.keyValue({
            Status: activeDeployment.status,
            'Current phase': getPhaseName(activeDeployment.currentPhase),
            Completed: activeDeployment.completedPhases.length,
            Failed: activeDeployment.failedPhases.length,
          });
          logger.newLine();

          const action = await prompts.select('What would you like to do?', [
            { name: 'Resume from where it stopped', value: 'resume' },
            { name: 'Start fresh (cancel previous)', value: 'fresh' },
            { name: 'Cancel', value: 'cancel' },
          ]);

          if (action === 'cancel') {
            return;
          } else if (action === 'resume') {
            deploymentState = activeDeployment;
          } else {
            configService.completeDeployment(activeDeployment.id, 'cancelled');
          }
        }
      }

      // Validate inventory
      const inventoryValidation = inventoryService.validate();
      if (!inventoryValidation.valid) {
        logger.error('Inventory validation failed');
        process.exit(1);
      }

      // Validate services
      const servicesValidation = servicesService.validateSelection();
      if (!servicesValidation.valid) {
        logger.error('Services validation failed');
        process.exit(1);
      }

      // Show deployment plan
      const machines = inventoryService.getAll();
      const enabledServices = servicesService.getEnabled();

      logger.subHeader('Deployment Overview');
      logger.keyValue({
        Machines: machines.length,
        Services: enabledServices.length,
        'Dry run': options.dryRun ? 'Yes' : 'No',
        'Bypass confirmations': options.bypassPermissions ? 'Yes' : 'No',
        'Local access': options.enableLocalAccess ? `Enabled (${options.localDomain})` : 'Disabled',
      });

      // Create or use deployment state
      if (!deploymentState) {
        deploymentState = configService.createDeploymentState({
          machines: machines.map((m) => ({ label: m.label, ip: m.ip, roles: m.roles })),
          services: enabledServices.map((s) => s.name),
        });
        logger.info(`Created deployment: ${deploymentState.id}`);
      }

      // Update state to running
      configService.updateDeploymentState(deploymentState.id, { status: 'running' });

      // Phases to execute
      const allPhases = Object.values(DeploymentPhase).filter(
        (v) => typeof v === 'number',
      ) as DeploymentPhase[];
      let phases = allPhases;

      // If resuming, skip completed phases
      if (deploymentState.completedPhases.length > 0) {
        phases = phases.filter((p) => !deploymentState!.completedPhases.includes(p));
        logger.info(`Skipping ${deploymentState.completedPhases.length} already completed phases`);
      }

      if (options.skipPhase) {
        const skip = options.skipPhase.split(',').map(Number);
        phases = phases.filter((p) => !skip.includes(p));
      }

      if (options.onlyPhase) {
        const only = parseInt(options.onlyPhase, 10);
        phases = phases.filter((p) => p === only);
      }

      logger.newLine();
      logger.subHeader('Phases to Execute');
      phases.forEach((phase) => {
        logger.log(`  ${chalk.cyan(`[${phase}]`)} ${getPhaseName(phase)}`);
      });

      // Confirmation
      if (!options.bypassPermissions && !options.dryRun) {
        logger.newLine();
        const proceed = await prompts.confirm('Proceed with deployment?', false);
        if (!proceed) {
          logger.info('Deployment cancelled');
          return;
        }
      }

      if (options.dryRun) {
        logger.newLine();
        logger.info(chalk.yellow('DRY RUN MODE - No changes will be made'));
        logger.newLine();
      }

      // Execute phases
      for (const phase of phases) {
        logger.newLine();
        logger.subHeader(`Phase ${phase}: ${getPhaseName(phase)}`);

        if (options.dryRun) {
          logger.info(`Would execute phase: ${getPhaseName(phase)}`);
          await showPhaseTasks(phase);
          continue;
        }

        if (!options.bypassPermissions) {
          const proceed = await prompts.confirm(`Execute phase ${phase}?`, true);
          if (!proceed) {
            logger.info(`Skipping phase ${phase}`);
            continue;
          }
        }

        const spinner = logger.spinner(`Executing ${getPhaseName(phase)}...`).start();

        try {
          // TODO: Implement actual phase execution
          // For now, simulate with delay
          await new Promise((resolve) => setTimeout(resolve, 1000));

          spinner.succeed(`Phase ${phase} completed`);
          configService.markPhaseCompleted(deploymentState!.id, phase);
        } catch (error) {
          spinner.fail(`Phase ${phase} failed`);
          const errorMsg = error instanceof Error ? error.message : String(error);
          configService.markPhaseFailed(deploymentState!.id, phase, errorMsg);

          const action = await prompts.errorAction(getPhaseName(phase), errorMsg);

          switch (action) {
            case 'retry':
              // Retry logic would go here
              configService.addDeploymentLog(deploymentState!.id, phase, 'info', 'Retrying phase');
              break;
            case 'skip':
              logger.warn(`Skipping phase ${phase}`);
              configService.markPhaseSkipped(deploymentState!.id, phase);
              break;
            case 'abort':
              logger.error('Deployment aborted');
              configService.completeDeployment(deploymentState!.id, 'cancelled');
              process.exit(1);
              break; // unreachable but satisfies linter
            case 'debug':
              // Show logs
              break;
          }
        }
      }

      logger.newLine();
      logger.success('Deployment completed!');

      // Complete deployment
      configService.completeDeployment(deploymentState!.id, 'success');
    });

  return command;
}

function createHistoryCommand(app: INestApplicationContext): Command {
  return new Command('history')
    .description('Show deployment history')
    .option('--limit <n>', 'Number of deployments to show', '10')
    .action(async (options) => {
      const configService = app.get(ConfigService);

      const deployments = configService.listDeployments().slice(0, parseInt(options.limit, 10));

      if (deployments.length === 0) {
        logger.info('No deployment history found.');
        return;
      }

      logger.header('Deployment History');

      for (const deployment of deployments) {
        const statusColor = {
          success: chalk.green,
          failed: chalk.red,
          cancelled: chalk.yellow,
          running: chalk.blue,
          pending: chalk.gray,
        }[deployment.status];

        logger.log(`${chalk.bold(deployment.id)}`);
        logger.keyValue({
          Started: deployment.startedAt,
          Completed: deployment.completedAt ?? chalk.gray('In progress'),
          Status: statusColor(deployment.status),
          'Phases completed': deployment.completedPhases.length,
          'Phases failed': deployment.failedPhases.length,
          'Phases skipped': deployment.skippedPhases.length,
        });
        logger.newLine();
      }
    });
}

function createCleanCommand(app: INestApplicationContext): Command {
  return new Command('clean')
    .description('Clean old deployment history')
    .option('--keep <n>', 'Number of deployments to keep', '10')
    .option('--all', 'Remove all deployment history')
    .action(async (options) => {
      const configService = app.get(ConfigService);
      const prompts = app.get(PromptsService);

      if (options.all) {
        const confirm = await prompts.confirm('Remove ALL deployment history?', false);
        if (!confirm) return;
        configService.cleanOldDeployments(0);
        logger.success('All deployment history removed');
      } else {
        const keepCount = parseInt(options.keep, 10);
        configService.cleanOldDeployments(keepCount);
        logger.success(`Cleaned old deployments, keeping last ${keepCount}`);
      }
    });
}

async function showPhaseTasks(phase: DeploymentPhase): Promise<void> {
  const phaseTasks: Record<DeploymentPhase, string[]> = {
    [DeploymentPhase.INFRASTRUCTURE_SETUP]: [
      'Generate Ansible inventory',
      'Setup SSH keys on all nodes',
      'Install base packages (Docker, containerd)',
      'Configure firewall rules',
    ],
    [DeploymentPhase.KUBERNETES_BOOTSTRAP]: [
      'Run Kubespray preparation',
      'Deploy Kubernetes cluster',
      'Configure kubectl context',
      'Deploy CNI (Cilium/Calico)',
    ],
    [DeploymentPhase.STORAGE_LAYER]: [
      'Prepare storage nodes (iSCSI, packages)',
      'Deploy OpenEBS on storage nodes',
      'Create StorageClasses (openebs-hostpath)',
      'Verify PVC provisioning',
    ],
    [DeploymentPhase.BACKUP_SETUP]: [
      'Prepare backup node (NFS server)',
      'Initialize Restic repository',
      'Deploy Zerobyte backup UI',
      'Configure backup CronJobs',
      'Verify backup infrastructure',
    ],
    [DeploymentPhase.CORE_SERVICES]: [
      'Deploy namespaces',
      'Deploy Traefik (ingress)',
      'Deploy Consul (service mesh)',
      'Deploy Vault (secrets)',
      'Deploy cert-manager',
      'Deploy Authentik (SSO)',
    ],
    [DeploymentPhase.DATABASES]: [
      'Deploy PostgreSQL',
      'Deploy MongoDB',
      'Deploy Valkey',
      'Deploy MinIO',
      'Deploy other selected databases',
    ],
    [DeploymentPhase.APPLICATION_SERVICES]: [
      'Deploy code namespace services',
      'Deploy productivity services',
      'Deploy data services',
      'Deploy remaining services',
    ],
    [DeploymentPhase.NETWORK_GATEWAY]: [
      'Deploy Pangolin VPN',
      'Configure WireGuard tunnel',
      'Setup DNS records',
    ],
    [DeploymentPhase.VERIFICATION]: [
      'Run Helm tests',
      'Verify all pods Running',
      'Test ingress endpoints',
      'Configure local access (/etc/hosts) if enabled',
      'Test local connectivity (<app>.zeizel.local)',
      'Test remote connectivity (<app>.zeizel.ru)',
      'Generate access credentials report',
    ],
  };

  const tasks = phaseTasks[phase] ?? [];
  tasks.forEach((task) => {
    logger.log(`  ${chalk.gray('○')} ${task}`);
  });
}
