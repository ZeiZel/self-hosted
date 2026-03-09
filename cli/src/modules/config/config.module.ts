import { Module, DynamicModule, Provider, Global } from '@nestjs/common';
import { MODULE_OPTIONS } from '../../core/constants';
import type { ConfigModuleOptions, AsyncModuleOptions, ModuleOptionsFactory } from '../../core/interfaces';
import { ConfigService } from './config.service';

/**
 * Configuration module providing CLI configuration management
 * Use forRoot() or forRootAsync() to configure
 */
@Global()
@Module({})
export class ConfigModule {
  /**
   * Synchronous configuration
   */
  static forRoot(options: ConfigModuleOptions): DynamicModule {
    const providers: Provider[] = [
      {
        provide: MODULE_OPTIONS.CONFIG,
        useValue: options,
      },
      ConfigService,
    ];

    return {
      module: ConfigModule,
      providers,
      exports: [ConfigService],
    };
  }

  /**
   * Asynchronous configuration (for dependency injection)
   */
  static forRootAsync(options: AsyncModuleOptions<ConfigModuleOptions>): DynamicModule {
    const providers = this.createAsyncProviders(options);

    return {
      module: ConfigModule,
      imports: options.imports ?? [],
      providers: [...providers, ConfigService],
      exports: [ConfigService],
    };
  }

  /**
   * Create providers for async configuration
   */
  private static createAsyncProviders(
    options: AsyncModuleOptions<ConfigModuleOptions>,
  ): Provider[] {
    if (options.useFactory) {
      return [
        {
          provide: MODULE_OPTIONS.CONFIG,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
      ];
    }

    if (options.useClass) {
      return [
        {
          provide: MODULE_OPTIONS.CONFIG,
          useFactory: async (factory: ModuleOptionsFactory<ConfigModuleOptions>) => {
            return factory.createOptions();
          },
          inject: [options.useClass],
        },
        {
          provide: options.useClass,
          useClass: options.useClass,
        },
      ];
    }

    if (options.useExisting) {
      return [
        {
          provide: MODULE_OPTIONS.CONFIG,
          useFactory: async (factory: ModuleOptionsFactory<ConfigModuleOptions>) => {
            return factory.createOptions();
          },
          inject: [options.useExisting],
        },
      ];
    }

    return [];
  }
}
