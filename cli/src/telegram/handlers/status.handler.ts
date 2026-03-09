import type { CommandResult, BotCommand } from '../interfaces/telegram.interface';
import type { ClusterSummary } from '../../interfaces/monitor.interface';
import type { DaemonHealthLog } from '../../daemon/interfaces/daemon.interface';
import { escapeHtml } from '../interfaces/telegram.interface';

/**
 * Handle /status command
 * Shows cluster health summary
 */
export async function handleStatusCommand(
  _command: BotCommand,
  getSummary: () => Promise<ClusterSummary>,
  getRecentAlerts: () => DaemonHealthLog[],
): Promise<CommandResult> {
  try {
    const summary = await getSummary();
    const alerts = getRecentAlerts();

    let text = '📊 <b>Cluster Status</b>\n\n';

    // Nodes section
    text += '<b>Nodes</b>\n';
    const nodeIcon =
      summary.nodes.critical > 0 ? '🔴' : summary.nodes.warning > 0 ? '🟡' : '🟢';
    text += `${nodeIcon} ${summary.nodes.total} nodes`;

    if (summary.nodes.healthy > 0) {
      text += ` (${summary.nodes.healthy} healthy`;
      if (summary.nodes.warning > 0) text += `, ${summary.nodes.warning} warning`;
      if (summary.nodes.critical > 0) text += `, ${summary.nodes.critical} critical`;
      text += ')';
    }
    text += '\n\n';

    // Pods section
    text += '<b>Pods</b>\n';
    const podIcon =
      summary.pods.failed > 0 ? '🔴' : summary.pods.pending > 0 ? '🟡' : '🟢';
    text += `${podIcon} ${summary.pods.running}/${summary.pods.total} running`;

    if (summary.pods.pending > 0) {
      text += ` (${summary.pods.pending} pending)`;
    }
    if (summary.pods.failed > 0) {
      text += ` (${summary.pods.failed} failed)`;
    }
    text += '\n\n';

    // Resources section
    text += '<b>Resources</b>\n';
    const cpuBar = createProgressBar(summary.cpu.percent);
    const memBar = createProgressBar(summary.memory.percent);

    text += `CPU:    ${cpuBar} ${summary.cpu.percent}%\n`;
    text += `Memory: ${memBar} ${summary.memory.percent}%\n\n`;

    // Recent alerts
    if (alerts.length > 0) {
      text += '<b>Recent Alerts</b>\n';
      const recentAlerts = alerts.slice(0, 5);

      for (const alert of recentAlerts) {
        const icon =
          alert.status === 'critical' ? '🔴' : alert.status === 'degraded' ? '🟡' : '🟢';
        text += `${icon} ${escapeHtml(alert.target)}\n`;
      }
    } else {
      text += '✅ No recent alerts';
    }

    const timestamp = new Date(summary.lastUpdated).toLocaleTimeString();
    text += `\n\n<i>Updated: ${timestamp}</i>`;

    return { text, parseMode: 'HTML' };
  } catch (error) {
    return {
      text: `❌ <b>Error</b>\n\nFailed to get cluster status:\n<code>${escapeHtml(error instanceof Error ? error.message : String(error))}</code>`,
      parseMode: 'HTML',
    };
  }
}

/**
 * Create a text-based progress bar
 */
function createProgressBar(percent: number, width: number = 10): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}
