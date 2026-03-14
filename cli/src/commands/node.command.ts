import { Command } from 'commander';
import { INestApplicationContext } from '@nestjs/common';
import chalk from 'chalk';
import { InventoryService } from '../modules/inventory/inventory.service';
import { ClusterClientService } from '../modules/monitor/cluster-client.service';
import { NodeService } from '../modules/node/node.service';
import { PromptsService } from '../modules/ui/prompts.service';
import { logger } from '../utils/logger';
import { MachineRole } from '../interfaces/machine.interface';

/**
 * Create the node command and subcommands
 */
export function createNodeCommand(app: INestApplicationContext): Command {
  const command = new Command('node');

  command
    .description('Manage cluster nodes')
    .addCommand(createNodeListCommand(app))
    .addCommand(createNodeAddCommand(app))
    .addCommand(createNodeRemoveCommand(app))
    .addCommand(createNodeDrainCommand(app))
    .addCommand(createNodeCordonCommand(app));

  return command;
}

/**
 * List nodes in the cluster
 */
function createNodeListCommand(app: INestApplicationContext): Command {
  const command = new Command('list');

  command
    .description('List cluster nodes')
    .option('-o, --output <format>', 'Output format: table, json', 'table')
    .action(async (options) => {
      const clusterClient = app.get(ClusterClientService);

      try {
        const nodes = await clusterClient.getNodeMetrics();

        if (options.output === 'json') {
          console.log(JSON.stringify(nodes, null, 2));
          return;
        }

        if (nodes.length === 0) {
          logger.warn('No nodes found in cluster');
          return;
        }

        logger.header('Cluster Nodes');

        for (const node of nodes) {
          const healthColor =
            node.health === 'healthy' ? 'green' :
            node.health === 'warning' ? 'yellow' : 'red';

          const roleStr = node.roles.includes(MachineRole.MASTER)
            ? chalk.cyan('[master]')
            : chalk.gray('[worker]');

          console.log();
          console.log(
            `${chalk[healthColor]('●')} ${chalk.bold(node.name)} ${roleStr}`,
          );
          console.log(`  IP: ${node.ip}`);
          console.log(`  CPU: ${node.cpu.percent}% (${node.cpu.used}m / ${node.cpu.total}m)`);
          console.log(`  Memory: ${node.memory.percent}% (${formatBytes(node.memory.used)} / ${formatBytes(node.memory.total)})`);
          console.log(`  Pods: ${node.pods.running}/${node.pods.total} (${node.pods.failed} failed)`);
        }

        console.log();
        logger.info(`Total: ${nodes.length} nodes`);
      } catch (err) {
        logger.error('Failed to list nodes:', err);
        process.exit(1);
      }
    });

  return command;
}

/**
 * Add a new node to the cluster
 */
function createNodeAddCommand(app: INestApplicationContext): Command {
  const command = new Command('add');

  command
    .description('Add a new node to the cluster')
    .argument('<hostname>', 'Hostname or IP of the new node')
    .option('-r, --role <role>', 'Node role: worker, master', 'worker')
    .option('-u, --user <user>', 'SSH user for connection', 'root')
    .option('-p, --port <port>', 'SSH port', '22')
    .option('--ssh-key <path>', 'Path to SSH private key')
    .option('--labels <labels>', 'Node labels (key=value,key=value)')
    .option('--taints <taints>', 'Node taints (key=value:effect)')
    .option('--dry-run', 'Show what would be done without making changes')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (hostname, options) => {
      const inventoryService = app.get(InventoryService);
      const nodeService = app.get(NodeService);
      const prompts = app.get(PromptsService);

      logger.header('Add Node');
      logger.info(`Adding node: ${chalk.bold(hostname)}`);

      // Parse labels and taints
      const labels: Record<string, string> = {};
      if (options.labels) {
        for (const pair of options.labels.split(',')) {
          const [key, value] = pair.split('=');
          if (key && value) labels[key] = value;
        }
      }

      const taints: string[] = options.taints ? options.taints.split(',') : [];

      // Show plan
      logger.keyValue({
        Hostname: hostname,
        Role: options.role,
        'SSH User': options.user,
        'SSH Port': options.port,
        'SSH Key': options.sshKey || '(default)',
        Labels: Object.keys(labels).length > 0 ? JSON.stringify(labels) : '(none)',
        Taints: taints.length > 0 ? taints.join(', ') : '(none)',
      });
      console.log();

      // Dry run mode
      if (options.dryRun) {
        logger.info('[DRY RUN] Would perform the following steps:');
        logger.info('1. Test SSH connectivity');
        logger.info('2. Add node to Ansible inventory');
        logger.info('3. Run Kubespray scale playbook');
        logger.info('4. Apply labels and taints');
        logger.info('5. Verify node is Ready');
        return;
      }

      // Confirm
      if (!options.yes) {
        const confirmed = await prompts.confirm(
          `Add node ${hostname} as ${options.role}?`,
        );
        if (!confirmed) {
          logger.info('Cancelled');
          return;
        }
      }

      try {
        // Validate SSH connectivity
        logger.info('Testing SSH connectivity...');
        const sshValid = await nodeService.testSshConnection({
          hostname,
          user: options.user,
          port: parseInt(options.port, 10),
          keyPath: options.sshKey,
        });

        if (!sshValid.success) {
          logger.error(`SSH connection failed: ${sshValid.error}`);
          process.exit(1);
        }
        logger.success('SSH connection successful');

        // Add to inventory
        logger.info('Adding to Ansible inventory...');
        await nodeService.addToInventory({
          hostname,
          role: options.role === 'master' ? MachineRole.MASTER : MachineRole.WORKER,
          user: options.user,
          port: parseInt(options.port, 10),
          sshKeyPath: options.sshKey,
        });
        logger.success('Added to inventory');

        // Run Kubespray scale
        logger.info('Running Kubespray scale playbook...');
        const scaleResult = await nodeService.runKubesprayScale(hostname);
        if (!scaleResult.success) {
          logger.error(`Kubespray scale failed: ${scaleResult.error}`);
          process.exit(1);
        }
        logger.success('Kubespray scale completed');

        // Apply labels and taints
        if (Object.keys(labels).length > 0 || taints.length > 0) {
          logger.info('Applying labels and taints...');
          await nodeService.applyNodeConfig(hostname, { labels, taints });
          logger.success('Labels and taints applied');
        }

        // Verify node status
        logger.info('Verifying node status...');
        const status = await nodeService.waitForNodeReady(hostname, 300);
        if (!status.ready) {
          logger.error(`Node not ready after timeout: ${status.error}`);
          process.exit(1);
        }

        logger.success(`Node ${hostname} successfully added to the cluster`);
      } catch (err) {
        logger.error('Failed to add node:', err);
        process.exit(1);
      }
    });

  return command;
}

