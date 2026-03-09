import { Module, DynamicModule, Provider, Global } from '@nestjs/common';
import { MODULE_OPTIONS } from '../core/constants';
import type {
  DatabaseModuleOptions,
  AsyncModuleOptions,
  ModuleOptionsFactory,
} from '../core/interfaces';
import { DatabaseService } from './database.service';
import { MachineRepository } from './repositories/machine.repository';
import { DeploymentRepository } from './repositories/deployment.repository';
import { MetricRepository } from './repositories/metric.repository';
import { ServiceConfigRepository } from './repositories/service-config.repository';

/**
 * Database module providing SQLite connection and repositories
 * Use forRoot() or forRootAsync() to configure
 */
@Global()
@Module({})
export class DatabaseModule {
  /**
   * Synchronous configuration
   */
  static forRoot(options: DatabaseModuleOptions): DynamicModule {
    const providers = this.createProviders(options);

    return {
      module: DatabaseModule,
      providers,
      exports: providers,
    };
  }

  /**
   * Asynchronous configuration (for dependency injection)
   */
  static forRootAsync(options: AsyncModuleOptions<DatabaseModuleOptions>): DynamicModule {
    const providers = this.createAsyncProviders(options);

    return {
      module: DatabaseModule,
      imports: options.imports ?? [],
      providers: [
        ...providers,
        DatabaseService,
        MachineRepository,
        DeploymentRepository,
        MetricRepository,
        ServiceConfigRepository,
      ],
      exports: [
        DatabaseService,
        MachineRepository,
        DeploymentRepository,
        MetricRepository,
        ServiceConfigRepository,
      ],
    };
  }

  /**
   * Create providers for sync configuration
   */
  private static createProviders(options: DatabaseModuleOptions): Provider[] {
    return [
      {
        provide: MODULE_OPTIONS.DATABASE,
        useValue: options,
      },
      DatabaseService,
      MachineRepository,
      DeploymentRepository,
      MetricRepository,
      ServiceConfigRepository,
    ];
  }

  /**
   * Create providers for async configuration
   */
  private static createAsyncProviders(
    options: AsyncModuleOptions<DatabaseModuleOptions>,
  ): Provider[] {
    if (options.useFactory) {
      return [
        {
          provide: MODULE_OPTIONS.DATABASE,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
      ];
    }

    if (options.useClass) {
      return [
        {
          provide: MODULE_OPTIONS.DATABASE,
          useFactory: async (factory: ModuleOptionsFactory<DatabaseModuleOptions>) => {
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
          provide: MODULE_OPTIONS.DATABASE,
          useFactory: async (factory: ModuleOptionsFactory<DatabaseModuleOptions>) => {
            return factory.createOptions();
          },
          inject: [options.useExisting],
        },
      ];
    }

    return [];
  }
}
