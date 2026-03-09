import type {
  CommandResult,
  BotCommand,
  ConfirmationState,
  TelegramInlineKeyboardButton,
} from '../interfaces/telegram.interface';
import { escapeHtml } from '../interfaces/telegram.interface';

// In-memory confirmation states (keyed by chat_id)
const confirmations = new Map<string, ConfirmationState>();

// Confirmation expiry time (60 seconds)
const CONFIRMATION_EXPIRY_MS = 60 * 1000;

/**
 * Handle /restart command
 * Requires confirmation before executing
 */
export async function handleRestartCommand(
  command: BotCommand,
): Promise<CommandResult> {
  const chatId = String(command.message.chat.id);

  if (command.args.length === 0) {
    return {
      text: '⚠️ <b>Usage</b>\n\n<code>/restart &lt;service&gt;</code>\n\nExample:\n<code>/restart gitlab</code>',
      parseMode: 'HTML',
    };
  }

  const service = command.args[0];

  // Store confirmation state
  confirmations.set(chatId, {
    action: 'restart',
    service,
    expiresAt: Date.now() + CONFIRMATION_EXPIRY_MS,
  });

  // Create inline keyboard for confirmation
  const keyboard: TelegramInlineKeyboardButton[][] = [
    [
      { text: '✅ Confirm Restart', callback_data: `confirm_restart:${service}` },
      { text: '❌ Cancel', callback_data: 'cancel_restart' },
    ],
  ];

  return {
    text: `⚠️ <b>Confirm Restart</b>\n\nAre you sure you want to restart <code>${escapeHtml(service)}</code>?\n\nThis will cause temporary downtime for the service.\n\n<i>This confirmation expires in 60 seconds.</i>`,
    parseMode: 'HTML',
    replyMarkup: {
      inline_keyboard: keyboard,
    },
  };
}

/**
 * Handle /confirm command (alternative confirmation method)
 */
export async function handleConfirmCommand(
  command: BotCommand,
  executeRestart: (service: string, namespace?: string) => Promise<void>,
): Promise<CommandResult> {
  const chatId = String(command.message.chat.id);

  // Check for pending confirmation
  const confirmation = confirmations.get(chatId);

  if (!confirmation) {
    return {
      text: '⚠️ No pending action to confirm.\n\nUse <code>/restart &lt;service&gt;</code> first.',
      parseMode: 'HTML',
    };
  }

  // Check if expired
  if (Date.now() > confirmation.expiresAt) {
    confirmations.delete(chatId);
    return {
      text: '⏰ <b>Expired</b>\n\nThe confirmation has expired. Please try again.',
      parseMode: 'HTML',
    };
  }

  // Validate command format: /confirm restart <service>
  if (command.args[0] !== 'restart' || command.args[1] !== confirmation.service) {
    return {
      text: `⚠️ <b>Mismatch</b>\n\nTo confirm, use:\n<code>/confirm restart ${escapeHtml(confirmation.service!)}</code>`,
      parseMode: 'HTML',
    };
  }

  // Clear confirmation
  confirmations.delete(chatId);

  // Execute restart
  try {
    await executeRestart(confirmation.service!);

    return {
      text: `✅ <b>Restart Initiated</b>\n\n<code>${escapeHtml(confirmation.service!)}</code> is being restarted.\n\nMonitor with /status`,
      parseMode: 'HTML',
    };
  } catch (error) {
    return {
      text: `❌ <b>Restart Failed</b>\n\n<code>${escapeHtml(error instanceof Error ? error.message : String(error))}</code>`,
      parseMode: 'HTML',
    };
  }
}

/**
 * Handle callback query for restart confirmation
 */
export async function handleRestartCallback(
  chatId: string,
  data: string,
  executeRestart: (service: string, namespace?: string) => Promise<void>,
): Promise<CommandResult> {
  if (data === 'cancel_restart') {
    confirmations.delete(chatId);
    return {
      text: '❌ <b>Cancelled</b>\n\nRestart operation cancelled.',
      parseMode: 'HTML',
    };
  }

  if (data.startsWith('confirm_restart:')) {
    const service = data.substring('confirm_restart:'.length);

    // Verify confirmation state
    const confirmation = confirmations.get(chatId);
    if (!confirmation || confirmation.service !== service) {
      return {
        text: '⚠️ <b>Invalid</b>\n\nConfirmation state mismatch. Please try again.',
        parseMode: 'HTML',
      };
    }

    if (Date.now() > confirmation.expiresAt) {
      confirmations.delete(chatId);
      return {
        text: '⏰ <b>Expired</b>\n\nThe confirmation has expired. Please try again.',
        parseMode: 'HTML',
      };
    }

    // Clear confirmation
    confirmations.delete(chatId);

    // Execute restart
    try {
      await executeRestart(service);

      return {
        text: `✅ <b>Restart Initiated</b>\n\n<code>${escapeHtml(service)}</code> is being restarted.\n\nMonitor with /status`,
        parseMode: 'HTML',
      };
    } catch (error) {
      return {
        text: `❌ <b>Restart Failed</b>\n\n<code>${escapeHtml(error instanceof Error ? error.message : String(error))}</code>`,
        parseMode: 'HTML',
      };
    }
  }

  return {
    text: '⚠️ Unknown action',
    parseMode: 'HTML',
  };
}

/**
 * Check if chat has pending confirmation
 */
export function hasPendingConfirmation(chatId: string): boolean {
  const confirmation = confirmations.get(chatId);
  if (!confirmation) return false;

  if (Date.now() > confirmation.expiresAt) {
    confirmations.delete(chatId);
    return false;
  }

  return true;
}

/**
 * Clear expired confirmations
 */
export function cleanupExpiredConfirmations(): void {
  const now = Date.now();
  for (const [chatId, confirmation] of confirmations.entries()) {
    if (now > confirmation.expiresAt) {
      confirmations.delete(chatId);
    }
  }
}
