import { Injectable, Inject } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { TelegramConfig, TelegramAlertLog } from './interfaces/telegram.interface';

/**
 * Service for managing Telegram configuration in SQLite
 */
@Injectable()
export class TelegramConfigService {
  constructor(
    @Inject(DatabaseService)
    private readonly db: DatabaseService,
  ) {}

  /**
   * Get the current Telegram configuration
   */
  getConfig(): TelegramConfig | null {
    const row = this.db.queryOne<{
      id: number;
      token: string;
      chat_id: string;
      enabled: number;
      rate_limit_seconds: number;
      alert_on_critical: number;
      alert_on_degraded: number;
      last_alert_at: string | null;
      created_at: string;
      updated_at: string;
    }>('SELECT * FROM telegram_config ORDER BY id DESC LIMIT 1');

    if (!row) return null;

    return {
      id: row.id,
      token: row.token,
      chatId: row.chat_id,
      enabled: row.enabled === 1,
      rateLimitSeconds: row.rate_limit_seconds,
      alertOnCritical: row.alert_on_critical === 1,
      alertOnDegraded: row.alert_on_degraded === 1,
      lastAlertAt: row.last_alert_at ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Check if Telegram is configured
   */
  isConfigured(): boolean {
    const config = this.getConfig();
    return config !== null && config.enabled;
  }

  /**
   * Save Telegram configuration
   */
  saveConfig(config: Omit<TelegramConfig, 'id' | 'createdAt' | 'updatedAt'>): void {
    const now = new Date().toISOString();

    // Check if config exists
    const existing = this.getConfig();

    if (existing) {
      // Update existing
      const stmt = this.db.prepare(`
        UPDATE telegram_config SET
          token = ?,
          chat_id = ?,
          enabled = ?,
          rate_limit_seconds = ?,
          alert_on_critical = ?,
          alert_on_degraded = ?,
          updated_at = ?
        WHERE id = ?
      `);

      stmt.run(
        config.token,
        config.chatId,
        config.enabled ? 1 : 0,
        config.rateLimitSeconds,
        config.alertOnCritical ? 1 : 0,
        config.alertOnDegraded ? 1 : 0,
        now,
        existing.id!,
      );
    } else {
      // Insert new
      const stmt = this.db.prepare(`
        INSERT INTO telegram_config (
          token, chat_id, enabled, rate_limit_seconds,
          alert_on_critical, alert_on_degraded,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        config.token,
        config.chatId,
        config.enabled ? 1 : 0,
        config.rateLimitSeconds,
        config.alertOnCritical ? 1 : 0,
        config.alertOnDegraded ? 1 : 0,
        now,
        now,
      );
    }
  }

  /**
   * Update specific config fields
   */
  updateConfig(updates: Partial<TelegramConfig>): void {
    const existing = this.getConfig();
    if (!existing) {
      throw new Error('Telegram not configured');
    }

    const config: Omit<TelegramConfig, 'id' | 'createdAt' | 'updatedAt'> = {
      token: updates.token ?? existing.token,
      chatId: updates.chatId ?? existing.chatId,
      enabled: updates.enabled ?? existing.enabled,
      rateLimitSeconds: updates.rateLimitSeconds ?? existing.rateLimitSeconds,
      alertOnCritical: updates.alertOnCritical ?? existing.alertOnCritical,
      alertOnDegraded: updates.alertOnDegraded ?? existing.alertOnDegraded,
      lastAlertAt: updates.lastAlertAt ?? existing.lastAlertAt,
    };

    this.saveConfig(config);
  }

  /**
   * Disable Telegram bot
   */
  disable(): void {
    const config = this.getConfig();
    if (config) {
      this.updateConfig({ enabled: false });
    }
  }

  /**
   * Enable Telegram bot
   */
  enable(): void {
    const config = this.getConfig();
    if (config) {
      this.updateConfig({ enabled: true });
    }
  }

  /**
   * Delete configuration
   */
  deleteConfig(): void {
    this.db.exec('DELETE FROM telegram_config');
  }

  /**
   * Update last alert timestamp
   */
  updateLastAlertAt(): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE telegram_config SET
        last_alert_at = ?,
        updated_at = ?
    `);
    stmt.run(now, now);
  }

  /**
   * Log an alert
   */
  logAlert(log: Omit<TelegramAlertLog, 'id'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO telegram_alert_log (
        check_type, target, status, message_id, sent_at, error
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      log.checkType,
      log.target,
      log.status,
      log.messageId ?? null,
      log.sentAt,
      log.error ?? null,
    );
  }

  /**
   * Get recent alert logs
   */
  getAlertLogs(limit: number = 50): TelegramAlertLog[] {
    const rows = this.db.query<{
      id: number;
      check_type: string;
      target: string;
      status: string;
      message_id: string | null;
      sent_at: string;
      error: string | null;
    }>('SELECT * FROM telegram_alert_log ORDER BY sent_at DESC LIMIT ?', [limit]);

    return rows.map((row) => ({
      id: row.id,
      checkType: row.check_type,
      target: row.target,
      status: row.status,
      messageId: row.message_id ?? undefined,
      sentAt: row.sent_at,
      error: row.error ?? undefined,
    }));
  }

  /**
   * Check if alert was recently sent for a target (for deduplication)
   */
  wasAlertRecentlySent(target: string, withinSeconds: number = 300): boolean {
    const cutoff = new Date(Date.now() - withinSeconds * 1000).toISOString();

    const row = this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM telegram_alert_log
       WHERE target = ? AND sent_at > ? AND error IS NULL`,
      [target, cutoff],
    );

    return (row?.count ?? 0) > 0;
  }

  /**
   * Clean old alert logs
   */
  cleanOldLogs(retentionDays: number = 7): number {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const stmt = this.db.prepare('DELETE FROM telegram_alert_log WHERE sent_at < ?');
    const result = stmt.run(cutoff.toISOString());

    return (result as { changes: number }).changes;
  }
}
