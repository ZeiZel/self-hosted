import { Command } from 'commander';
import { INestApplicationContext } from '@nestjs/common';
import chalk from 'chalk';
import { ConfigService } from '../modules/config/config.service';
import { HostService } from '../modules/host/host.service';
import { PromptsService } from '../modules/ui/prompts.service';
import { logger } from '../utils/logger';

export function createInitCommand(app: INestApplicationContext): Command {
  const command = new Command('init');

  command
    .description('Initialize selfhost CLI and verify dependencies')
    .option('--skip-deps', 'Skip dependency installation')
    .option('--force', 'Force re-initialization')
    .action(async (options) => {
      const configService = app.get(ConfigService);
      const hostService = app.get(HostService);
      const prompts = app.get(PromptsService);

      logger.header('Selfhost CLI Initialization');

      // Check if already initialized
      if (configService.isInitialized() && !options.force) {
        logger.info('CLI is already initialized.');
        const reinit = await prompts.confirm('Re-initialize?', false);
        if (!reinit) {
          return;
        }
      }

      // Verify repository
      if (!configService.hasValidRepo()) {
        logger.error('Not in a valid selfhost repository.');
        logger.info('Please run this command from the repository root.');
        process.exit(1);
      }

      logger.success(`Repository found: ${configService.getRepoRoot()}`);

      // Check local dependencies
      logger.subHeader('Checking dependencies');
      const spinner = logger.spinner('Checking installed tools...').start();

      const { available, missing } = await hostService.checkLocalDependencies();
      spinner.stop();

      logger.info('Available tools:');
      available.forEach((tool) => {
        logger.log(`  ${chalk.green('✔')} ${tool}`);
      });

      if (missing.length > 0) {
        logger.warn('Missing tools:');
        missing.forEach((tool) => {
          logger.log(`  ${chalk.red('✖')} ${tool}`);
        });

        if (!options.skipDeps) {
          logger.newLine();
          logger.info('To install missing dependencies, run:');
          logger.log(chalk.cyan('  ansible-playbook ansible/all.yml --tags setup_host'));
        }
      }

      // Local machine info
      logger.subHeader('Local machine info');
      const localInfo = await hostService.getLocalInfo();
      logger.keyValue({
        OS: localInfo.os,
        Architecture: localInfo.arch,
        'Home directory': localInfo.homeDir,
        'SSH key exists': localInfo.sshKeyExists ? 'Yes' : 'No',
      });

      // Cluster configuration
      logger.subHeader('Cluster configuration');

      const clusterConfig = await prompts.clusterWizard();
      configService.updateClusterConfig(clusterConfig);

      // Mark as initialized
      configService.markInitialized();

      logger.newLine();
      logger.success('Initialization complete!');
      logger.newLine();
      logger.info('Next steps:');
      logger.list([
        'Add machines to inventory: selfhost inventory add',
        'Select services: selfhost services select',
        'Plan deployment: selfhost plan',
        'Deploy: selfhost deploy',
      ]);
    });

  return command;
}
