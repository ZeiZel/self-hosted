import { Command } from 'commander';
import { INestApplicationContext } from '@nestjs/common';
import chalk from 'chalk';
import { ServicesService } from '../modules/services/services.service';
import { PromptsService } from '../modules/ui/prompts.service';
import { TableService } from '../modules/ui/table.service';
import { ServiceNamespace, CORE_SERVICES } from '../interfaces/service.interface';
import { logger } from '../utils/logger';
import { formatBytes, formatCpu } from '../utils/validation';

export function createServicesCommand(app: INestApplicationContext): Command {
  const command = new Command('services');

  command
    .description('Manage service selection and configuration')
    .addCommand(createListCommand(app))
    .addCommand(createSelectCommand(app))
    .addCommand(createConfigureCommand(app))
    .addCommand(createEnableCommand(app))
    .addCommand(createDisableCommand(app))
    .addCommand(createValidateCommand(app))
    .addCommand(createSummaryCommand(app));

  return command;
}

function createListCommand(app: INestApplicationContext): Command {
  return new Command('list')
    .alias('ls')
    .description('List all available services')
    .option('--enabled', 'Show only enabled services')
    .option('--namespace <ns>', 'Filter by namespace')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const servicesService = app.get(ServicesService);
      const tableService = app.get(TableService);

      let services = options.enabled
        ? servicesService.getEnabled()
        : servicesService.getAll();

      if (options.namespace) {
        services = services.filter((s) => s.namespace === options.namespace);
      }

      if (options.json) {
        console.log(JSON.stringify(services, null, 2));
        return;
      }

      logger.header('Available Services');

      // Group by namespace
      const byNamespace = new Map<ServiceNamespace, typeof services>();
      for (const service of services) {
        const existing = byNamespace.get(service.namespace) ?? [];
        existing.push(service);
        byNamespace.set(service.namespace, existing);
      }

      for (const [namespace, nsServices] of byNamespace) {
        logger.subHeader(`${namespace.toUpperCase()}`);
        console.log(tableService.servicesTable(nsServices));
      }

      // Summary
      const summary = servicesService.getSummary();
      logger.newLine();
      logger.keyValue({
        'Total services': summary.total,
        'Enabled': summary.enabled,
        'Heavy': summary.byTier.heavy,
        'Medium': summary.byTier.medium,
        'Light': summary.byTier.light,
      });
    });
}

function createSelectCommand(app: INestApplicationContext): Command {
  return new Command('select')
    .description('Interactive service selection')
    .action(async () => {
      const servicesService = app.get(ServicesService);
      const prompts = app.get(PromptsService);

      logger.header('Service Selection');
      logger.info('Select services to deploy. Core services are always enabled.');
      logger.newLine();

      const allServices = servicesService.getAll();

      // Group by namespace for easier selection
      const byNamespace = new Map<ServiceNamespace, typeof allServices>();
      for (const service of allServices) {
        const existing = byNamespace.get(service.namespace) ?? [];
        existing.push(service);
        byNamespace.set(service.namespace, existing);
      }

      // Process each namespace
      for (const [namespace, services] of byNamespace) {
        // Skip certain namespaces from selection
        if (namespace === ServiceNamespace.INGRESS) continue;

        logger.subHeader(namespace.toUpperCase());

        const choices = services.map((s) => {
          const isCore = CORE_SERVICES.includes(s.name);
          const resourceInfo = `${s.config.resources.memory} / ${s.config.resources.cpu}`;

          return {
            name: `${s.name} ${chalk.gray(`(${resourceInfo})`)}${isCore ? chalk.cyan(' [core]') : ''}`,
            value: s.name,
            checked: s.config.enabled || isCore,
            disabled: isCore ? 'Core service (always enabled)' : false,
          };
        });

        const selected = await prompts.multiSelect(
          `Select ${namespace} services:`,
          choices,
        );

        // Update service states
        for (const service of services) {
          if (!CORE_SERVICES.includes(service.name)) {
            servicesService.setEnabled(service.name, selected.includes(service.name));
          }
        }
      }

      // Calculate totals
      const totals = servicesService.calculateTotalResources();

      logger.newLine();
      logger.success('Services selected');
      logger.keyValue({
        'Total CPU': formatCpu(totals.cpu),
        'Total Memory': formatBytes(totals.memory),
        'Total Storage': formatBytes(totals.storage),
      });

      logger.newLine();
      logger.info('Configure individual services: selfhost services configure <name>');
      logger.info('View summary: selfhost services summary');
    });
}

