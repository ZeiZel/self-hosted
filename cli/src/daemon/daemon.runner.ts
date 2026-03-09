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
import { DaemonService } from './daemon.service';
import { HealthCheckerService } from './health-checker.service';
import { DaemonClientService } from './daemon-client.service';
import { DaemonInitService } from './daemon-init.service';
import { DEFAULT_DAEMON_CONFIG } from './interfaces/daemon.interface';

/**
 * Minimal module for daemon runner
 */
@Module({
  imports: [
    CoreModule.forRoot({ verbose: false, noColor: false }),
    SharedModule,
    ConfigModule.forRoot({
      baseDir: process.env.DATA_DIR || join(homedir(), '.selfhost'),
      repoRoot: undefined,
    }),
    DatabaseModule.forRootAsync({
      useFactory: () => ({
        filename: join(process.env.DATA_DIR || join(homedir(), '.selfhost'), 'selfhost.db'),
      }),
    }),
    MonitorModule,
  ],
  providers: [HealthCheckerService, DaemonClientService, DaemonInitService, DaemonService],
})
class DaemonRunnerModule {}

/**
 * Parse environment configuration
 */
function getConfig() {
  return {
    checkInterval: parseInt(process.env.CHECK_INTERVAL || '60', 10),
    dataDir: process.env.DATA_DIR || join(homedir(), '.selfhost'),
    retentionDays: parseInt(process.env.RETENTION_DAYS || '7', 10),
    kubeconfig: process.env.KUBECONFIG,
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
  console.log(`Data Directory: ${config.dataDir}`);
  console.log(`Retention Days: ${config.retentionDays}`);
  console.log(`Kubeconfig: ${config.kubeconfig || 'default'}`);
  console.log('='.repeat(50));

  try {
    // Create NestJS application
    const app = await NestFactory.createApplicationContext(DaemonRunnerModule, {
      logger: ['error', 'warn'],
    });

    // Get daemon service
    const daemonService = app.get(DaemonService);

    // Handle shutdown signals
    const shutdown = async () => {
      console.log('\nShutdown signal received');
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
