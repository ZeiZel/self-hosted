import { Injectable, Inject, Optional } from '@nestjs/common';
import { INJECTION_TOKENS } from '../../core/constants';
import type { CliOptions } from '../../core/interfaces';
import { CliError, Errors } from './cli-error';

/**
 * Error handler service for consistent error processing
 */
@Injectable()
export class ErrorHandlerService {
  private verbose = false;
  private useColor = true;
  private jsonMode = false;

  constructor(
    @Optional()
    @Inject(INJECTION_TOKENS.CLI_OPTIONS)
    private readonly options?: CliOptions,
  ) {
    if (options) {
      this.verbose = options.verbose;
      this.useColor = !options.noColor;
    }
  }

  /**
   * Set JSON output mode
   */
  setJsonMode(enabled: boolean): void {
    this.jsonMode = enabled;
  }

  /**
   * Handle an error (format and print)
   */
  handle(error: unknown): void {
    const cliError = error instanceof CliError ? error : Errors.wrap(error);

    if (this.jsonMode) {
      // eslint-disable-next-line no-undef
      process.stdout.write(JSON.stringify(cliError.toJSON(), null, 2) + '\n');
    } else {
      // eslint-disable-next-line no-undef
      process.stderr.write(cliError.format(this.verbose, this.useColor) + '\n');
    }
  }

  /**
   * Handle error and exit
   */
  handleAndExit(error: unknown, exitCode = 1): never {
    this.handle(error);
    // eslint-disable-next-line no-undef
    process.exit(exitCode);
  }

  /**
   * Format error to string
   */
  format(error: unknown): string {
    const cliError = error instanceof CliError ? error : Errors.wrap(error);

    if (this.jsonMode) {
      return JSON.stringify(cliError.toJSON(), null, 2);
    }

    return cliError.format(this.verbose, this.useColor);
  }

  /**
   * Wrap async function with error handling
   */
  wrapAsync<T extends unknown[], R>(
    fn: (...args: T) => Promise<R>,
    context?: string,
  ): (...args: T) => Promise<R> {
    return async (...args: T) => {
      try {
        return await fn(...args);
      } catch (error) {
        throw Errors.wrap(error, context);
      }
    };
  }

  /**
   * Create error boundary for command execution
   */
  async executeWithErrorBoundary<T>(
    fn: () => Promise<T>,
    options?: { exitOnError?: boolean; context?: string },
  ): Promise<T | undefined> {
    try {
      return await fn();
    } catch (error) {
      const cliError = Errors.wrap(error, options?.context);

      if (options?.exitOnError !== false) {
        this.handleAndExit(cliError);
      } else {
        this.handle(cliError);
        return undefined;
      }
    }
  }
}