function createConfigureCommand(app: INestApplicationContext): Command {
  return new Command('configure')
    .alias('config')
    .description('Configure a specific service')
    .argument('<name>', 'Service name')
    .action(async (name) => {
      const servicesService = app.get(ServicesService);
      const prompts = app.get(PromptsService);

      const service = servicesService.getByName(name);

      if (!service) {
        logger.error(`Service '${name}' not found`);
        process.exit(1);
      }

      logger.header(`Configure ${name}`);

      if (service.description) {
        logger.info(service.description);
      }

      logger.newLine();
      logger.keyValue({
        'Namespace': service.namespace,
        'Chart': service.chart,
        'Version': service.version,
        'Tier': service.tier,
        'Dependencies': service.needs.join(', ') || 'None',
      });
      logger.newLine();

      const config = await prompts.serviceConfig(name, {
        replicas: service.config.replicas,
        memory: service.config.resources.memory,
        cpu: service.config.resources.cpu,
        expose: service.config.expose,
      });

      servicesService.updateConfig(name, {
        replicas: config.replicas,
        resources: {
          ...service.config.resources,
          memory: config.memory,
          cpu: config.cpu,
        },
        expose: config.expose,
        localDomain: config.localDomain,
        publicDomain: config.publicDomain,
      });

      logger.success(`Configuration saved for ${name}`);
    });
}

function createEnableCommand(app: INestApplicationContext): Command {
  return new Command('enable')
    .description('Enable a service')
    .argument('<name>', 'Service name')
    .action(async (name) => {
      const servicesService = app.get(ServicesService);

      try {
        servicesService.setEnabled(name, true);
        logger.success(`Service '${name}' enabled`);
      } catch (error) {
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

function createDisableCommand(app: INestApplicationContext): Command {
  return new Command('disable')
    .description('Disable a service')
    .argument('<name>', 'Service name')
    .action(async (name) => {
      const servicesService = app.get(ServicesService);

      try {
        servicesService.setEnabled(name, false);
        logger.success(`Service '${name}' disabled`);
      } catch (error) {
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

function createValidateCommand(app: INestApplicationContext): Command {
  return new Command('validate')
    .description('Validate service selection and dependencies')
    .action(async () => {
      const servicesService = app.get(ServicesService);

      logger.header('Service Validation');

      const result = servicesService.validateSelection();

      if (result.errors.length > 0) {
        logger.subHeader('Errors');
        result.errors.forEach((err) => {
          logger.log(`  ${chalk.red('✖')} ${err}`);
        });
      }

      if (result.warnings.length > 0) {
        logger.subHeader('Warnings');
        result.warnings.forEach((warn) => {
          logger.log(`  ${chalk.yellow('⚠')} ${warn}`);
        });
      }

      if (result.valid) {
        logger.success('Service selection is valid');
      } else {
        logger.error('Service selection has errors');
        process.exit(1);
      }
    });
}

function createSummaryCommand(app: INestApplicationContext): Command {
  return new Command('summary')
    .description('Show enabled services summary')
    .action(async () => {
      const servicesService = app.get(ServicesService);
      const tableService = app.get(TableService);

      const enabled = servicesService.getEnabled();
      const summary = servicesService.getSummary();
      const totals = servicesService.calculateTotalResources();

      logger.header('Enabled Services Summary');

      console.log(tableService.servicesTable(enabled));

      logger.newLine();
      logger.subHeader('Resource Requirements');
      logger.keyValue({
        'Total CPU': formatCpu(totals.cpu),
        'Total Memory': formatBytes(totals.memory),
        'Total Storage': formatBytes(totals.storage),
      });

      logger.newLine();
      logger.subHeader('Service Tiers');
      logger.keyValue({
        'Heavy services': summary.byTier.heavy,
        'Medium services': summary.byTier.medium,
        'Light services': summary.byTier.light,
      });

      logger.newLine();
      logger.subHeader('Deployment Order');
      const order = servicesService.getDeploymentOrder();
      order.forEach((s, i) => {
        logger.log(`  ${chalk.gray(`${i + 1}.`)} ${s.name} ${chalk.gray(`(${s.namespace})`)}`);
      });
    });
}
