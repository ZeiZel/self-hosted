import chalk from 'chalk';

/**
 * CLI error types for structured error handling
 */
export enum CliErrorType {
  NOT_IN_REPO = 'NOT_IN_REPO',
  NOT_INITIALIZED = 'NOT_INITIALIZED',
  CONFIG_ERROR = 'CONFIG_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  SERVICE_ERROR = 'SERVICE_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  PERMISSION_ERROR = 'PERMISSION_ERROR',
  DEPENDENCY_ERROR = 'DEPENDENCY_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Custom CLI error with user-friendly messages
 */
export class CliError extends Error {
  public readonly type: CliErrorType;
  public readonly hint?: string;
  public readonly details?: string;

  constructor(
    type: CliErrorType,
    message: string,
    options?: { hint?: string; details?: string; cause?: Error }
  ) {
    super(message);
    this.name = 'CliError';
    this.type = type;
    this.hint = options?.hint;
    this.details = options?.details;
    if (options?.cause) {
      this.cause = options.cause;
    }
  }

  /**
   * Format error for console output
   */
  format(verbose = false, useColor = true): string {
    const lines: string[] = [];
    const color = useColor ? chalk : { red: { bold: (s: string) => s }, gray: (s: string) => s, yellow: (s: string) => s };

    // Error header
    lines.push(color.red.bold(`Error: ${this.message}`));

    // Details
    if (this.details) {
      lines.push(color.gray(`\n  ${this.details}`));
    }

    // Hint
    if (this.hint) {
      lines.push(color.yellow(`\n  Hint: ${this.hint}`));
    }

    // Stack trace in verbose mode
    if (verbose && this.stack) {
      lines.push(color.gray('\n  Stack trace:'));
      const stackLines = this.stack.split('\n').slice(1, 6);
      stackLines.forEach((line) => {
        lines.push(color.gray(`    ${line.trim()}`));
      });
    }

    return lines.join('\n');
  }

  /**
   * Convert to JSON for --json output mode
   */
  toJSON(): Record<string, unknown> {
    return {
      error: true,
      type: this.type,
      message: this.message,
      hint: this.hint,
      details: this.details,
    };
  }
}

/**
 * Pre-defined error factories for common scenarios
 */
export const Errors = {
  notInRepo(): CliError {
    return new CliError(
      CliErrorType.NOT_IN_REPO,
      'Not in a valid selfhost repository',
      {
        hint: 'Run this command from the repository root (directory containing kubernetes/ and ansible/)',
        details: 'The CLI looks for kubernetes/, ansible/, and CLAUDE.md in the current or parent directories.',
      }
    );
  },

  notInitialized(): CliError {
    return new CliError(
      CliErrorType.NOT_INITIALIZED,
      'CLI is not initialized',
      {
        hint: 'Run `selfhost init` first to initialize the project',
        details: 'The init command sets up configuration and prepares the project for deployment.',
      }
    );
  },

  configNotLoaded(): CliError {
    return new CliError(
      CliErrorType.CONFIG_ERROR,
      'Configuration could not be loaded',
      {
        hint: 'Check that ~/.selfhosted directory exists and is writable',
        details: 'The CLI stores its configuration in ~/.selfhosted/config.yaml',
      }
    );
  },

  databaseError(message: string, cause?: Error): CliError {
    return new CliError(
      CliErrorType.DATABASE_ERROR,
      `Database error: ${message}`,
      {
        hint: 'Check that the database file is not corrupted or locked',
        cause,
      }
    );
  },

  noMachinesConfigured(): CliError {
    return new CliError(
      CliErrorType.CONFIG_ERROR,
      'No machines configured in inventory',
      {
        hint: 'Run `selfhost inventory add` to add machines to your cluster',
      }
    );
  },

  noServicesSelected(): CliError {
    return new CliError(
      CliErrorType.CONFIG_ERROR,
      'No services selected for deployment',
      {
        hint: 'Run `selfhost services select` to choose which services to deploy',
      }
    );
  },

  machineNotFound(identifier: string): CliError {
    return new CliError(
      CliErrorType.CONFIG_ERROR,
      `Machine not found: ${identifier}`,
      {
        hint: 'Run `selfhost inventory list` to see available machines',
      }
    );
  },

  serviceNotFound(name: string): CliError {
    return new CliError(
      CliErrorType.CONFIG_ERROR,
      `Service not found: ${name}`,
      {
        hint: 'Run `selfhost services list` to see available services',
      }
    );
  },

  validationFailed(errors: string[]): CliError {
    return new CliError(
      CliErrorType.VALIDATION_ERROR,
      'Validation failed',
      {
        details: errors.map((e) => `  - ${e}`).join('\n'),
        hint: 'Fix the errors above and try again',
      }
    );
  },

  dependencyMissing(dependency: string): CliError {
    return new CliError(
      CliErrorType.DEPENDENCY_ERROR,
      `Required dependency not found: ${dependency}`,
      {
        hint: 'Ensure all required tools are installed and in PATH',
      }
    );
  },

  permissionDenied(resource: string): CliError {
    return new CliError(
      CliErrorType.PERMISSION_ERROR,
      `Permission denied: ${resource}`,
      {
        hint: 'Check file/directory permissions or run with appropriate privileges',
      }
    );
  },

  networkError(operation: string, cause?: Error): CliError {
    return new CliError(
      CliErrorType.NETWORK_ERROR,
      `Network error during: ${operation}`,
      {
        hint: 'Check your network connection and try again',
        details: cause?.message,
        cause,
      }
    );
  },

  wrap(error: unknown, context?: string): CliError {
    if (error instanceof CliError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const contextPrefix = context ? `${context}: ` : '';

    // Try to identify common error patterns
    if (message.includes('Not in a valid selfhost repository')) {
      return Errors.notInRepo();
    }
    if (message.includes('Configuration not loaded')) {
      return Errors.configNotLoaded();
    }
    if (message.includes('SQLITE') || message.includes('database')) {
      return Errors.databaseError(message, error instanceof Error ? error : undefined);
    }
    if (message.includes('ENOENT')) {
      return new CliError(
        CliErrorType.CONFIG_ERROR,
        `${contextPrefix}File or directory not found`,
        {
          details: message,
          cause: error instanceof Error ? error : undefined,
        }
      );
    }
    if (message.includes('EACCES') || message.includes('permission denied')) {
      return new CliError(
        CliErrorType.PERMISSION_ERROR,
        `${contextPrefix}Permission denied`,
        {
          details: message,
          cause: error instanceof Error ? error : undefined,
        }
      );
    }
    if (message.includes('ECONNREFUSED') || message.includes('ETIMEDOUT')) {
      return Errors.networkError(context ?? 'operation', error instanceof Error ? error : undefined);
    }

    return new CliError(
      CliErrorType.UNKNOWN,
      `${contextPrefix}${message}`,
      {
        cause: error instanceof Error ? error : undefined,
      }
    );
  },
};