/**
 * Remove a node from the cluster
 */
function createNodeRemoveCommand(app: INestApplicationContext): Command {
  const command = new Command('remove');

  command
    .description('Remove a node from the cluster')
    .argument('<nodename>', 'Name of the node to remove')
    .option('--force', 'Force removal without draining')
    .option('--delete-local-data', 'Delete local data when draining')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (nodename, options) => {
      const nodeService = app.get(NodeService);
      const prompts = app.get(PromptsService);

      logger.header('Remove Node');
      logger.warn(`Removing node: ${chalk.bold(nodename)}`);

      if (!options.yes) {
        const confirmed = await prompts.confirm(
          `Are you sure you want to remove node ${nodename}? This action cannot be undone.`,
        );
        if (!confirmed) {
          logger.info('Cancelled');
          return;
        }
      }

      try {
        // Drain node first (unless forced)
        if (!options.force) {
          logger.info('Draining node...');
          const drainResult = await nodeService.drainNode(nodename, {
            deleteLocalData: options.deleteLocalData,
            force: false,
            gracePeriod: 60,
          });
          if (!drainResult.success) {
            logger.error(`Failed to drain node: ${drainResult.error}`);
            logger.info('Use --force to skip draining');
            process.exit(1);
          }
          logger.success('Node drained');
        }

        // Delete from Kubernetes
        logger.info('Deleting node from cluster...');
        await nodeService.deleteNode(nodename);
        logger.success('Node deleted from cluster');

        // Remove from inventory
        logger.info('Removing from Ansible inventory...');
        await nodeService.removeFromInventory(nodename);
        logger.success('Removed from inventory');

        logger.success(`Node ${nodename} successfully removed`);
      } catch (err) {
        logger.error('Failed to remove node:', err);
        process.exit(1);
      }
    });

  return command;
}

/**
 * Drain a node
 */
function createNodeDrainCommand(app: INestApplicationContext): Command {
  const command = new Command('drain');

  command
    .description('Drain workloads from a node')
    .argument('<nodename>', 'Name of the node to drain')
    .option('--delete-local-data', 'Delete local data during drain')
    .option('--force', 'Continue even if there are pods not managed by ReplicaSet')
    .option('--grace-period <seconds>', 'Grace period for pod termination', '60')
    .action(async (nodename, options) => {
      const nodeService = app.get(NodeService);

      logger.header('Drain Node');
      logger.info(`Draining node: ${chalk.bold(nodename)}`);

      try {
        const result = await nodeService.drainNode(nodename, {
          deleteLocalData: options.deleteLocalData,
          force: options.force,
          gracePeriod: parseInt(options.gracePeriod, 10),
        });

        if (!result.success) {
          logger.error(`Failed to drain node: ${result.error}`);
          process.exit(1);
        }

        logger.success(`Node ${nodename} drained successfully`);
        logger.info('Workloads have been rescheduled to other nodes');
      } catch (err) {
        logger.error('Failed to drain node:', err);
        process.exit(1);
      }
    });

  return command;
}

/**
 * Cordon/uncordon a node
 */
function createNodeCordonCommand(app: INestApplicationContext): Command {
  const command = new Command('cordon');

  command
    .description('Mark node as unschedulable (or uncordon to reverse)')
    .argument('<nodename>', 'Name of the node')
    .option('--uncordon', 'Mark node as schedulable again')
    .action(async (nodename, options) => {
      const nodeService = app.get(NodeService);

      const action = options.uncordon ? 'Uncordon' : 'Cordon';
      logger.info(`${action}ing node: ${chalk.bold(nodename)}`);

      try {
        if (options.uncordon) {
          await nodeService.uncordonNode(nodename);
          logger.success(`Node ${nodename} is now schedulable`);
        } else {
          await nodeService.cordonNode(nodename);
          logger.success(`Node ${nodename} is now unschedulable`);
        }
      } catch (err) {
        logger.error(`Failed to ${action.toLowerCase()} node:`, err);
        process.exit(1);
      }
    });

  return command;
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'Ki', 'Mi', 'Gi', 'Ti'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))}${sizes[i]}`;
}
