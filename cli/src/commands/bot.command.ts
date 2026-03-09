import { Command } from 'commander';
import { INestApplicationContext } from '@nestjs/common';
import chalk from 'chalk';
import { TelegramService } from '../telegram/telegram.service';
import { TelegramConfigService } from '../telegram/telegram-config.service';
import { isValidBotToken, DEFAULT_TELEGRAM_CONFIG } from '../telegram/interfaces/telegram.interface';
import { logger } from '../utils/logger';

export function createBotCommand(app: INestApplicationContext): Command {
  const command = new Command('bot');

  command.description('Telegram bot management for alerts and monitoring');

  // Init subcommand
  command.addCommand(createInitSubcommand(app));

  // Check subcommand
  command.addCommand(createCheckSubcommand(app));

  // Disable subcommand
  command.addCommand(createDisableSubcommand(app));

  // Enable subcommand
  command.addCommand(createEnableSubcommand(app));

  // Status subcommand (default)
  command.addCommand(createStatusSubcommand(app));

  // Default action shows status
  command.action(async () => {
    const configService = app.get(TelegramConfigService);
    const config = configService.getConfig();

    if (!config) {
      logger.info('Telegram bot is not configured.');
      logger.newLine();
      logger.log('To set up Telegram notifications, run:');
      logger.log(chalk.cyan('  selfhost bot init'));
      logger.newLine();
      logger.log('Available commands:');
      logger.log('  init     Set up Telegram bot for notifications');
      logger.log('  check    Test bot connectivity');
      logger.log('  status   Show current configuration');
      logger.log('  enable   Enable bot notifications');
      logger.log('  disable  Disable bot notifications');
      return;
    }

    await showStatus(configService);
  });

  return command;
}

/**
 * Init subcommand - interactive setup wizard
 */
