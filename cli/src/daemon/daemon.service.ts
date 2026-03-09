import { Injectable, Inject } from '@nestjs/common';
import { HealthCheckerService } from './health-checker.service';
import { DaemonClientService } from './daemon-client.service';
import { DaemonInitService } from './daemon-init.service';
import {
  DaemonStatus,
  DaemonConfig,
  DEFAULT_DAEMON_CONFIG,
  DaemonInitOptions,
  DaemonHealthLog,
  DaemonHealthStatus,
} from './interfaces/daemon.interface';

/**
 * Main daemon orchestration service
 */
@Injectable()
export class DaemonService {
  constructor(
    @Inject(HealthCheckerService)
    private readonly healthChecker: HealthCheckerService,
    @Inject(DaemonClientService)
    private readonly daemonClient: DaemonClientService,
    @Inject(DaemonInitService)
    private readonly daemonInit: DaemonInitService,
  ) {}

  /**
   * Initialize daemon
   */
  async init(options: DaemonInitOptions = {}): Promise<void> {
    await this.daemonInit.initialize(options);
  }

  /**
   * Start daemon
   */
  async start(): Promise<string> {
    return this.daemonInit.start();
  }

  /**
   * Stop daemon
   */
  async stop(): Promise<void> {
    return this.daemonInit.stop();
  }

  /**
   * Restart daemon
   */
  async restart(): Promise<void> {
    return this.daemonInit.restart();
  }

  /**
   * Remove daemon completely
   */
  async remove(): Promise<void> {
    return this.daemonInit.remove();
  }

  /**
   * Get daemon status
   */
  getStatus(): DaemonStatus {
    return this.daemonClient.getDaemonStatus();
  }

  /**
   * Get daemon logs (from SQLite)
   */
  getLogs(options: {
    status?: DaemonHealthStatus;
    limit?: number;
  } = {}): DaemonHealthLog[] {
    return this.daemonClient.getHealthLogs({
      status: options.status,
      limit: options.limit || 50,
    });
  }

  /**
   * Get container logs (from Docker)
   */
  async getContainerLogs(options: {
    follow?: boolean;
    tail?: number;
  } = {}): Promise<string> {
    return this.daemonInit.getLogs(options);
  }

  /**
   * Check if daemon is initialized
   */
  async isInitialized(): Promise<boolean> {
    return this.daemonInit.isInitialized();
  }

  /**
   * Check if daemon is running
   */
  async isRunning(): Promise<boolean> {
    return this.daemonInit.isContainerRunning();
  }

  /**
   * Get critical alerts count (for startup check)
   */
  getCriticalAlertsCount(): number {
    return this.daemonClient.getCriticalAlertsCount();
  }

  /**
   * Get recent alerts (for startup display)
   */
  getRecentAlerts(limit: number = 5): DaemonHealthLog[] {
    return this.daemonClient.getRecentAlerts(60, limit);
  }

  /**
   * Perform a single health check (used by daemon runner)
   */
  async performHealthCheck(): Promise<void> {
    const result = await this.healthChecker.performHealthCheck();

    // Convert to logs and store
    const logs = this.healthChecker.convertToLogs(result);
    if (logs.length > 0) {
      this.daemonClient.logHealthChecks(logs);
    }

    // Update last check timestamp
    this.daemonClient.updateLastCheck();
  }

  /**
   * Run daemon loop (used by daemon runner)
   */
  async runLoop(config: Partial<DaemonConfig> = {}): Promise<never> {
    const fullConfig: DaemonConfig = {
      ...DEFAULT_DAEMON_CONFIG,
      ...config,
    };

    // Mark as running
    this.daemonClient.markRunning();

    // Store config
    this.daemonClient.setState('check_interval', String(fullConfig.checkInterval));

    console.log(`Daemon started with ${fullConfig.checkInterval}s check interval`);

    // Main loop
    while (true) {
      try {
        console.log(`[${new Date().toISOString()}] Running health check...`);
        await this.performHealthCheck();
        console.log(`[${new Date().toISOString()}] Health check complete`);
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Health check error:`, error);
        this.daemonClient.markError(error instanceof Error ? error.message : String(error));
      }

      // Clean old logs periodically (every 24 hours worth of checks)
      const checksSinceClean = parseInt(this.daemonClient.getState('checks_since_clean') || '0', 10);
      if (checksSinceClean >= (86400 / fullConfig.checkInterval)) {
        const deleted = this.daemonClient.cleanOldLogs(fullConfig.retentionDays);
        console.log(`[${new Date().toISOString()}] Cleaned ${deleted} old log entries`);
        this.daemonClient.setState('checks_since_clean', '0');
      } else {
        this.daemonClient.setState('checks_since_clean', String(checksSinceClean + 1));
      }

      // Wait for next check
      await new Promise((resolve) => setTimeout(resolve, fullConfig.checkInterval * 1000));
    }
  }
}
