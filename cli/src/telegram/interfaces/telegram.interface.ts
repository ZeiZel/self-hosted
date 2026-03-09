import { z } from 'zod';

/**
 * Telegram bot configuration stored in SQLite
 */
export interface TelegramConfig {
  id?: number;
  token: string;
  chatId: string;
  enabled: boolean;
  rateLimitSeconds: number;
  alertOnCritical: boolean;
  alertOnDegraded: boolean;
  lastAlertAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Telegram alert log entry
 */
export interface TelegramAlertLog {
  id?: number;
  checkType: string;
  target: string;
  status: string;
  messageId?: string;
  sentAt: string;
  error?: string;
}

/**
 * Telegram API response wrapper
 */
export interface TelegramResponse<T> {
  ok: boolean;
  result: T;
  description?: string;
  error_code?: number;
}

/**
 * Telegram User object from getMe
 */
export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
  supports_inline_queries?: boolean;
}

/**
 * Telegram Chat object
 */
export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

/**
 * Telegram Message object
 */
export interface TelegramMessage {
  message_id: number;
  date: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  entities?: TelegramMessageEntity[];
}

/**
 * Telegram MessageEntity for parsing commands
 */
export interface TelegramMessageEntity {
  type: string;
  offset: number;
  length: number;
}

/**
 * Telegram Update object from getUpdates
 */
export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

/**
 * Telegram CallbackQuery for inline keyboards
 */
export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

/**
 * SendMessage parameters
 */
export interface SendMessageParams {
  chat_id: string | number;
  text: string;
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disable_web_page_preview?: boolean;
  disable_notification?: boolean;
  reply_to_message_id?: number;
  reply_markup?: TelegramReplyMarkup;
}

/**
 * Inline keyboard markup
 */
export interface TelegramReplyMarkup {
  inline_keyboard?: TelegramInlineKeyboardButton[][];
  keyboard?: TelegramKeyboardButton[][];
  remove_keyboard?: boolean;
  one_time_keyboard?: boolean;
  resize_keyboard?: boolean;
}

/**
 * Inline keyboard button
 */
export interface TelegramInlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

/**
 * Regular keyboard button
 */
export interface TelegramKeyboardButton {
  text: string;
}

/**
 * Bot command parsed from message
 */
export interface BotCommand {
  command: string;
  args: string[];
  rawArgs: string;
  message: TelegramMessage;
}

/**
 * Bot command handler result
 */
export interface CommandResult {
  text: string;
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  replyMarkup?: TelegramReplyMarkup;
}

/**
 * Alert notification payload
 */
export interface AlertPayload {
  checkType: string;
  target: string;
  status: 'critical' | 'degraded' | 'healthy';
  message?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

/**
 * Confirmation state for dangerous actions
 */
export interface ConfirmationState {
  action: string;
  service?: string;
  expiresAt: number;
}

/**
 * Settings field for TUI
 */
export interface SettingsField {
  key: string;
  label: string;
  type: 'number' | 'boolean' | 'select';
  value: number | boolean | string;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
}

/**
 * Settings panel state
 */
export interface SettingsPanelState {
  visible: boolean;
  selectedIndex: number;
  fields: SettingsField[];
  telegramStatus: 'connected' | 'disconnected' | 'error' | 'not_configured';
  modified: boolean;
}

/**
 * Zod Schemas
 */

/**
 * Telegram config validation schema
 */
export const telegramConfigSchema = z.object({
  token: z
    .string()
    .regex(/^\d+:[A-Za-z0-9_-]+$/, 'Invalid bot token format'),
  chatId: z.string().min(1, 'Chat ID is required'),
  enabled: z.boolean().default(true),
  rateLimitSeconds: z.number().int().min(0).max(3600).default(60),
  alertOnCritical: z.boolean().default(true),
  alertOnDegraded: z.boolean().default(false),
});

/**
 * Alert payload validation schema
 */
export const alertPayloadSchema = z.object({
  checkType: z.string(),
  target: z.string(),
  status: z.enum(['critical', 'degraded', 'healthy']),
  message: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.string(),
});

/**
 * Default telegram config values
 */
export const DEFAULT_TELEGRAM_CONFIG: Partial<TelegramConfig> = {
  enabled: true,
  rateLimitSeconds: 60,
  alertOnCritical: true,
  alertOnDegraded: false,
};

/**
 * Parse bot command from message text
 */
export function parseBotCommand(message: TelegramMessage): BotCommand | null {
  if (!message.text) return null;

  const text = message.text.trim();
  if (!text.startsWith('/')) return null;

  // Check for bot command entity
  const hasCommandEntity = message.entities?.some(
    (e) => e.type === 'bot_command' && e.offset === 0,
  );

  if (!hasCommandEntity && !text.startsWith('/')) return null;

  // Parse command and args
  const parts = text.split(/\s+/);
  const commandPart = parts[0];

  // Remove @botname if present
  const command = commandPart.split('@')[0].substring(1).toLowerCase();
  const args = parts.slice(1);
  const rawArgs = text.substring(commandPart.length).trim();

  return {
    command,
    args,
    rawArgs,
    message,
  };
}

/**
 * Format alert message for Telegram
 */
export function formatAlertMessage(payload: AlertPayload): string {
  const emoji = payload.status === 'critical' ? '🔴' : payload.status === 'degraded' ? '🟡' : '🟢';
  const statusText = payload.status.toUpperCase();

  let message = `${emoji} <b>${statusText}:</b> ${escapeHtml(payload.target)}\n\n`;

  if (payload.message) {
    message += `<b>Status:</b> ${escapeHtml(payload.message)}\n`;
  }

  if (payload.metadata) {
    const { restarts, node, logs } = payload.metadata as Record<string, unknown>;

    if (restarts !== undefined) {
      message += `<b>Restarts:</b> ${restarts}\n`;
    }

    if (node) {
      message += `<b>Node:</b> ${escapeHtml(String(node))}\n`;
    }

    if (logs && Array.isArray(logs) && logs.length > 0) {
      message += `\n<b>Recent logs:</b>\n<code>`;
      const logLines = logs.slice(0, 3).map((l) => `&gt; ${escapeHtml(String(l))}`);
      message += logLines.join('\n');
      message += `</code>\n`;
    }
  }

  const time = new Date(payload.timestamp).toLocaleString();
  message += `\n<i>Time: ${time}</i>`;

  return message;
}

/**
 * Escape HTML special characters for Telegram
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Validate bot token format
 */
export function isValidBotToken(token: string): boolean {
  return /^\d+:[A-Za-z0-9_-]+$/.test(token);
}
