import { Module, DynamicModule } from '@nestjs/common';
import { join } from 'path';
import { homedir } from 'os';
import { CoreModule, PATHS } from './core';
import type { CliOptions } from './core';
import { ConfigModule, ConfigService } from './modules/config';
import { DatabaseModule } from './database';
import { SharedModule } from './shared';
import { InventoryModule } from './modules/inventory';
import { ServicesModule } from './modules/services';
import { HostModule } from './modules/host';
import { UiModule } from './modules/ui';
import { BalancingModule } from './modules/balancing';
import { MonitorModule } from './modules/monitor';
import { DaemonModule } from './daemon';
import { TelegramModule } from './telegram';
import { findRepoRoot } from './utils/paths';

/**
 * Application module options
 */
export interface AppModuleOptions {
  cliOptions: CliOptions;
}

/**
 * Root application module
 * Uses forRoot pattern to configure all modules
 */
@Module({})
export class AppModule {
  /**
   * Create configured application module
   */
  static forRoot(options: AppModuleOptions): DynamicModule {
    const baseDir = join(homedir(), PATHS.BASE_DIR);
    const repoRoot = findRepoRoot() ?? undefined;

    return {
      module: AppModule,
      imports: [
        // Core module with CLI options
        CoreModule.forRoot(options.cliOptions),

        // Shared utilities (logger, error handler)
        SharedModule,

        // Configuration module
        ConfigModule.forRoot({
          baseDir,
          repoRoot,
        }),

        // Database module with async configuration
        DatabaseModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => ({
            filename: configService.getDatabasePath(),
          }),
        }),

        // Feature modules
        InventoryModule,
        ServicesModule,
        HostModule,
        UiModule,
        BalancingModule,
        MonitorModule,
        DaemonModule,
        TelegramModule,
      ],
    };
  }
}
