import { Injectable } from '@nestjs/common';
import Table from 'cli-table3';
import chalk from 'chalk';
import { Machine, MachineRole } from '../../interfaces/machine.interface';
import { Service, ServiceNamespace } from '../../interfaces/service.interface';
import { formatBytes, formatCpu } from '../../utils/validation';

@Injectable()
export class TableService {
  /**
   * Create machines table
   */
  machinesTable(machines: Machine[]): string {
    const table = new Table({
      head: [
        chalk.cyan('Label'),
        chalk.cyan('IP'),
        chalk.cyan('Roles'),
        chalk.cyan('Status'),
        chalk.cyan('Resources'),
      ],
      style: { head: [], border: [] },
    });

    for (const machine of machines) {
      const roles = machine.roles.map((r) => this.formatRole(r)).join(', ');
      const status = this.formatStatus(machine.status);
      const resources = machine.facts
        ? `${machine.facts.cpuCores} CPU / ${formatBytes(machine.facts.memoryTotal)}`
        : chalk.gray('Unknown');

      table.push([machine.label, machine.ip, roles, status, resources]);
    }

    return table.toString();
  }

  /**
   * Create services table
   */
  servicesTable(services: Service[]): string {
    const table = new Table({
      head: [
        chalk.cyan('Service'),
        chalk.cyan('Namespace'),
        chalk.cyan('Enabled'),
        chalk.cyan('Resources'),
        chalk.cyan('Tier'),
      ],
      style: { head: [], border: [] },
    });

    for (const service of services) {
      const enabled = service.config.enabled ? chalk.green('✔') : chalk.gray('✖');
      const resources = `${service.config.resources.memory} / ${service.config.resources.cpu}`;
      const tier = this.formatTier(service.tier);

      table.push([service.name, this.formatNamespace(service.namespace), enabled, resources, tier]);
    }

    return table.toString();
  }

  /**
   * Create deployment summary table
   */
  deploymentSummaryTable(
    nodes: {
      label: string;
      ip: string;
      roles: MachineRole[];
      totalCpu: number;
      totalMemory: number;
      allocatedCpu: number;
      allocatedMemory: number;
    }[],
    services: {
      service: string;
      namespace: string;
      node: string;
      resources: { cpu: string; memory: string };
    }[],
  ): string {
    let output = '';

    // Infrastructure section
    output += chalk.bold.white('\nINFRASTRUCTURE\n');
    output += chalk.gray('─'.repeat(80) + '\n');

    const nodesTable = new Table({
      head: [
        chalk.cyan('Node'),
        chalk.cyan('IP'),
        chalk.cyan('Roles'),
        chalk.cyan('Resources'),
        chalk.cyan('Allocated'),
      ],
      style: { head: [], border: [] },
    });

    for (const node of nodes) {
      const roles = node.roles.map((r) => this.formatRole(r)).join(', ');
      const total = `${formatCpu(node.totalCpu)} / ${formatBytes(node.totalMemory)}`;
      const allocated = `${formatCpu(node.allocatedCpu)} / ${formatBytes(node.allocatedMemory)}`;
      nodesTable.push([node.label, node.ip, roles, total, allocated]);
    }

    output += nodesTable.toString() + '\n';

    // Services section
    output += chalk.bold.white('\nSERVICES\n');
    output += chalk.gray('─'.repeat(80) + '\n');

    const servicesTable = new Table({
      head: [
        chalk.cyan('Service'),
        chalk.cyan('Namespace'),
        chalk.cyan('Node'),
        chalk.cyan('Resources'),
      ],
      style: { head: [], border: [] },
    });

    for (const svc of services) {
      servicesTable.push([
        svc.service,
        this.formatNamespace(svc.namespace as ServiceNamespace),
        svc.node,
        `${svc.resources.memory} / ${svc.resources.cpu}`,
      ]);
    }

    output += servicesTable.toString();

    return output;
  }

  /**
   * Create resource summary
   */
  resourceSummary(
    totalCpu: number,
    usedCpu: number,
    totalMemory: number,
    usedMemory: number,
    totalStorage: number,
  ): string {
    const cpuPercent = Math.round((usedCpu / totalCpu) * 100);
    const memPercent = Math.round((usedMemory / totalMemory) * 100);

    let output = chalk.bold.white('\nRESOURCE UTILIZATION\n');
    output += chalk.gray('─'.repeat(60) + '\n');
    output += `  CPU:     ${this.progressBar(cpuPercent)} ${formatCpu(usedCpu)} / ${formatCpu(totalCpu)}\n`;
    output += `  Memory:  ${this.progressBar(memPercent)} ${formatBytes(usedMemory)} / ${formatBytes(totalMemory)}\n`;
    output += `  Storage: ${formatBytes(totalStorage)} requested\n`;

    return output;
  }

  /**
   * Progress bar
   */
  private progressBar(percent: number, width = 20): string {
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;

    let color = chalk.green;
    if (percent > 80) color = chalk.red;
    else if (percent > 60) color = chalk.yellow;

    return color('█'.repeat(filled)) + chalk.gray('░'.repeat(empty)) + ` ${percent}%`;
  }

  /**
   * Format role with color
   */
  private formatRole(role: MachineRole): string {
    const colors: Record<MachineRole, (s: string) => string> = {
      [MachineRole.MASTER]: chalk.cyan,
      [MachineRole.WORKER]: chalk.green,
      [MachineRole.GATEWAY]: chalk.yellow,
      [MachineRole.STORAGE]: chalk.magenta,
      [MachineRole.BACKUPS]: chalk.gray,
    };
    return colors[role](role);
  }

  /**
   * Format status with color
   */
  private formatStatus(status: string): string {
    const colors: Record<string, (s: string) => string> = {
      online: chalk.green,
      offline: chalk.red,
      error: chalk.red,
      unknown: chalk.gray,
    };
    return (colors[status] ?? chalk.gray)(status);
  }

  /**
   * Format tier with color
   */
  private formatTier(tier: string): string {
    const colors: Record<string, (s: string) => string> = {
      heavy: chalk.red,
      medium: chalk.yellow,
      light: chalk.green,
    };
    return (colors[tier] ?? chalk.gray)(tier);
  }

  /**
   * Format namespace with color
   */
  private formatNamespace(namespace: ServiceNamespace): string {
    const colors: Record<ServiceNamespace, (s: string) => string> = {
      [ServiceNamespace.INGRESS]: chalk.yellow,
      [ServiceNamespace.SERVICE]: chalk.cyan,
      [ServiceNamespace.DB]: chalk.magenta,
      [ServiceNamespace.CODE]: chalk.blue,
      [ServiceNamespace.PRODUCTIVITY]: chalk.green,
      [ServiceNamespace.SOCIAL]: chalk.red,
      [ServiceNamespace.DATA]: chalk.white,
      [ServiceNamespace.INFRASTRUCTURE]: chalk.gray,
      [ServiceNamespace.AUTOMATION]: chalk.yellow,
      [ServiceNamespace.CONTENT]: chalk.cyan,
      [ServiceNamespace.UTILITIES]: chalk.gray,
    };
    return (colors[namespace] ?? chalk.gray)(namespace);
  }
}
