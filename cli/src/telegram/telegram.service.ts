import { Injectable } from '@nestjs/common';
import type {
  TelegramResponse,
  TelegramUser,
  TelegramMessage,
  TelegramUpdate,
  SendMessageParams,
} from './interfaces/telegram.interface';

/**
 * Core Telegram API client service
 * Uses native fetch for HTTP requests
 */
@Injectable()
export class TelegramService {
  private readonly baseUrl = 'https://api.telegram.org';
  private token: string | null = null;

  /**
   * Set the bot token
   */
  setToken(token: string): void {
    this.token = token;
  }

  /**
   * Get current token
   */
  getToken(): string | null {
    return this.token;
  }

  /**
   * Check if token is set
   */
  hasToken(): boolean {
    return this.token !== null;
  }

  /**
   * Make a request to the Telegram API
   */
  private async request<T>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    if (!this.token) {
      throw new Error('Telegram bot token not set');
    }

    const url = `${this.baseUrl}/bot${this.token}/${method}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: params ? JSON.stringify(params) : undefined,
    });

    const data = (await response.json()) as TelegramResponse<T>;

    if (!data.ok) {
      const error = new Error(
        `Telegram API error: ${data.description || 'Unknown error'}`,
      );
      (error as Error & { code?: number }).code = data.error_code;
      throw error;
    }

    return data.result;
  }

  /**
   * Verify bot token with getMe
   */
  async getMe(): Promise<TelegramUser> {
    return this.request<TelegramUser>('getMe');
  }

  /**
   * Send a text message
   */
  async sendMessage(params: SendMessageParams): Promise<TelegramMessage> {
    return this.request<TelegramMessage>('sendMessage', params as unknown as Record<string, unknown>);
  }

  /**
   * Send a simple text message
   */
  async sendText(
    chatId: string | number,
    text: string,
    parseMode: 'HTML' | 'Markdown' | 'MarkdownV2' = 'HTML',
  ): Promise<TelegramMessage> {
    return this.sendMessage({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
    });
  }

  /**
   * Get updates (long polling)
   */
  async getUpdates(
    offset?: number,
    timeout: number = 30,
    allowedUpdates?: string[],
  ): Promise<TelegramUpdate[]> {
    const params: Record<string, unknown> = {
      timeout,
    };

    if (offset !== undefined) {
      params.offset = offset;
    }

    if (allowedUpdates) {
      params.allowed_updates = allowedUpdates;
    }

    return this.request<TelegramUpdate[]>('getUpdates', params);
  }

  /**
   * Delete a message
   */
  async deleteMessage(chatId: string | number, messageId: number): Promise<boolean> {
    return this.request<boolean>('deleteMessage', {
      chat_id: chatId,
      message_id: messageId,
    });
  }

  /**
   * Edit message text
   */
  async editMessageText(
    chatId: string | number,
    messageId: number,
    text: string,
    parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2',
  ): Promise<TelegramMessage | boolean> {
    return this.request<TelegramMessage | boolean>('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: parseMode,
    });
  }

  /**
   * Answer callback query (for inline keyboards)
   */
  async answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
    showAlert: boolean = false,
  ): Promise<boolean> {
    return this.request<boolean>('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    });
  }

  /**
   * Set bot commands (menu)
   */
  async setMyCommands(
    commands: Array<{ command: string; description: string }>,
  ): Promise<boolean> {
    return this.request<boolean>('setMyCommands', { commands });
  }

  /**
   * Test connectivity by calling getMe with retry
   */
  async testConnection(retries: number = 3): Promise<{ success: boolean; user?: TelegramUser; error?: string }> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const user = await this.getMe();
        return { success: true, user };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < retries) {
          // Exponential backoff
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, attempt) * 1000),
          );
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Unknown error',
    };
  }

  /**
   * Send alert with rate limiting check
   * Returns message ID if sent, null if rate limited
   */
  async sendAlert(
    chatId: string,
    text: string,
    lastAlertAt?: string,
    rateLimitSeconds: number = 60,
  ): Promise<{ sent: boolean; messageId?: number; rateLimited?: boolean }> {
    // Check rate limiting
    if (lastAlertAt) {
      const lastTime = new Date(lastAlertAt).getTime();
      const now = Date.now();
      if (now - lastTime < rateLimitSeconds * 1000) {
        return { sent: false, rateLimited: true };
      }
    }

    try {
      const message = await this.sendText(chatId, text, 'HTML');
      return { sent: true, messageId: message.message_id };
    } catch (error) {
      throw error;
    }
  }
}
