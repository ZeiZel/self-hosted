import { INestApplicationContext } from '@nestjs/common';
import { Errors, CliError, printErrorAndExit } from './errors';

/**
 * Safely get a service from the NestJS application context
 */
export function getService<T>(
  app: INestApplicationContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClass: new (...args: any[]) => T,
): T {
  try {
    return app.get(serviceClass);
  } catch (error) {
    throw Errors.wrap(error, `Failed to get service ${serviceClass.name}`);
  }
}

/**
 * Wrap a command action with error handling
 */
export function withErrorHandling<T extends unknown[]>(
  action: (...args: T) => Promise<void>,
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await action(...args);
    } catch (error) {
      printErrorAndExit(error);
    }
  };
}

/**
 * Create an action handler with automatic service injection and error handling
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createCommandAction<TServices extends Record<string, new (...args: any[]) => any>>(
  app: INestApplicationContext,
  serviceClasses: TServices,
  handler: (
    services: { [K in keyof TServices]: InstanceType<TServices[K]> },
    options: Record<string, unknown>,
    ...args: string[]
  ) => Promise<void>,
): (options: Record<string, unknown>, ...args: string[]) => Promise<void> {
  return async (options: Record<string, unknown>, ...args: string[]) => {
    try {
      // Inject all services
      const services = {} as { [K in keyof TServices]: InstanceType<TServices[K]> };
      for (const [key, serviceClass] of Object.entries(serviceClasses)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        services[key as keyof TServices] = getService(app, serviceClass as any) as InstanceType<
          TServices[keyof TServices]
        >;
      }

      await handler(services, options, ...args);
    } catch (error) {
      // Handle JSON output mode - return error as JSON
      if (options.json) {
        const cliError = error instanceof CliError ? error : Errors.wrap(error);
         
        process.stdout.write(
          JSON.stringify(
            {
              error: true,
              type: cliError.type,
              message: cliError.message,
              hint: cliError.hint,
              details: cliError.details,
            },
            null,
            2,
          ) + '\n',
        );
         
        process.exit(1);
      } else {
        printErrorAndExit(error);
      }
    }
  };
}

/**
 * Require that the CLI is in a valid repository
 */
export function requireRepo(configService: { hasValidRepo(): boolean }): void {
  if (!configService.hasValidRepo()) {
    throw Errors.notInRepo();
  }
}

/**
 * Require that the CLI is initialized
 */
export function requireInitialized(configService: { isInitialized(): boolean }): void {
  if (!configService.isInitialized()) {
    throw Errors.notInitialized();
  }
}
