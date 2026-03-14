import { Injectable, Inject, forwardRef, OnModuleDestroy } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramConfigService } from './telegram-config.service';
import { ClusterClientService } from '../modules/monitor/cluster-client.service';
import { DaemonClientService } from '../daemon/daemon-client.service';
import type {
  TelegramUpdate,
  BotCommand,
  CommandResult,
} from './interfaces/telegram.interface';
import { parseBotCommand, escapeHtml } from './interfaces/telegram.interface';
import {
  handleStatusCommand,
  handleResourcesCommand,
  handleRestartCommand,
  handleConfirmCommand,
  handleRestartCallback,
  handleSettingsCommand,
  handleSetCommand,
  cleanupExpiredConfirmations,
} from './handlers';

/**
 * Telegram bot service for handling commands via long-polling
 */
@Injectable()
export class TelegramBotService implements OnModuleDestroy {
  private running = false;
  private pollingAbortController: AbortController | null = null;
  private lastUpdateId = 0;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(TelegramService)
    private readonly telegram: TelegramService,
    @Inject(TelegramConfigService)
    private readonly configService: TelegramConfigService,
    @Inject(forwardRef(() => ClusterClientService))
    private readonly clusterClient: ClusterClientService,
    @Inject(forwardRef(() => DaemonClientService))
    private readonly daemonClient: DaemonClientService,
  ) {}

  /**
   * Clean up on module destroy
   */
  onModuleDestroy(): void {
    this.stop();
  }

  /**
   * Start the bot polling loop
   */
  async start(): Promise<void> {
    const config = this.configService.getConfig();
    if (!config || !config.enabled) {
      console.log('[Telegram] Bot not configured or disabled');
      return;
    }

    if (this.running) {
      console.log('[Telegram] Bot already running');
      return;
    }

    this.telegram.setToken(config.token);
    this.running = true;
    this.pollingAbortController = new AbortController();

    // Start cleanup interval for expired confirmations
    this.cleanupInterval = setInterval(() => {
      cleanupExpiredConfirmations();
    }, 30000);

    console.log('[Telegram] Starting bot polling...');

    // Run polling loop
    this.pollLoop();
  }

  /**
   * Stop the bot polling loop
   */
  stop(): void {
    const wasRunning = this.running;
    this.running = false;

    if (this.pollingAbortController) {
      this.pollingAbortController.abort();
      this.pollingAbortController = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Only log if bot was actually running
    if (wasRunning) {
      console.log('[Telegram] Bot stopped');
    }
  }

  /**
   * Check if bot is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Main polling loop
   */
  private async pollLoop(): Promise<void> {
    while (this.running) {
      try {
        const updates = await this.telegram.getUpdates(
          this.lastUpdateId > 0 ? this.lastUpdateId + 1 : undefined,
          30,
          ['message', 'callback_query'],
        );

        for (const update of updates) {
          this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);
          await this.handleUpdate(update);
        }
      } catch (error) {
        if (this.running) {
          console.error('[Telegram] Polling error:', error);
          // Wait before retrying
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }
    }
  }

  /**
   * Handle a single update
   */
  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    try {
      // Handle callback queries (inline keyboard buttons)
      if (update.callback_query) {
        await this.handleCallbackQuery(update);
        return;
      }

      // Handle messages
      if (update.message) {
        const command = parseBotCommand(update.message);
        if (command) {
          await this.handleCommand(command);
        }
      }
    } catch (error) {
      console.error('[Telegram] Error handling update:', error);
    }
  }

  /**
   * Handle callback query from inline keyboard
   */
  private async handleCallbackQuery(update: TelegramUpdate): Promise<void> {
    const query = update.callback_query!;
    const chatId = String(query.message?.chat.id || query.from.id);
    const data = query.data || '';

    // Acknowledge the callback
    await this.telegram.answerCallbackQuery(query.id);

    let result: CommandResult;

    if (data.startsWith('confirm_restart:') || data === 'cancel_restart') {
      result = await handleRestartCallback(
        chatId,
        data,
        (service) => this.executeRestart(service),
      );
    } else {
      result = {
        text: '⚠️ Unknown action',
        parseMode: 'HTML',
      };
    }

    // Edit the original message
    if (query.message) {
      try {
        await this.telegram.editMessageText(
          chatId,
          query.message.message_id,
          result.text,
          result.parseMode,
        );
      } catch {
        // Message might have been deleted
        await this.telegram.sendText(chatId, result.text, result.parseMode);
      }
    }
  }

  /**
   * Handle a bot command
   */
  private async handleCommand(command: BotCommand): Promise<void> {
    const chatId = String(command.message.chat.id);
    const config = this.configService.getConfig();

    // Verify chat ID matches configured chat
    if (config && config.chatId !== chatId) {
      console.log(`[Telegram] Ignoring command from unauthorized chat: ${chatId}`);
      await this.telegram.sendText(
        chatId,
        '⚠️ <b>Unauthorized</b>\n\nThis bot is configured for a different chat.',
        'HTML',
      );
      return;
    }

    let result: CommandResult;

    switch (command.command) {
      case 'start':
      case 'help':
        result = this.handleHelpCommand();
        break;

      case 'status':
        result = await handleStatusCommand(
          command,
          () => this.clusterClient.getClusterSummary(),
          () => this.daemonClient.getRecentAlerts(60, 5),
        );
        break;

      case 'resources':
        result = await handleResourcesCommand(
          command,
          () => this.clusterClient.getNodeMetrics(),
        );
        break;

      case 'restart':
        result = await handleRestartCommand(command);
        break;

      case 'confirm':
        result = await handleConfirmCommand(
          command,
          (service) => this.executeRestart(service),
        );
        break;

      case 'settings':
        result = await handleSettingsCommand(
          command,
          () => this.configService.getConfig(),
        );
        break;

      case 'set':
        result = await handleSetCommand(
          command,
          () => this.configService.getConfig(),
          (updates) => this.configService.updateConfig(updates),
        );
        break;

      default:
        result = {
          text: `⚠️ Unknown command: <code>/${escapeHtml(command.command)}</code>\n\nUse /help for available commands.`,
          parseMode: 'HTML',
        };
    }

    // Send response
    await this.telegram.sendMessage({
      chat_id: chatId,
      text: result.text,
      parse_mode: result.parseMode,
      reply_markup: result.replyMarkup,
    });
  }

  /**
   * Handle /help command
   */
  private handleHelpCommand(): CommandResult {
    return {
      text:
        '🤖 <b>Selfhost Bot</b>\n\n' +
        '<b>Commands:</b>\n' +
        '/status - Cluster health summary\n' +
        '/resources - Resource usage by node\n' +
        '/restart &lt;service&gt; - Restart a service\n' +
        '/settings - View alert settings\n' +
        '/set &lt;option&gt; &lt;value&gt; - Change settings\n' +
        '/help - Show this help\n\n' +
        '<b>Settings:</b>\n' +
        '<code>/set critical on|off</code>\n' +
        '<code>/set degraded on|off</code>\n' +
        '<code>/set ratelimit &lt;seconds&gt;</code>',
      parseMode: 'HTML',
    };
  }

  /**
   * Execute service restart via kubectl
   */
  private async executeRestart(service: string, namespace?: string): Promise<void> {
    const { spawn } = await import('child_process');

    return new Promise((resolve, reject) => {
      // Find the deployment/statefulset/daemonset
      const nsArg = namespace ? ['-n', namespace] : ['-A'];

      const proc = spawn('kubectl', ['rollout', 'restart', 'deployment', service, ...nsArg]);

      let stderr = '';

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(stderr || `kubectl exited with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }
}
