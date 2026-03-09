import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import type { CliOptions } from './core';
import { createCli } from './cli';
import { Errors, CliError } from './shared/errors';

/**
 * Parse CLI options from command line arguments
 */
function parseCliOptions(): CliOptions {
   
  const args = process.argv;

  return {
    verbose: args.includes('--verbose'),
    noColor: args.includes('--no-color'),
    configPath: getArgValue(args, '--config'),
  };
}

/**
 * Get value of a CLI argument
 */
function getArgValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1 || index === args.length - 1) {
    return undefined;
  }
  return args[index + 1];
}

/**
 * Handle fatal error and exit
 */
function handleFatalError(error: unknown, verbose: boolean): never {
  const cliError = error instanceof CliError ? error : wrapModuleError(error, verbose);
   
  process.stderr.write(cliError.format(verbose) + '\n');
   
  process.exit(1);
}

/**
 * Wrap NestJS module initialization errors with better messages
 */
function wrapModuleError(error: unknown, verbose: boolean): CliError {
  const message = error instanceof Error ? error.message : String(error);

  // Common patterns in module errors
  if (message.includes('Not in a valid selfhost repository')) {
    return Errors.notInRepo();
  }

  if (message.includes('Configuration not loaded')) {
    return Errors.configNotLoaded();
  }

  if (message.includes('SQLITE') || message.includes('database')) {
    return Errors.databaseError(message, error instanceof Error ? error : undefined);
  }

  // Generic module error
  return new CliError('UNKNOWN' as any, 'Failed to initialize CLI', {
    details: verbose ? message : undefined,
    hint: verbose ? undefined : 'Run with --verbose for more details',
    cause: error instanceof Error ? error : undefined,
  });
}

/**
 * Bootstrap the CLI application
 */
async function bootstrap(): Promise<void> {
  // Parse CLI options early for error handling
  const cliOptions = parseCliOptions();

  try {
    // Check for Bun runtime
    if (typeof Bun === 'undefined') {
      throw new CliError('DEPENDENCY_ERROR' as any, 'This CLI requires Bun runtime', {
        hint: 'Please install Bun: https://bun.sh',
      });
    }

    // Create NestJS application context with configured modules
    const app = await NestFactory.createApplicationContext(AppModule.forRoot({ cliOptions }), {
      logger: false,
    });

    // Create and run CLI
    const cli = createCli(app);
     
    await cli.parseAsync(process.argv);

    // Clean up
    await app.close();
  } catch (error) {
    handleFatalError(error, cliOptions.verbose);
  }
}

// Run bootstrap
bootstrap();