function createInitSubcommand(app: INestApplicationContext): Command {
  return new Command('init')
    .description('Set up Telegram bot for notifications')
    .option('--token <token>', 'Bot token (skip interactive prompt)')
    .option('--chat-id <chatId>', 'Chat ID (skip interactive prompt)')
    .option('--force', 'Overwrite existing configuration')
    .action(async (options) => {
      const telegramService = app.get(TelegramService);
      const configService = app.get(TelegramConfigService);

      // Check if already configured
      const existing = configService.getConfig();
      if (existing && !options.force) {
        logger.warn('Telegram bot is already configured.');
        logger.log('Use --force to overwrite existing configuration.');
        return;
      }

      logger.header('Telegram Bot Setup');
      logger.newLine();

      let token = options.token;
      let chatId = options.chatId;

      // Step 1: Get bot token
      if (!token) {
        logger.log(chalk.bold('Step 1: Create a Telegram Bot'));
        logger.newLine();
        logger.log('1. Open Telegram and search for @BotFather');
        logger.log('2. Send /newbot and follow the prompts');
        logger.log('3. Copy the bot token provided');
        logger.newLine();

        token = await promptPassword('Enter bot token: ');

        if (!token) {
          logger.error('Bot token is required');
          process.exit(1);
        }
      }

      // Validate token format
      if (!isValidBotToken(token)) {
        logger.error('Invalid bot token format. Expected: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz');
        process.exit(1);
      }

      // Step 2: Test connectivity
      logger.newLine();
      const spinner = logger.spinner('Testing bot connectivity...').start();

      telegramService.setToken(token);
      const testResult = await telegramService.testConnection();

      if (!testResult.success) {
        spinner.fail('Failed to connect to Telegram');
        logger.error(testResult.error || 'Unknown error');
        process.exit(1);
      }

      spinner.succeed(`Connected to bot: @${testResult.user?.username || 'unknown'}`);

      // Step 3: Get chat ID
      if (!chatId) {
        logger.newLine();
        logger.log(chalk.bold('Step 2: Get your Chat ID'));
        logger.newLine();
        logger.log(`1. Open Telegram and find your bot: @${testResult.user?.username}`);
        logger.log('2. Send any message to the bot (e.g., "hello")');
        logger.log('3. Press Enter here when done...');
        logger.newLine();

        await waitForEnter();

        // Poll for updates to get chat ID
        const pollSpinner = logger.spinner('Waiting for your message...').start();

        try {
          const updates = await telegramService.getUpdates(undefined, 10);

          if (updates.length === 0) {
            pollSpinner.fail('No messages received');
            logger.error('Please send a message to the bot and try again');
            process.exit(1);
          }

          // Get the most recent message
          const lastUpdate = updates[updates.length - 1];
          const message = lastUpdate.message;

          if (!message) {
            pollSpinner.fail('No message found in updates');
            process.exit(1);
          }

          chatId = String(message.chat.id);
          const chatName = message.chat.first_name || message.chat.title || 'Unknown';

          pollSpinner.succeed(`Found chat: ${chatName} (ID: ${chatId})`);
        } catch (error) {
          pollSpinner.fail('Failed to get updates');
          logger.error(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      }

      // Step 4: Send test message
      logger.newLine();
      const testMsgSpinner = logger.spinner('Sending test message...').start();

      try {
        await telegramService.sendText(
          chatId,
          '✅ <b>Selfhost Bot Configured</b>\n\nYou will receive alerts here when services fail.\n\nCommands:\n/status - Cluster health\n/resources - Resource usage\n/settings - View settings',
          'HTML',
        );
        testMsgSpinner.succeed('Test message sent successfully');
      } catch (error) {
        testMsgSpinner.fail('Failed to send test message');
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }

      // Step 5: Save configuration
      const saveSpinner = logger.spinner('Saving configuration...').start();

      try {
        configService.saveConfig({
          token,
          chatId,
          enabled: true,
          rateLimitSeconds: DEFAULT_TELEGRAM_CONFIG.rateLimitSeconds!,
          alertOnCritical: DEFAULT_TELEGRAM_CONFIG.alertOnCritical!,
          alertOnDegraded: DEFAULT_TELEGRAM_CONFIG.alertOnDegraded!,
        });

        // Set bot commands
        await telegramService.setMyCommands([
          { command: 'status', description: 'Cluster health summary' },
          { command: 'resources', description: 'Resource usage by node' },
          { command: 'settings', description: 'View alert settings' },
        ]);

        saveSpinner.succeed('Configuration saved');
      } catch (error) {
        saveSpinner.fail('Failed to save configuration');
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }

      logger.newLine();
      logger.success('Telegram bot setup complete!');
      logger.newLine();
      logger.log('Configuration:');
      logger.log(`  Bot:           @${testResult.user?.username}`);
      logger.log(`  Chat ID:       ${chatId}`);
      logger.log(`  Alert Critical: ${chalk.green('enabled')}`);
      logger.log(`  Alert Degraded: ${chalk.gray('disabled')}`);
      logger.log(`  Rate Limit:     60s`);
      logger.newLine();
      logger.log('The daemon will now send alerts to Telegram.');
      logger.log('Test with: ' + chalk.cyan('selfhost bot check'));
    });
}

/**
 * Check subcommand - test connectivity
 */
function createCheckSubcommand(app: INestApplicationContext): Command {
  return new Command('check')
    .description('Test bot connectivity and send test message')
    .action(async () => {
      const telegramService = app.get(TelegramService);
      const configService = app.get(TelegramConfigService);

      const config = configService.getConfig();
      if (!config) {
        logger.error('Telegram bot not configured. Run `selfhost bot init` first.');
        process.exit(1);
      }

      logger.header('Telegram Bot Check');
      logger.newLine();

      // Test connectivity
      const spinner = logger.spinner('Testing connectivity...').start();

      telegramService.setToken(config.token);
      const result = await telegramService.testConnection();

      if (!result.success) {
        spinner.fail('Connection failed');
        logger.error(result.error || 'Unknown error');
        process.exit(1);
      }

      spinner.succeed(`Connected: @${result.user?.username}`);

      // Send test message
      const msgSpinner = logger.spinner('Sending test message...').start();

      try {
        await telegramService.sendText(
          config.chatId,
          '🧪 <b>Test Message</b>\n\nBot connectivity verified.',
          'HTML',
        );
        msgSpinner.succeed('Test message sent');
      } catch (error) {
        msgSpinner.fail('Failed to send message');
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }

      logger.newLine();
      logger.success('Bot is working correctly');
    });
}

/**
 * Disable subcommand
 */
function createDisableSubcommand(app: INestApplicationContext): Command {
  return new Command('disable')
    .description('Disable Telegram notifications')
    .action(async () => {
      const configService = app.get(TelegramConfigService);

      const config = configService.getConfig();
      if (!config) {
        logger.error('Telegram bot not configured.');
        return;
      }

      if (!config.enabled) {
        logger.info('Telegram notifications are already disabled.');
        return;
      }

      configService.disable();
      logger.success('Telegram notifications disabled');
    });
}

/**
 * Enable subcommand
 */
function createEnableSubcommand(app: INestApplicationContext): Command {
  return new Command('enable')
    .description('Enable Telegram notifications')
    .action(async () => {
      const configService = app.get(TelegramConfigService);

      const config = configService.getConfig();
      if (!config) {
        logger.error('Telegram bot not configured. Run `selfhost bot init` first.');
        return;
      }

      if (config.enabled) {
        logger.info('Telegram notifications are already enabled.');
        return;
      }

      configService.enable();
      logger.success('Telegram notifications enabled');
    });
}

/**
 * Status subcommand
 */
function createStatusSubcommand(app: INestApplicationContext): Command {
  return new Command('status')
    .description('Show current bot configuration')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const configService = app.get(TelegramConfigService);

      const config = configService.getConfig();
      if (!config) {
        if (options.json) {
          console.log(JSON.stringify({ configured: false }));
        } else {
          logger.error('Telegram bot not configured.');
        }
        return;
      }

      if (options.json) {
        console.log(JSON.stringify({
          configured: true,
          enabled: config.enabled,
          chatId: config.chatId,
          alertOnCritical: config.alertOnCritical,
          alertOnDegraded: config.alertOnDegraded,
          rateLimitSeconds: config.rateLimitSeconds,
          lastAlertAt: config.lastAlertAt,
        }, null, 2));
        return;
      }

      await showStatus(configService);
    });
}

