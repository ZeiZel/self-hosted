import {
  ServiceMetrics,
  PodStatus,
  formatBytes,
} from '../../../../interfaces/monitor.interface';
import chalk from 'chalk';

/**
 * Render services panel content
 */
export function renderServicesPanel(
  services: ServiceMetrics[],
  selectedIndex: number = -1,
  width: number = 60,
): string[] {
  const lines: string[] = [];
  const innerWidth = width - 4;

  lines.push(chalk.bold.cyan(' SERVICES ') + chalk.gray(' (↑↓ select, Enter: migrate)'));
  lines.push(chalk.gray('─'.repeat(innerWidth)));

  // Header
  lines.push(
    chalk.gray(
      '  ' +
      padRight('Name', 15) +
      padRight('Namespace', 12) +
      padRight('Node', 12) +
      padRight('Memory', 8) +
      'Status',
    ),
  );
  lines.push(chalk.gray('─'.repeat(innerWidth)));

  if (services.length === 0) {
    lines.push(chalk.gray('  No services found'));
    return lines;
  }

  for (let i = 0; i < services.length; i++) {
    const service = services[i];
    const isSelected = i === selectedIndex;
    const prefix = isSelected ? chalk.cyan('[▶]') : '   ';

    const statusIcon = getStatusIcon(service.status);
    const memoryStr = formatBytes(service.memory.requested);

    const line =
      prefix +
      padRight(truncate(service.name, 14), 15) +
      padRight(truncate(service.namespace, 11), 12) +
      padRight(truncate(service.node, 11), 12) +
      padRight(memoryStr, 8) +
      statusIcon;

    lines.push(isSelected ? chalk.bold(line) : line);
  }

  return lines;
}

/**
 * Render service details
 */
export function renderServiceDetails(service: ServiceMetrics): string[] {
  const lines: string[] = [];

  lines.push(chalk.bold.cyan(` ${service.name} `));
  lines.push(chalk.gray('─'.repeat(30)));
  lines.push(`  Namespace: ${service.namespace}`);
  lines.push(`  Node:      ${service.node}`);
  lines.push(`  Status:    ${getStatusIcon(service.status)} ${service.status}`);
  lines.push(`  Replicas:  ${service.replicas.ready}/${service.replicas.desired}`);
  lines.push(`  CPU:       ${service.cpu.requested}m requested`);
  lines.push(`  Memory:    ${formatBytes(service.memory.requested)} requested`);
  lines.push(`  Restarts:  ${formatRestarts(service.restarts)}`);
  lines.push(`  Age:       ${service.age}`);

  return lines;
}

/**
 * Get status icon with color
 */
function getStatusIcon(status: PodStatus): string {
  switch (status) {
    case PodStatus.RUNNING:
      return chalk.green('●');
    case PodStatus.SUCCEEDED:
      return chalk.green('✓');
    case PodStatus.PENDING:
      return chalk.yellow('◐');
    case PodStatus.FAILED:
      return chalk.red('✖');
    case PodStatus.CRASH_LOOP:
      return chalk.red('⟳');
    case PodStatus.IMAGE_PULL:
      return chalk.yellow('↓');
    case PodStatus.ERROR:
      return chalk.red('!');
    case PodStatus.TERMINATING:
      return chalk.gray('◌');
    default:
      return chalk.gray('?');
  }
}

/**
 * Format restart count
 */
function formatRestarts(count: number): string {
  if (count === 0) return chalk.green('0');
  if (count < 3) return chalk.yellow(String(count));
  return chalk.red(String(count));
}

/**
 * Pad string to right
 */
function padRight(str: string, len: number): string {
  return str.padEnd(len, ' ');
}

/**
 * Truncate string with ellipsis
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}
