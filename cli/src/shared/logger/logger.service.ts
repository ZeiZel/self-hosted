import { Injectable, Inject, Optional } from '@nestjs/common';
import chalk from 'chalk';
import ora, { Ora } from 'ora';
import { INJECTION_TOKENS } from '../../core/constants';
import type { CliOptions } from '../../core/interfaces';

/**
 * Logger service for CLI output
 */
@Injectable()
export class LoggerService {
  private verbose = false;
  private colorEnabled = true;

  constructor(
    @Optional()
    @Inject(INJECTION_TOKENS.CLI_OPTIONS)
    private readonly options?: CliOptions,
  ) {
    if (options) {
      this.verbose = options.verbose;
      this.colorEnabled = !options.noColor;
    }
  }

  /**
   * Set verbose mode
   */
  setVerbose(verbose: boolean): void {
    this.verbose = verbose;
  }

  /**
   * Set color mode
   */
  setColorEnabled(enabled: boolean): void {
    this.colorEnabled = enabled;
  }

  /**
   * Apply color if enabled
   */
  private color<T>(fn: (text: string) => string, text: string): string {
    return this.colorEnabled ? fn(text) : text;
  }

  /**
   * Log info message
   */
  info(message: string, ...args: unknown[]): void {
    const prefix = this.color(chalk.blue, 'ℹ');
    console.log(prefix, message, ...args);
  }

  /**
   * Log success message
   */
  success(message: string, ...args: unknown[]): void {
    const prefix = this.color(chalk.green, '✔');
    console.log(prefix, message, ...args);
  }

  /**
   * Log warning message
   */
  warn(message: string, ...args: unknown[]): void {
    const prefix = this.color(chalk.yellow, '⚠');
    console.log(prefix, message, ...args);
  }

  /**
   * Log error message
   */
  error(message: string, ...args: unknown[]): void {
    const prefix = this.color(chalk.red, '✖');
    console.error(prefix, message, ...args);
  }

  /**
   * Log debug message (only in verbose mode)
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.verbose) {
      const prefix = this.color(chalk.gray, '⋯');
      console.log(prefix, this.color(chalk.gray, message), ...args);
    }
  }

  /**
   * Log raw message
   */
  log(message: string, ...args: unknown[]): void {
    console.log(message, ...args);
  }

  /**
   * Print new line
   */
  newLine(): void {
    console.log();
  }

  /**
   * Print header
   */
  header(title: string): void {
    this.newLine();
    const border = '═'.repeat(60);
    console.log(this.color(chalk.bold.cyan, border));
    console.log(this.color(chalk.bold.cyan, `  ${title}`));
    console.log(this.color(chalk.bold.cyan, border));
    this.newLine();
  }

  /**
   * Print sub-header
   */
  subHeader(title: string): void {
    console.log(this.color(chalk.bold.white, `\n▸ ${title}`));
  }

  /**
   * Create spinner
   */
  spinner(text: string): Ora {
    return ora({
      text,
      spinner: 'dots',
      color: this.colorEnabled ? 'cyan' : undefined,
    });
  }

  /**
   * Print list
   */
  list(items: string[], bullet = '•'): void {
    items.forEach((item) => {
      console.log(`  ${this.color(chalk.gray, bullet)} ${item}`);
    });
  }

  /**
   * Print key-value pairs
   */
  keyValue(pairs: Record<string, string | number | boolean>): void {
    const maxKeyLength = Math.max(...Object.keys(pairs).map((k) => k.length));
    Object.entries(pairs).forEach(([key, value]) => {
      const paddedKey = key.padEnd(maxKeyLength);
      console.log(
        `  ${this.color(chalk.gray, paddedKey)}  ${this.color(chalk.white, String(value))}`,
      );
    });
  }

  /**
   * Print box
   */
  box(lines: string[], title?: string): void {
    const maxLength = Math.max(...lines.map((l) => l.length), title?.length ?? 0);
    const border = '─'.repeat(maxLength + 2);

    if (title) {
      console.log(this.color(chalk.gray, `┌─ ${title} ${'─'.repeat(maxLength - title.length)}┐`));
    } else {
      console.log(this.color(chalk.gray, `┌${border}┐`));
    }

    lines.forEach((line) => {
      const padding = ' '.repeat(maxLength - line.length);
      console.log(
        this.color(chalk.gray, '│') + ` ${line}${padding} ` + this.color(chalk.gray, '│'),
      );
    });

    console.log(this.color(chalk.gray, `└${border}┘`));
  }

  /**
   * Create progress bar string
   */
  progressBar(current: number, total: number, width = 40): string {
    const percentage = current / total;
    const filled = Math.round(width * percentage);
    const empty = width - filled;
    const bar =
      this.color(chalk.green, '█'.repeat(filled)) + this.color(chalk.gray, '░'.repeat(empty));
    const percent = Math.round(percentage * 100);
    return `${bar} ${percent}%`;
  }
}
