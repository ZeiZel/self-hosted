import type { CommandResult, BotCommand } from '../interfaces/telegram.interface';
import type { NodeMetrics } from '../../interfaces/monitor.interface';
import { escapeHtml } from '../interfaces/telegram.interface';
import { formatBytes, formatCpu } from '../../interfaces/monitor.interface';

/**
 * Handle /resources command
 * Shows resource usage by node
 */
export async function handleResourcesCommand(
  _command: BotCommand,
  getNodeMetrics: () => Promise<NodeMetrics[]>,
): Promise<CommandResult> {
  try {
    const nodes = await getNodeMetrics();

    if (nodes.length === 0) {
      return {
        text: '⚠️ <b>No nodes found</b>\n\nCould not retrieve node information.',
        parseMode: 'HTML',
      };
    }

    let text = '📈 <b>Resource Usage</b>\n\n';

    for (const node of nodes) {
      const healthIcon =
        node.health === 'healthy' ? '🟢' : node.health === 'warning' ? '🟡' : '🔴';

      text += `${healthIcon} <b>${escapeHtml(node.name)}</b>`;

      if (node.roles.length > 0) {
        text += ` <i>(${node.roles.join(', ')})</i>`;
      }
      text += '\n';

      // CPU usage
      const cpuBar = createProgressBar(node.cpu.percent);
      text += `  CPU:    ${cpuBar} ${node.cpu.percent}%`;
      text += ` (${formatCpu(node.cpu.used)}/${formatCpu(node.cpu.total)})\n`;

      // Memory usage
      const memBar = createProgressBar(node.memory.percent);
      text += `  Memory: ${memBar} ${node.memory.percent}%`;
      text += ` (${formatBytes(node.memory.used)}/${formatBytes(node.memory.total)})\n`;

      // Pod count
      text += `  Pods:   ${node.pods.running}/${node.pods.total} running`;

      if (node.pods.pending > 0) {
        text += `, ${node.pods.pending} pending`;
      }
      if (node.pods.failed > 0) {
        text += `, ${node.pods.failed} failed`;
      }
      text += '\n\n';
    }

    // Add summary
    const totalCpu = nodes.reduce((sum, n) => sum + n.cpu.total, 0);
    const usedCpu = nodes.reduce((sum, n) => sum + n.cpu.used, 0);
    const totalMem = nodes.reduce((sum, n) => sum + n.memory.total, 0);
    const usedMem = nodes.reduce((sum, n) => sum + n.memory.used, 0);

    text += '<b>Cluster Totals</b>\n';
    text += `  CPU:    ${formatCpu(usedCpu)}/${formatCpu(totalCpu)} (${Math.round((usedCpu / totalCpu) * 100)}%)\n`;
    text += `  Memory: ${formatBytes(usedMem)}/${formatBytes(totalMem)} (${Math.round((usedMem / totalMem) * 100)}%)`;

    return { text, parseMode: 'HTML' };
  } catch (error) {
    return {
      text: `❌ <b>Error</b>\n\nFailed to get resource metrics:\n<code>${escapeHtml(error instanceof Error ? error.message : String(error))}</code>`,
      parseMode: 'HTML',
    };
  }
}

/**
 * Create a text-based progress bar
 */
function createProgressBar(percent: number, width: number = 8): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}
