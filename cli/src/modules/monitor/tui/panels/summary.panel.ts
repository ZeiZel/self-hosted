import {
  ClusterSummary,
  createProgressBar,
  formatBytes,
  formatCpu,
} from '../../../../interfaces/monitor.interface';
import chalk from 'chalk';

/**
 * Render cluster summary panel
 */
export function renderSummaryPanel(summary: ClusterSummary, width: number = 35): string[] {
  const lines: string[] = [];
  const innerWidth = width - 4;

  lines.push(chalk.bold.cyan(' CLUSTER SUMMARY '));
  lines.push(chalk.gray('─'.repeat(innerWidth)));

  // Nodes
  const nodesLine = `  Nodes:    ${summary.nodes.total} total`;
  if (summary.nodes.critical > 0) {
    lines.push(nodesLine + chalk.red(` (${summary.nodes.critical} critical)`));
  } else if (summary.nodes.warning > 0) {
    lines.push(nodesLine + chalk.yellow(` (${summary.nodes.warning} warning)`));
  } else {
    lines.push(chalk.green(nodesLine + ' (all healthy)'));
  }

  // Pods
  const podsLine = `  Pods:     ${summary.pods.running}/${summary.pods.total} running`;
  if (summary.pods.failed > 0) {
    lines.push(podsLine + chalk.red(` (${summary.pods.failed} failed)`));
  } else if (summary.pods.pending > 0) {
    lines.push(podsLine + chalk.yellow(` (${summary.pods.pending} pending)`));
  } else {
    lines.push(chalk.green(podsLine));
  }

  lines.push('');

  // CPU
  const cpuBar = createProgressBar(summary.cpu.percent, 10);
  const cpuColor = getResourceColor(summary.cpu.percent);
  lines.push(`  CPU:      ${cpuColor(cpuBar)} ${summary.cpu.percent}%`);
  lines.push(
    chalk.gray(`            ${formatCpu(summary.cpu.used)}/${formatCpu(summary.cpu.total)} cores`),
  );

  // Memory
  const memBar = createProgressBar(summary.memory.percent, 10);
  const memColor = getResourceColor(summary.memory.percent);
  lines.push(`  Memory:   ${memColor(memBar)} ${summary.memory.percent}%`);
  lines.push(
    chalk.gray(
      `            ${formatBytes(summary.memory.used)}/${formatBytes(summary.memory.total)}`,
    ),
  );

  lines.push('');

  // Namespaces
  lines.push(chalk.gray(`  Namespaces: ${summary.namespaces}`));

  // Last updated
  const updatedTime = new Date(summary.lastUpdated).toLocaleTimeString();
  lines.push(chalk.gray(`  Updated: ${updatedTime}`));

  return lines;
}

/**
 * Render compact summary line
 */
export function renderCompactSummary(summary: ClusterSummary): string {
  const cpuBar = createProgressBar(summary.cpu.percent, 5);
  const memBar = createProgressBar(summary.memory.percent, 5);

  return (
    `CPU ${cpuBar} ${summary.cpu.percent}% | ` +
    `MEM ${memBar} ${summary.memory.percent}% | ` +
    `Pods ${summary.pods.running}/${summary.pods.total}`
  );
}

/**
 * Get color based on resource usage
 */
function getResourceColor(percent: number): (text: string) => string {
  if (percent >= 90) return chalk.red;
  if (percent >= 75) return chalk.yellow;
  return chalk.green;
}
