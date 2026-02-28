import { Command } from 'commander';
import { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '../modules/config/config.service';
import { InventoryService } from '../modules/inventory/inventory.service';
import { ServicesService } from '../modules/services/services.service';
import { stringifyYaml } from '../utils/yaml';
import { logger } from '../utils/logger';
import { MachineRole } from '../interfaces/machine.interface';
import { CORE_SERVICES, SERVICE_DEFAULTS } from '../interfaces/service.interface';

export function createConfigCommand(app: INestApplicationContext): Command {
  const command = new Command('config');

  command
    .description('Manage configuration')
    .addCommand(createShowCommand(app))
    .addCommand(createGenerateCommand(app))
    .addCommand(createSetCommand(app));

  return command;
}

function createShowCommand(app: INestApplicationContext): Command {
  return new Command('show')
    .description('Show current configuration')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const configService = app.get(ConfigService);

      const config = configService.getConfig();

      if (options.json) {
        console.log(JSON.stringify(config, null, 2));
      } else {
        logger.header('Current Configuration');
        logger.keyValue({
          'Version': config.version,
          'Initialized': config.initialized,
          'Cluster name': config.cluster.name,
          'Domain': config.cluster.domain,
          'Local domain': config.cluster.localDomain,
          'Last deployment': config.lastDeployment ?? 'Never',
        });
      }
    });
}

function createGenerateCommand(app: INestApplicationContext): Command {
  return new Command('generate')
    .description('Generate deployment.yaml template')
    .option('--from-current', 'Generate from current configuration')
    .action(async (options) => {
      const configService = app.get(ConfigService);
      const inventoryService = app.get(InventoryService);
      const servicesService = app.get(ServicesService);

      let template: Record<string, unknown>;

      if (options.fromCurrent) {
        // Generate from current state
        const config = configService.getConfig();
        const machines = inventoryService.getAll();
        const services = servicesService.getAll();

        template = {
          cluster: config.cluster,
          nodes: machines.map((m) => ({
            ip: m.ip,
            label: m.label,
            roles: m.roles,
            ssh_user: m.ssh.username,
            ssh_port: m.ssh.port,
          })),
          services: Object.fromEntries(
            services.map((s) => [
              s.name,
              s.config.enabled
                ? {
                    enabled: true,
                    replicas: s.config.replicas,
                    resources: s.config.resources,
                    ...(s.config.localDomain && { local_domain: s.config.localDomain }),
                    ...(s.config.publicDomain && { public_domain: s.config.publicDomain }),
                    ...(s.config.expose && { expose: true }),
                  }
                : { enabled: false },
            ]),
          ),
          settings: {
            bypass_permissions: false,
            skip_phases: [],
            parallel_deploys: 3,
          },
        };
      } else {
        // Generate empty template
        template = {
          cluster: {
            name: 'selfhost',
            domain: 'example.com',
            local_domain: 'homelab.local',
          },
          nodes: [
            {
              ip: '192.168.100.100',
              label: 'k8s-master-01',
              roles: [MachineRole.MASTER, MachineRole.GATEWAY],
              ssh_user: 'root',
              ssh_port: 22,
            },
            {
              ip: '192.168.100.101',
              label: 'k8s-worker-01',
              roles: [MachineRole.WORKER, MachineRole.STORAGE],
              ssh_user: 'root',
              ssh_port: 22,
            },
          ],
          services: {
            // Core services (always enabled)
            ...Object.fromEntries(
              CORE_SERVICES.map((name) => [
                name,
                { enabled: true },
              ]),
            ),
            // Databases
            postgresql: {
              enabled: true,
              replicas: 1,
              resources: SERVICE_DEFAULTS.postgresql,
            },
            valkey: {
              enabled: true,
              resources: SERVICE_DEFAULTS.valkey,
            },
            // Example app
            gitlab: {
              enabled: false,
              replicas: 1,
              resources: SERVICE_DEFAULTS.gitlab,
              public_domain: 'git.example.com',
              expose: true,
            },
          },
          settings: {
            bypass_permissions: false,
            skip_phases: [],
            parallel_deploys: 3,
          },
        };
      }

      console.log(stringifyYaml(template));
    });
}

function createSetCommand(app: INestApplicationContext): Command {
  return new Command('set')
    .description('Set configuration value')
    .argument('<key>', 'Configuration key (e.g., cluster.domain)')
    .argument('<value>', 'Value to set')
    .action(async (key, value) => {
      const configService = app.get(ConfigService);

      const parts = key.split('.');

      if (parts[0] === 'cluster' && parts.length === 2) {
        const clusterKey = parts[1] as 'name' | 'domain' | 'localDomain';
        configService.updateClusterConfig({ [clusterKey]: value });
        logger.success(`Set ${key} = ${value}`);
      } else {
        logger.error(`Unknown configuration key: ${key}`);
        logger.info('Valid keys: cluster.name, cluster.domain, cluster.localDomain');
        process.exit(1);
      }
    });
}
