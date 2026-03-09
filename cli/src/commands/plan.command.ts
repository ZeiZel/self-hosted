import { Command } from 'commander';
import { INestApplicationContext } from '@nestjs/common';
import chalk from 'chalk';
import { InventoryService } from '../modules/inventory/inventory.service';
import { ServicesService } from '../modules/services/services.service';
import { TableService } from '../modules/ui/table.service';
import { MachineRole } from '../interfaces/machine.interface';
import { logger } from '../utils/logger';
import { parseCpuToMillicores, parseMemoryToBytes } from '../utils/validation';

export function createPlanCommand(app: INestApplicationContext): Command {
  const command = new Command('plan');

  command
    .description('Generate deployment plan with resource allocation')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const inventoryService = app.get(InventoryService);
      const servicesService = app.get(ServicesService);
      const tableService = app.get(TableService);

      logger.header('Deployment Planning');

      // Validate inventory
      const inventoryValidation = inventoryService.validate();
      if (!inventoryValidation.valid) {
        logger.error('Inventory validation failed:');
        inventoryValidation.errors.forEach((err) => logger.log(`  ${chalk.red('✖')} ${err}`));
        process.exit(1);
      }

      // Validate services
      const servicesValidation = servicesService.validateSelection();
      if (!servicesValidation.valid) {
        logger.error('Services validation failed:');
        servicesValidation.errors.forEach((err) => logger.log(`  ${chalk.red('✖')} ${err}`));
        process.exit(1);
      }

      const machines = inventoryService.getAll();
      const enabledServices = servicesService.getEnabled();

      // Calculate node resources
      const nodes = machines.map((m) => {
        const facts = m.facts as Record<string, unknown> | undefined;
        const cpuCores = typeof facts?.cpuCores === 'number' ? facts.cpuCores : 4;
        const memoryTotal = typeof facts?.memoryTotal === 'number' ? facts.memoryTotal : 8 * 1024 * 1024 * 1024;
        return {
          label: m.label,
          ip: m.ip,
          roles: m.roles,
          totalCpu: cpuCores * 1000, // millicores
          totalMemory: memoryTotal, // bytes
          allocatedCpu: 0,
          allocatedMemory: 0,
        };
      });

      // Service placement using bin-packing
      const placements: {
        service: string;
        namespace: string;
        node: string;
        resources: { cpu: string; memory: string };
        reason: string;
      }[] = [];

      // Sort services by resource requirements (descending)
      const sortedServices = [...enabledServices].sort((a, b) => {
        const aMemory = parseMemoryToBytes(a.config.resources.memory);
        const bMemory = parseMemoryToBytes(b.config.resources.memory);
        return bMemory - aMemory;
      });

      for (const service of sortedServices) {
        const serviceCpu = parseCpuToMillicores(service.config.resources.cpu);
        const serviceMemory = parseMemoryToBytes(service.config.resources.memory);

        // Determine preferred node type based on service
        let preferredRoles: MachineRole[] = [];
        let reason = 'Best fit';

        // Gateway services
        if (['traefik', 'pangolin'].includes(service.name)) {
          preferredRoles = [MachineRole.GATEWAY, MachineRole.MASTER];
          reason = 'Gateway/ingress service';
        }
        // Core services on master
        else if (['vault', 'consul', 'authentik', 'cert-manager'].includes(service.name)) {
          preferredRoles = [MachineRole.MASTER];
          reason = 'Core service';
        }
        // Storage services
        else if (['monitoring', 'logging'].includes(service.name)) {
          preferredRoles = [MachineRole.STORAGE, MachineRole.MASTER, MachineRole.WORKER];
          reason = 'Storage-intensive service';
        }
        // Worker preference for apps
        else {
          preferredRoles = [MachineRole.WORKER, MachineRole.MASTER];
          reason = 'Application workload';
        }

        // Find best node
        const eligibleNodes = nodes
          .filter((n) => preferredRoles.some((r) => n.roles.includes(r)))
          .sort((a, b) => {
            // Sort by available resources (descending)
            const aAvailable = a.totalMemory - a.allocatedMemory;
            const bAvailable = b.totalMemory - b.allocatedMemory;
            return bAvailable - aAvailable;
          });

        const targetNode = eligibleNodes.find(
          (n) =>
            n.totalCpu - n.allocatedCpu >= serviceCpu &&
            n.totalMemory - n.allocatedMemory >= serviceMemory,
        );

        if (targetNode) {
          targetNode.allocatedCpu += serviceCpu * service.config.replicas;
          targetNode.allocatedMemory += serviceMemory * service.config.replicas;

          placements.push({
            service: service.name,
            namespace: service.namespace,
            node: targetNode.label,
            resources: service.config.resources,
            reason,
          });
        } else {
          // Fallback to any node with capacity
          const fallbackNode = nodes.find(
            (n) =>
              n.totalCpu - n.allocatedCpu >= serviceCpu &&
              n.totalMemory - n.allocatedMemory >= serviceMemory,
          );

          if (fallbackNode) {
            fallbackNode.allocatedCpu += serviceCpu * service.config.replicas;
            fallbackNode.allocatedMemory += serviceMemory * service.config.replicas;

            placements.push({
              service: service.name,
              namespace: service.namespace,
              node: fallbackNode.label,
              resources: service.config.resources,
              reason: 'Fallback placement',
            });
          } else {
            logger.warn(`Cannot place ${service.name}: insufficient resources`);
          }
        }
      }

      if (options.json) {
        console.log(JSON.stringify({ nodes, placements }, null, 2));
        return;
      }

      // Display results
      console.log(tableService.deploymentSummaryTable(nodes, placements));

      // Resource utilization
      const totalCpu = nodes.reduce((sum, n) => sum + n.totalCpu, 0);
      const usedCpu = nodes.reduce((sum, n) => sum + n.allocatedCpu, 0);
      const totalMemory = nodes.reduce((sum, n) => sum + n.totalMemory, 0);
      const usedMemory = nodes.reduce((sum, n) => sum + n.allocatedMemory, 0);
      const totalStorage = servicesService.calculateTotalResources().storage;

      console.log(
        tableService.resourceSummary(totalCpu, usedCpu, totalMemory, usedMemory, totalStorage),
      );

      // Warnings
      if (inventoryValidation.warnings.length > 0 || servicesValidation.warnings.length > 0) {
        logger.newLine();
        logger.subHeader('Warnings');
        [...inventoryValidation.warnings, ...servicesValidation.warnings].forEach((w) => {
          logger.log(`  ${chalk.yellow('⚠')} ${w}`);
        });
      }

      logger.newLine();
      logger.success('Plan generated successfully');
      logger.info('Run `selfhost deploy` to start deployment');
    });

  return command;
}
