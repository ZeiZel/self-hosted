/**
 * Standalone daemon runner for Docker container
 * This is the entry point when running in a container
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { join } from 'path';
import { homedir } from 'os';
import { DatabaseModule } from '../database/database.module';
import { SharedModule } from '../shared/shared.module';
import { CoreModule } from '../core/core.module';
import { MonitorModule } from '../modules/monitor/monitor.module';
import { ConfigModule } from '../modules/config/config.module';
import { TelegramModule } from '../telegram/telegram.module';
import { DaemonService } from './daemon.service';
import { HealthCheckerService } from './health-checker.service';
import { DaemonClientService } from './daemon-client.service';
import { DaemonInitService } from './daemon-init.service';
import { MetricsCollectorService } from './collectors/metrics-collector.service';
import { DaemonHttpServer } from './http/daemon-server';
import { DEFAULT_DAEMON_CONFIG } from './interfaces/daemon.interface';
import { TelegramBotService } from '../telegram/telegram-bot.service';

/**
 * Minimal module for daemon runner
 */
@Module({
  imports: [
    CoreModule.forRoot({ verbose: false, noColor: false }),
    SharedModule,
    ConfigModule.forRoot({
      baseDir: process.env.DATA_DIR || join(homedir(), '.selfhosted'),
      repoRoot: undefined,
    }),
    DatabaseModule.forRootAsync({
      useFactory: () => ({
        filename: join(process.env.DATA_DIR || join(homedir(), '.selfhosted'), 'selfhosted.db'),
      }),
    }),
    MonitorModule,
    TelegramModule,
  ],
  providers: [
    HealthCheckerService,
    DaemonClientService,
    DaemonInitService,
    DaemonService,
    MetricsCollectorService,
    DaemonHttpServer,
  ],
})
class DaemonRunnerModule {}

/**
 * Parse environment configuration
 */
function getConfig() {
  return {
    checkInterval: parseInt(process.env.CHECK_INTERVAL || '60', 10),
    metricsInterval: parseInt(process.env.METRICS_INTERVAL || '5', 10),
    dataDir: process.env.DATA_DIR || join(homedir(), '.selfhosted'),
    retentionDays: parseInt(process.env.RETENTION_DAYS || '7', 10),
    kubeconfig: process.env.KUBECONFIG,
    httpPort: parseInt(process.env.HTTP_PORT || '8765', 10),
    httpHost: process.env.HTTP_HOST || '127.0.0.1',
  };
}

/**
 * Main entry point
 */
async function main() {
  const config = getConfig();

  console.log('='.repeat(50));
  console.log('Selfhost Daemon Starting');
  console.log('='.repeat(50));
  console.log(`Check Interval: ${config.checkInterval}s`);
  console.log(`Metrics Interval: ${config.metricsInterval}s`);
  console.log(`Data Directory: ${config.dataDir}`);
  console.log(`Retention Days: ${config.retentionDays}`);
  console.log(`Kubeconfig: ${config.kubeconfig || 'default'}`);
  console.log(`HTTP Server: http://${config.httpHost}:${config.httpPort}`);
  console.log('='.repeat(50));

  try {
    // Create NestJS application
    const app = await NestFactory.createApplicationContext(DaemonRunnerModule, {
      logger: ['error', 'warn'],
    });

    // Get services
    const daemonService = app.get(DaemonService);
    const metricsCollector = app.get(MetricsCollectorService);
    const httpServer = app.get(DaemonHttpServer);

    // Start Telegram bot for receiving commands
    const telegramBot = app.get(TelegramBotService);
    await telegramBot.start();

    // Start metrics collector (faster interval for real-time updates)
    metricsCollector.startCollection(config.metricsInterval * 1000);

    // Start HTTP server for TUI connections
    await httpServer.start({
      port: config.httpPort,
      host: config.httpHost,
    });

    // Handle shutdown signals
    const shutdown = async () => {
      console.log('\nShutdown signal received');
      metricsCollector.stopCollection();
      await httpServer.stop();
      await app.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Run the daemon loop (never returns)
    await daemonService.runLoop({
      ...DEFAULT_DAEMON_CONFIG,
      checkInterval: config.checkInterval,
      retentionDays: config.retentionDays,
    });
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run
main();
