import { Alert, AlertSeverity } from '../../../../interfaces/monitor.interface';
import chalk from 'chalk';

/**
 * Render alerts panel
 */
export function renderAlertsPanel(
  alerts: Alert[],
  selectedIndex: number = -1,
  width: number = 50,
): string[] {
  const lines: string[] = [];
  const innerWidth = width - 4;

  const criticalCount = alerts.filter((a) => a.severity === AlertSeverity.CRITICAL).length;
  const warningCount = alerts.filter((a) => a.severity === AlertSeverity.WARNING).length;

  let title = ' ALERTS ';
  if (criticalCount > 0) {
    title += chalk.red(`(${criticalCount} critical)`);
  } else if (warningCount > 0) {
    title += chalk.yellow(`(${warningCount} warning)`);
  } else {
    title += chalk.green('(all clear)');
  }

  lines.push(chalk.bold.cyan(title));
  lines.push(chalk.gray('─'.repeat(innerWidth)));

  if (alerts.length === 0) {
    lines.push(chalk.green('  ✓ No active alerts'));
    return lines;
  }

  // Sort by severity
  const sortedAlerts = [...alerts].sort((a, b) => {
    const severityOrder = {
      [AlertSeverity.CRITICAL]: 0,
      [AlertSeverity.WARNING]: 1,
      [AlertSeverity.INFO]: 2,
    };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  for (let i = 0; i < sortedAlerts.length; i++) {
    const alert = sortedAlerts[i];
    const isSelected = i === selectedIndex;
    const prefix = isSelected ? chalk.cyan('▶ ') : '  ';

    const icon = getSeverityIcon(alert.severity);
    const ackIcon = alert.acknowledged ? chalk.gray(' [ack]') : '';

    const line = `${prefix}${icon} ${truncate(alert.title, innerWidth - 10)}${ackIcon}`;
    lines.push(isSelected ? chalk.bold(line) : line);

    if (isSelected) {
      // Show details for selected alert
      lines.push(chalk.gray(`     ${alert.message}`));
      lines.push(chalk.gray(`     Source: ${alert.source}`));
      lines.push(chalk.gray(`     Time: ${formatTime(alert.timestamp)}`));
    }
  }

  return lines;
}

/**
 * Render compact alerts summary
 */
export function renderAlertsSummary(alerts: Alert[]): string {
  if (alerts.length === 0) {
    return chalk.green('Alerts: None');
  }

  const critical = alerts.filter((a) => a.severity === AlertSeverity.CRITICAL).length;
  const warning = alerts.filter((a) => a.severity === AlertSeverity.WARNING).length;
  const info = alerts.filter((a) => a.severity === AlertSeverity.INFO).length;

  const parts = [];
  if (critical > 0) parts.push(chalk.red(`${critical} critical`));
  if (warning > 0) parts.push(chalk.yellow(`${warning} warning`));
  if (info > 0) parts.push(chalk.blue(`${info} info`));

  return `Alerts: ${parts.join(', ')}`;
}

/**
 * Get severity icon
 */
function getSeverityIcon(severity: AlertSeverity): string {
  switch (severity) {
    case AlertSeverity.CRITICAL:
      return chalk.red('⚠');
    case AlertSeverity.WARNING:
      return chalk.yellow('⚠');
    case AlertSeverity.INFO:
      return chalk.blue('ℹ');
    default:
      return chalk.gray('○');
  }
}

/**
 * Format timestamp
 */
function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
}

/**
 * Truncate string
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}
