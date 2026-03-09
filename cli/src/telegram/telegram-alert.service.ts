import { Injectable, Inject } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramConfigService } from './telegram-config.service';
import type { DaemonHealthLog } from '../daemon/interfaces/daemon.interface';
import { DaemonHealthStatus } from '../daemon/interfaces/daemon.interface';
import type { AlertPayload } from './interfaces/telegram.interface';
import { formatAlertMessage } from './interfaces/telegram.interface';

/**
 * Service for sending alerts to Telegram from the daemon
 */
@Injectable()
export class TelegramAlertService {
  constructor(
    @Inject(TelegramService)
    private readonly telegram: TelegramService,
    @Inject(TelegramConfigService)
    private readonly configService: TelegramConfigService,
  ) {}

  /**
   * Process health check logs and send alerts for critical/degraded services
   */
  async processAlerts(logs: DaemonHealthLog[]): Promise<void> {
    const config = this.configService.getConfig();

    // Skip if not configured or disabled
    if (!config || !config.enabled) {
      return;
    }

    // Set token if needed
    if (!this.telegram.hasToken()) {
      this.telegram.setToken(config.token);
    }

    // Filter logs that should trigger alerts
    const alertableLogs = logs.filter((log) => {
      // Only alert on non-healthy status
      if (log.status === DaemonHealthStatus.HEALTHY) {
        return false;
      }

      // Check alert preferences
      if (log.status === DaemonHealthStatus.CRITICAL && !config.alertOnCritical) {
        return false;
      }
      if (log.status === DaemonHealthStatus.DEGRADED && !config.alertOnDegraded) {
        return false;
      }

      // Check for deduplication (don't alert for same target within 5 minutes)
      if (this.configService.wasAlertRecentlySent(log.target, 300)) {
        return false;
      }

      return true;
    });

    // Send alerts
    for (const log of alertableLogs) {
      await this.sendAlert(log, config.chatId, config.lastAlertAt, config.rateLimitSeconds);
    }
  }

  /**
   * Send a single alert
   */
  private async sendAlert(
    log: DaemonHealthLog,
    chatId: string,
    lastAlertAt?: string,
    rateLimitSeconds: number = 60,
  ): Promise<void> {
    try {
      // Check rate limiting
      const result = await this.telegram.sendAlert(
        chatId,
        this.formatLogAsAlert(log),
        lastAlertAt,
        rateLimitSeconds,
      );

      if (result.rateLimited) {
        console.log(`[Telegram] Rate limited, skipping alert for ${log.target}`);
        return;
      }

      if (result.sent) {
        console.log(`[Telegram] Sent alert for ${log.target}`);

        // Update last alert timestamp
        this.configService.updateLastAlertAt();

        // Log the alert
        this.configService.logAlert({
          checkType: log.checkType,
          target: log.target,
          status: log.status,
          messageId: result.messageId ? String(result.messageId) : undefined,
          sentAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error(`[Telegram] Failed to send alert for ${log.target}:`, error);

      // Log the error
      this.configService.logAlert({
        checkType: log.checkType,
        target: log.target,
        status: log.status,
        sentAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Format a daemon health log as an alert message
   */
  private formatLogAsAlert(log: DaemonHealthLog): string {
    const payload: AlertPayload = {
      checkType: log.checkType,
      target: log.target,
      status: this.mapDaemonStatusToAlert(log.status),
      message: log.message,
      metadata: log.metadata,
      timestamp: log.timestamp,
    };

    return formatAlertMessage(payload);
  }

  /**
   * Map daemon health status to alert status
   */
  private mapDaemonStatusToAlert(
    status: DaemonHealthStatus,
  ): 'critical' | 'degraded' | 'healthy' {
    switch (status) {
      case DaemonHealthStatus.CRITICAL:
        return 'critical';
      case DaemonHealthStatus.DEGRADED:
        return 'degraded';
      default:
        return 'healthy';
    }
  }

  /**
   * Send a test alert (used by bot check command)
   */
  async sendTestAlert(): Promise<{ success: boolean; error?: string }> {
    const config = this.configService.getConfig();

    if (!config) {
      return { success: false, error: 'Not configured' };
    }

    if (!config.enabled) {
      return { success: false, error: 'Disabled' };
    }

    this.telegram.setToken(config.token);

    try {
      await this.telegram.sendText(
        config.chatId,
        '🧪 <b>Test Alert</b>\n\nThis is a test alert from the Telegram alert service.',
        'HTML',
      );
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Send a manual alert (for testing or manual notifications)
   */
  async sendManualAlert(
    target: string,
    status: 'critical' | 'degraded' | 'healthy',
    message?: string,
  ): Promise<{ success: boolean; error?: string }> {
    const config = this.configService.getConfig();

    if (!config || !config.enabled) {
      return { success: false, error: 'Not configured or disabled' };
    }

    this.telegram.setToken(config.token);

    const payload: AlertPayload = {
      checkType: 'manual',
      target,
      status,
      message,
      timestamp: new Date().toISOString(),
    };

    try {
      await this.telegram.sendText(
        config.chatId,
        formatAlertMessage(payload),
        'HTML',
      );

      this.configService.logAlert({
        checkType: 'manual',
        target,
        status,
        sentAt: new Date().toISOString(),
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
