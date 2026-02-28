import { Command } from 'commander';
import { INestApplicationContext } from '@nestjs/common';
import chalk from 'chalk';
import { ConfigService } from '../modules/config/config.service';
import { InventoryService } from '../modules/inventory/inventory.service';
import { ServicesService } from '../modules/services/services.service';
import { HostService } from '../modules/host/host.service';
import { logger } from '../utils/logger';
import { existsSync } from 'fs';

export function createValidateCommand(app: INestApplicationContext): Command {
  const command = new Command('validate');

  command
    .description('Validate configuration, inventory, and services')
    .option('--config <path>', 'Validate YAML configuration file')
    .option('--strict', 'Fail on warnings')
    .action(async (options) => {
      const configService = app.get(ConfigService);
      const inventoryService = app.get(InventoryService);
      const servicesService = app.get(ServicesService);
      const hostService = app.get(HostService);

      logger.header('Validation');

      let hasErrors = false;
      let hasWarnings = false;

      // Repository validation
      logger.subHeader('Repository');

      if (!configService.hasValidRepo()) {
        logger.log(`  ${chalk.red('✖')} Not in a valid selfhost repository`);
        hasErrors = true;
      } else {
        logger.log(`  ${chalk.green('✔')} Repository found: ${configService.getRepoRoot()}`);

        const paths = configService.getPaths();

        // Check critical files
        const criticalFiles = [
          { path: paths.appsRegistry, name: 'Apps registry' },
          { path: paths.ansible, name: 'Ansible directory' },
          { path: paths.charts, name: 'Charts directory' },
        ];

        for (const file of criticalFiles) {
          if (existsSync(file.path)) {
            logger.log(`  ${chalk.green('✔')} ${file.name}`);
          } else {
            logger.log(`  ${chalk.red('✖')} ${file.name} not found`);
            hasErrors = true;
          }
        }
      }

      // Dependencies validation
      logger.subHeader('Dependencies');

      const { available, missing } = await hostService.checkLocalDependencies();

      available.forEach((tool) => {
        logger.log(`  ${chalk.green('✔')} ${tool}`);
      });

      missing.forEach((tool) => {
        logger.log(`  ${chalk.red('✖')} ${tool} not installed`);
        hasErrors = true;
      });

      // Inventory validation
      logger.subHeader('Inventory');

      const inventoryResult = inventoryService.validate();

      if (inventoryResult.errors.length === 0 && inventoryResult.warnings.length === 0) {
        logger.log(`  ${chalk.green('✔')} Inventory is valid`);
      }

      inventoryResult.errors.forEach((err) => {
        logger.log(`  ${chalk.red('✖')} ${err}`);
        hasErrors = true;
      });

      inventoryResult.warnings.forEach((warn) => {
        logger.log(`  ${chalk.yellow('⚠')} ${warn}`);
        hasWarnings = true;
      });

      // Services validation
      logger.subHeader('Services');

      const servicesResult = servicesService.validateSelection();

      if (servicesResult.errors.length === 0 && servicesResult.warnings.length === 0) {
        logger.log(`  ${chalk.green('✔')} Service selection is valid`);
      }

      servicesResult.errors.forEach((err) => {
        logger.log(`  ${chalk.red('✖')} ${err}`);
        hasErrors = true;
      });

      servicesResult.warnings.forEach((warn) => {
        logger.log(`  ${chalk.yellow('⚠')} ${warn}`);
        hasWarnings = true;
      });

      // Summary
      logger.newLine();

      if (hasErrors) {
        logger.error('Validation failed with errors');
        process.exit(1);
      } else if (hasWarnings && options.strict) {
        logger.error('Validation failed (strict mode): warnings present');
        process.exit(1);
      } else if (hasWarnings) {
        logger.warn('Validation passed with warnings');
      } else {
        logger.success('All validations passed');
      }
    });

  return command;
}
