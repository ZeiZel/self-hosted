import type { CommandResult, BotCommand, TelegramConfig } from '../interfaces/telegram.interface';
import { escapeHtml } from '../interfaces/telegram.interface';

/**
 * Handle /settings command
 * Shows current alert settings
 */
export async function handleSettingsCommand(
  _command: BotCommand,
  getConfig: () => TelegramConfig | null,
): Promise<CommandResult> {
  const config = getConfig();

  if (!config) {
    return {
      text: '⚠️ <b>Not Configured</b>\n\nTelegram bot is not configured.\n\nRun <code>selfhost bot init</code> to set up.',
      parseMode: 'HTML',
    };
  }

  let text = '⚙️ <b>Alert Settings</b>\n\n';

  // Status
  const statusIcon = config.enabled ? '🟢' : '🔴';
  const statusText = config.enabled ? 'Enabled' : 'Disabled';
  text += `<b>Status:</b> ${statusIcon} ${statusText}\n\n`;

  // Alert types
  text += '<b>Alert Types</b>\n';
  text += `  Critical: ${config.alertOnCritical ? '✅' : '❌'}\n`;
  text += `  Degraded: ${config.alertOnDegraded ? '✅' : '❌'}\n\n`;

  // Rate limiting
  text += '<b>Rate Limiting</b>\n';
  text += `  Minimum interval: ${config.rateLimitSeconds}s\n`;

  if (config.lastAlertAt) {
    const lastAlert = new Date(config.lastAlertAt);
    const ago = formatTimeAgo(Date.now() - lastAlert.getTime());
    text += `  Last alert: ${ago}\n`;
  }

  // Commands help
  text += '\n<b>Commands</b>\n';
  text += '<code>/set interval &lt;seconds&gt;</code> - Set check interval\n';
  text += '<code>/set critical &lt;on|off&gt;</code> - Toggle critical alerts\n';
  text += '<code>/set degraded &lt;on|off&gt;</code> - Toggle degraded alerts\n';
  text += '<code>/set ratelimit &lt;seconds&gt;</code> - Set rate limit\n';

  return { text, parseMode: 'HTML' };
}

/**
 * Handle /set command for changing settings
 */
export async function handleSetCommand(
  command: BotCommand,
  getConfig: () => TelegramConfig | null,
  updateConfig: (updates: Partial<TelegramConfig>) => void,
): Promise<CommandResult> {
  const config = getConfig();

  if (!config) {
    return {
      text: '⚠️ <b>Not Configured</b>\n\nTelegram bot is not configured.',
      parseMode: 'HTML',
    };
  }

  if (command.args.length < 2) {
    return {
      text: '⚠️ <b>Usage</b>\n\n' +
        '<code>/set interval &lt;seconds&gt;</code>\n' +
        '<code>/set critical &lt;on|off&gt;</code>\n' +
        '<code>/set degraded &lt;on|off&gt;</code>\n' +
        '<code>/set ratelimit &lt;seconds&gt;</code>',
      parseMode: 'HTML',
    };
  }

  const setting = command.args[0].toLowerCase();
  const value = command.args[1].toLowerCase();

  try {
    switch (setting) {
      case 'interval': {
        const seconds = parseInt(value, 10);
        if (isNaN(seconds) || seconds < 10 || seconds > 3600) {
          return {
            text: '⚠️ Interval must be between 10 and 3600 seconds.',
            parseMode: 'HTML',
          };
        }
        // Note: This would update daemon config, not telegram config
        // For now, just acknowledge
        return {
          text: `✅ Check interval would be set to ${seconds}s.\n\n<i>Note: This setting is managed via the daemon. Use <code>selfhost daemon init -i ${seconds}</code></i>`,
          parseMode: 'HTML',
        };
      }

      case 'critical': {
        const enabled = value === 'on' || value === 'true' || value === '1' || value === 'yes';
        const disabled = value === 'off' || value === 'false' || value === '0' || value === 'no';

        if (!enabled && !disabled) {
          return {
            text: '⚠️ Value must be <code>on</code> or <code>off</code>.',
            parseMode: 'HTML',
          };
        }

        updateConfig({ alertOnCritical: enabled });

        return {
          text: `✅ Critical alerts ${enabled ? 'enabled' : 'disabled'}.`,
          parseMode: 'HTML',
        };
      }

      case 'degraded': {
        const enabled = value === 'on' || value === 'true' || value === '1' || value === 'yes';
        const disabled = value === 'off' || value === 'false' || value === '0' || value === 'no';

        if (!enabled && !disabled) {
          return {
            text: '⚠️ Value must be <code>on</code> or <code>off</code>.',
            parseMode: 'HTML',
          };
        }

        updateConfig({ alertOnDegraded: enabled });

        return {
          text: `✅ Degraded alerts ${enabled ? 'enabled' : 'disabled'}.`,
          parseMode: 'HTML',
        };
      }

      case 'ratelimit': {
        const seconds = parseInt(value, 10);
        if (isNaN(seconds) || seconds < 0 || seconds > 3600) {
          return {
            text: '⚠️ Rate limit must be between 0 and 3600 seconds.',
            parseMode: 'HTML',
          };
        }

        updateConfig({ rateLimitSeconds: seconds });

        return {
          text: `✅ Rate limit set to ${seconds}s.`,
          parseMode: 'HTML',
        };
      }

      default:
        return {
          text: `⚠️ Unknown setting: <code>${escapeHtml(setting)}</code>\n\nAvailable: interval, critical, degraded, ratelimit`,
          parseMode: 'HTML',
        };
    }
  } catch (error) {
    return {
      text: `❌ <b>Error</b>\n\n<code>${escapeHtml(error instanceof Error ? error.message : String(error))}</code>`,
      parseMode: 'HTML',
    };
  }
}

/**
 * Format time ago
 */
function formatTimeAgo(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}
