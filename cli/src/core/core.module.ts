import { Global, Module, DynamicModule, Provider } from '@nestjs/common';
import { INJECTION_TOKENS } from './constants';
import { CliOptions } from './interfaces';

/**
 * Core module provides global configuration and utilities
 * Use forRoot() to initialize with CLI options
 */
@Global()
@Module({})
export class CoreModule {
  /**
   * Initialize core module with CLI options
   */
  static forRoot(options: CliOptions): DynamicModule {
    const providers: Provider[] = [
      {
        provide: INJECTION_TOKENS.CLI_OPTIONS,
        useValue: options,
      },
    ];

    return {
      module: CoreModule,
      providers,
      exports: providers,
    };
  }
}
