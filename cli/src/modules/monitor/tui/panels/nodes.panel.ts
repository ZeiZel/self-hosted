import {
  NodeMetrics,
  NodeHealth,
  createProgressBar,
} from '../../../../interfaces/monitor.interface';
import chalk from 'chalk';

/**
 * Render nodes panel content
 */
export function renderNodesPanel(
  nodes: NodeMetrics[],
  selectedIndex: number = -1,
  width: number = 40,
): string[] {
  const lines: string[] = [];
  const innerWidth = width - 4; // Border padding

  lines.push(chalk.bold.cyan(' NODES '));
  lines.push(chalk.gray('─'.repeat(innerWidth)));

  if (nodes.length === 0) {
    lines.push(chalk.gray('  No nodes found'));
    return lines;
  }

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const isSelected = i === selectedIndex;
    const prefix = isSelected ? chalk.cyan('▶ ') : '  ';
    const healthIcon = getHealthIcon(node.health);

    // Node name line
    const nameLine = `${prefix}${healthIcon} ${node.name}`;
    lines.push(isSelected ? chalk.bold(nameLine) : nameLine);

    // CPU line
    const cpuBar = createProgressBar(node.cpu.percent, 10);
    const cpuColor = getProgressColor(node.cpu.percent);
    lines.push(`    CPU ${cpuColor(cpuBar)} ${node.cpu.percent}%`);

    // Memory line
    const memBar = createProgressBar(node.memory.percent, 10);
    const memColor = getProgressColor(node.memory.percent);
    lines.push(`    MEM ${memColor(memBar)} ${node.memory.percent}%`);

    // Pod counts
    const podLine = `    Pods: ${node.pods.running}/${node.pods.total}`;
    if (node.pods.failed > 0) {
      lines.push(podLine + chalk.red(` (${node.pods.failed} failed)`));
    } else if (node.pods.pending > 0) {
      lines.push(podLine + chalk.yellow(` (${node.pods.pending} pending)`));
    } else {
      lines.push(chalk.gray(podLine));
    }

    lines.push(''); // Spacing between nodes
  }

  return lines;
}

/**
 * Render compact nodes summary
 */
export function renderNodesSummary(nodes: NodeMetrics[]): string {
  const healthy = nodes.filter((n) => n.health === NodeHealth.HEALTHY).length;
  const warning = nodes.filter((n) => n.health === NodeHealth.WARNING).length;
  const critical = nodes.filter((n) => n.health === NodeHealth.CRITICAL).length;

  const parts = [];
  if (healthy > 0) parts.push(chalk.green(`${healthy} healthy`));
  if (warning > 0) parts.push(chalk.yellow(`${warning} warning`));
  if (critical > 0) parts.push(chalk.red(`${critical} critical`));

  return `Nodes: ${parts.join(', ') || 'none'}`;
}

/**
 * Get health icon
 */
function getHealthIcon(health: NodeHealth): string {
  switch (health) {
    case NodeHealth.HEALTHY:
      return chalk.green('●');
    case NodeHealth.WARNING:
      return chalk.yellow('●');
    case NodeHealth.CRITICAL:
      return chalk.red('●');
    default:
      return chalk.gray('○');
  }
}

/**
 * Get progress bar color based on percentage
 */
function getProgressColor(percent: number): (text: string) => string {
  if (percent >= 90) return chalk.red;
  if (percent >= 75) return chalk.yellow;
  return chalk.green;
}
