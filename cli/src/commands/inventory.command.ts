import { Command } from 'commander';
import { INestApplicationContext } from '@nestjs/common';
import chalk from 'chalk';
import { InventoryService } from '../modules/inventory/inventory.service';
import { HostService } from '../modules/host/host.service';
import { PromptsService } from '../modules/ui/prompts.service';
import { TableService } from '../modules/ui/table.service';
import { logger } from '../utils/logger';

export function createInventoryCommand(app: INestApplicationContext): Command {
  const command = new Command('inventory');

  command
    .description('Manage machine inventory')
    .addCommand(createAddCommand(app))
    .addCommand(createListCommand(app))
    .addCommand(createRemoveCommand(app))
    .addCommand(createValidateCommand(app))
    .addCommand(createTestCommand(app))
    .addCommand(createGenerateCommand(app));

  return command;
}

function createAddCommand(app: INestApplicationContext): Command {
  return new Command('add')
    .description('Add a new machine to inventory')
    .option('--ip <ip>', 'Machine IP address')
    .option('--label <label>', 'Machine label')
    .option('--roles <roles>', 'Comma-separated roles (master,worker,gateway,storage,backups)')
    .option('--ssh-user <user>', 'SSH username', 'root')
    .option('--ssh-port <port>', 'SSH port', '22')
    .option('--no-test', 'Skip SSH connection test')
    .action(async (options) => {
      const inventoryService = app.get(InventoryService);
      const hostService = app.get(HostService);
      const prompts = app.get(PromptsService);

      logger.header('Add Machine to Inventory');

      let machineData;

      if (options.ip && options.label && options.roles) {
        // Non-interactive mode
        machineData = {
          ip: options.ip,
          label: options.label,
          roles: options.roles.split(','),
          sshUser: options.sshUser,
          sshPort: parseInt(options.sshPort, 10),
        };
      } else {
        // Interactive wizard
        machineData = await prompts.machineWizard();
      }

      // Test SSH connection
      if (options.test !== false) {
        const spinner = logger.spinner('Testing SSH connection...').start();

        const result = await hostService.testConnection({
          host: machineData.ip,
          port: machineData.sshPort,
          username: machineData.sshUser,
        });

        if (result.success) {
          spinner.succeed('SSH connection successful');
        } else {
          spinner.fail(`SSH connection failed: ${result.error}`);

          const proceed = await prompts.confirm('Add machine anyway?', false);
          if (!proceed) {
            return;
          }
        }
      }

      // Add machine
      try {
        const machine = inventoryService.add({
          ip: machineData.ip,
          label: machineData.label,
          roles: machineData.roles,
          ssh: {
            username: machineData.sshUser,
            port: machineData.sshPort,
          },
        });

        logger.success(`Machine '${machine.label}' added successfully`);
        logger.keyValue({
          'ID': machine.id,
          'IP': machine.ip,
          'Roles': machine.roles.join(', '),
        });
      } catch (error) {
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

function createListCommand(app: INestApplicationContext): Command {
  return new Command('list')
    .alias('ls')
    .description('List all machines in inventory')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const inventoryService = app.get(InventoryService);
      const tableService = app.get(TableService);

      const machines = inventoryService.getAll();

      if (machines.length === 0) {
        logger.info('No machines in inventory.');
        logger.info('Add a machine with: selfhost inventory add');
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(machines, null, 2));
        return;
      }

      logger.header('Machine Inventory');

      const summary = inventoryService.getSummary();
      logger.keyValue({
        'Total machines': summary.total,
        'Masters': summary.byRole.master,
        'Workers': summary.byRole.worker,
        'Gateways': summary.byRole.gateway,
        'Storage': summary.byRole.storage,
      });

      logger.newLine();
      console.log(tableService.machinesTable(machines));
    });
}

function createRemoveCommand(app: INestApplicationContext): Command {
  return new Command('remove')
    .alias('rm')
    .description('Remove a machine from inventory')
    .argument('<label>', 'Machine label or ID')
    .option('--force', 'Skip confirmation')
    .action(async (label, options) => {
      const inventoryService = app.get(InventoryService);
      const prompts = app.get(PromptsService);

      const machine = inventoryService.getByLabel(label) ?? inventoryService.getById(label);

      if (!machine) {
        logger.error(`Machine '${label}' not found`);
        process.exit(1);
      }

      if (!options.force) {
        const confirm = await prompts.confirm(
          `Remove machine '${machine.label}' (${machine.ip})?`,
          false
        );
        if (!confirm) {
          return;
        }
      }

      inventoryService.remove(machine.id);
      logger.success(`Machine '${machine.label}' removed`);
    });
}

function createValidateCommand(app: INestApplicationContext): Command {
  return new Command('validate')
    .description('Validate inventory configuration')
    .action(async () => {
      const inventoryService = app.get(InventoryService);

      logger.header('Inventory Validation');

      const result = inventoryService.validate();

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
        logger.success('Inventory is valid');
      } else {
        logger.error('Inventory has errors');
        process.exit(1);
      }
    });
}

function createTestCommand(app: INestApplicationContext): Command {
  return new Command('test')
    .description('Test SSH connectivity to all machines')
    .action(async () => {
      const inventoryService = app.get(InventoryService);
      const hostService = app.get(HostService);

      const machines = inventoryService.getAll();

      if (machines.length === 0) {
        logger.info('No machines in inventory.');
        return;
      }

      logger.header('Testing SSH Connectivity');

      for (const machine of machines) {
        const spinner = logger.spinner(`Testing ${machine.label}...`).start();

        const result = await hostService.testConnection(machine.ssh);

        if (result.success) {
          spinner.succeed(`${machine.label} (${machine.ip}) - Connected`);
          inventoryService.update(machine.id, { status: 'online', lastSeen: new Date().toISOString() });
        } else {
          spinner.fail(`${machine.label} (${machine.ip}) - ${result.error}`);
          inventoryService.update(machine.id, { status: 'error' });
        }
      }
    });
}

function createGenerateCommand(app: INestApplicationContext): Command {
  return new Command('generate')
    .description('Generate Ansible inventory file')
    .option('-o, --output <path>', 'Output file path')
    .action(async (options) => {
      const inventoryService = app.get(InventoryService);

      const inventory = inventoryService.generateAnsibleInventory();

      if (options.output) {
        const { writeFileSync } = await import('fs');
        writeFileSync(options.output, inventory);
        logger.success(`Inventory written to ${options.output}`);
      } else {
        console.log(inventory);
      }
    });
}
