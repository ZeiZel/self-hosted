import { Command } from 'commander';
import { INestApplicationContext } from '@nestjs/common';
import chalk from 'chalk';
import { ConfigService } from '../modules/config/config.service';
import { InventoryService } from '../modules/inventory/inventory.service';
import { ServicesService } from '../modules/services/services.service';
import { TableService } from '../modules/ui/table.service';
import { logger } from '../utils/logger';
import { formatBytes, formatCpu } from '../utils/validation';
import { createCommandAction } from '../utils/command-helpers';

export function createStatusCommand(app: INestApplicationContext): Command {
  const command = new Command('status');

  command
    .description('Show cluster and deployment status')
    .option('--json', 'Output as JSON')
    .action(
      createCommandAction(
        app,
        {
          configService: ConfigService,
          inventoryService: InventoryService,
          servicesService: ServicesService,
          tableService: TableService,
        },
        async ({ configService, inventoryService, servicesService, tableService }, options) => {
          const config = configService.getConfig();
          const machines = inventoryService.getAll();
          const summary = inventoryService.getSummary();
          const serviceSummary = servicesService.getSummary();
          const totals = servicesService.calculateTotalResources();

          if (options.json) {
            console.log(
              JSON.stringify(
                {
                  initialized: config.initialized,
                  cluster: config.cluster,
                  lastDeployment: config.lastDeployment,
                  machines: summary,
                  services: serviceSummary,
                  resources: totals,
                },
                null,
                2,
              ),
            );
            return;
          }

          logger.header('Selfhost Status');

          // Config location
          logger.subHeader('Configuration');
          logger.keyValue({
            'Config directory': configService.getBaseDir(),
            'Project directory': configService.hasValidRepo()
              ? configService.getProjectDir()
              : chalk.gray('N/A'),
            Repository: configService.hasValidRepo()
              ? configService.getRepoRoot()
              : chalk.red('Not found'),
          });

          // Cluster info
          logger.subHeader('Cluster Configuration');
          logger.keyValue({
            Initialized: config.initialized ? chalk.green('Yes') : chalk.red('No'),
            'Cluster name': config.cluster.name,
            Domain: config.cluster.domain,
            'Local domain': config.cluster.localDomain,
            'Last deployment': config.lastDeployment ?? chalk.gray('Never'),
            'Active deployment': config.activeDeploymentId ?? chalk.gray('None'),
          });

          // Machine inventory
          logger.subHeader('Machine Inventory');

          if (machines.length === 0) {
            logger.info('No machines configured. Run `selfhost inventory add`');
          } else {
            logger.keyValue({
              'Total machines': summary.total,
              Online: chalk.green(String(summary.online)),
              Offline: summary.offline > 0 ? chalk.red(String(summary.offline)) : '0',
              Masters: summary.byRole.master,
              Workers: summary.byRole.worker,
              Gateways: summary.byRole.gateway,
            });

            logger.newLine();
            console.log(tableService.machinesTable(machines));
          }

          // Services
          logger.subHeader('Services');

          if (serviceSummary.enabled === 0) {
            logger.info('No services selected. Run `selfhost services select`');
          } else {
            logger.keyValue({
              'Total available': serviceSummary.total,
              Enabled: serviceSummary.enabled,
              Heavy: serviceSummary.byTier.heavy,
              Medium: serviceSummary.byTier.medium,
              Light: serviceSummary.byTier.light,
            });
          }

          // Resources
          if (serviceSummary.enabled > 0) {
            logger.subHeader('Resource Requirements');
            logger.keyValue({
              'Total CPU': formatCpu(totals.cpu),
              'Total Memory': formatBytes(totals.memory),
              'Total Storage': formatBytes(totals.storage),
            });
          }

          // Validation
          logger.subHeader('Validation');

          const inventoryValidation = inventoryService.validate();
          const servicesValidation = servicesService.validateSelection();

          logger.keyValue({
            Inventory: inventoryValidation.valid ? chalk.green('Valid') : chalk.red('Invalid'),
            Services: servicesValidation.valid ? chalk.green('Valid') : chalk.red('Invalid'),
          });

          if (!inventoryValidation.valid || !servicesValidation.valid) {
            logger.newLine();
            [...inventoryValidation.errors, ...servicesValidation.errors].forEach((err) => {
              logger.log(`  ${chalk.red('✖')} ${err}`);
            });
          }

          // Next steps
          logger.newLine();
          logger.subHeader('Next Steps');

          if (!config.initialized) {
            logger.list(['Run `selfhost init` to initialize']);
          } else if (machines.length === 0) {
            logger.list(['Add machines: `selfhost inventory add`']);
          } else if (serviceSummary.enabled === 0) {
            logger.list(['Select services: `selfhost services select`']);
          } else if (!inventoryValidation.valid || !servicesValidation.valid) {
            logger.list([
              'Fix validation errors above',
              'Run `selfhost inventory validate`',
              'Run `selfhost services validate`',
            ]);
          } else {
            logger.list(['Review plan: `selfhost plan`', 'Deploy: `selfhost deploy`']);
          }
        },
      ),
    );

  return command;
}