/**
 * Show bot status
 */
async function showStatus(configService: TelegramConfigService): Promise<void> {
  const config = configService.getConfig();
  if (!config) return;

  logger.header('Telegram Bot Status');
  logger.newLine();

  const statusIcon = config.enabled ? chalk.green('●') : chalk.gray('●');
  const statusText = config.enabled ? chalk.green('Enabled') : chalk.gray('Disabled');

  logger.log(`  Status:         ${statusIcon} ${statusText}`);
  logger.log(`  Chat ID:        ${config.chatId}`);
  logger.log(`  Alert Critical: ${config.alertOnCritical ? chalk.green('yes') : chalk.gray('no')}`);
  logger.log(`  Alert Degraded: ${config.alertOnDegraded ? chalk.green('yes') : chalk.gray('no')}`);
  logger.log(`  Rate Limit:     ${config.rateLimitSeconds}s`);

  if (config.lastAlertAt) {
    const lastAlert = new Date(config.lastAlertAt);
    const ago = formatTimeAgo(Date.now() - lastAlert.getTime());
    logger.log(`  Last Alert:     ${ago}`);
  }

  // Show recent alerts
  const recentAlerts = configService.getAlertLogs(5);
  if (recentAlerts.length > 0) {
    logger.newLine();
    logger.log(chalk.bold('  Recent Alerts:'));
    for (const alert of recentAlerts) {
      const icon = alert.error ? chalk.red('✗') : chalk.green('✓');
      const time = new Date(alert.sentAt).toLocaleTimeString();
      logger.log(`    ${icon} ${alert.target} [${alert.status}] - ${time}`);
    }
  }
}

/**
 * Prompt for password input (hidden)
 */
async function promptPassword(prompt: string): Promise<string> {
  process.stdout.write(prompt);

  return new Promise((resolve) => {
    let input = '';

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const onData = (char: string) => {
      if (char === '\n' || char === '\r') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(input);
      } else if (char === '\x03') {
        // Ctrl+C
        process.exit(0);
      } else if (char === '\x7f' || char === '\b') {
        // Backspace
        if (input.length > 0) {
          input = input.slice(0, -1);
        }
      } else {
        input += char;
      }
    };

    process.stdin.on('data', onData);
  });
}

/**
 * Wait for Enter key
 */
async function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const onData = (char: string) => {
      if (char === '\n' || char === '\r') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        resolve();
      } else if (char === '\x03') {
        // Ctrl+C
        process.exit(0);
      }
    };

    process.stdin.on('data', onData);
  });
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
