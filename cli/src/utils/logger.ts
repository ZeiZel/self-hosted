import chalk from 'chalk';
import ora, { Ora } from 'ora';

export class Logger {
  private verbose = false;

  setVerbose(verbose: boolean): void {
    this.verbose = verbose;
  }

  info(message: string, ...args: unknown[]): void {
    console.log(chalk.blue('ℹ'), message, ...args);
  }

  success(message: string, ...args: unknown[]): void {
    console.log(chalk.green('✔'), message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    console.log(chalk.yellow('⚠'), message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    console.error(chalk.red('✖'), message, ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.verbose) {
      console.log(chalk.gray('⋯'), chalk.gray(message), ...args);
    }
  }

  log(message: string, ...args: unknown[]): void {
    console.log(message, ...args);
  }

  newLine(): void {
    console.log();
  }

  header(title: string): void {
    this.newLine();
    console.log(chalk.bold.cyan('═'.repeat(60)));
    console.log(chalk.bold.cyan(`  ${title}`));
    console.log(chalk.bold.cyan('═'.repeat(60)));
    this.newLine();
  }

  subHeader(title: string): void {
    console.log(chalk.bold.white(`\n▸ ${title}`));
  }

  spinner(text: string): Ora {
    return ora({
      text,
      spinner: 'dots',
    });
  }

  table(data: string[][]): void {
    data.forEach((row) => {
      console.log('  ' + row.join('  '));
    });
  }

  list(items: string[], bullet = '•'): void {
    items.forEach((item) => {
      console.log(`  ${chalk.gray(bullet)} ${item}`);
    });
  }

  keyValue(pairs: Record<string, string | number | boolean>): void {
    const maxKeyLength = Math.max(...Object.keys(pairs).map((k) => k.length));
    Object.entries(pairs).forEach(([key, value]) => {
      const paddedKey = key.padEnd(maxKeyLength);
      console.log(`  ${chalk.gray(paddedKey)}  ${chalk.white(String(value))}`);
    });
  }

  box(lines: string[], title?: string): void {
    const maxLength = Math.max(...lines.map((l) => l.length), title?.length ?? 0);
    const border = '─'.repeat(maxLength + 2);

    if (title) {
      console.log(chalk.gray(`┌─ ${title} ${'─'.repeat(maxLength - title.length)}┐`));
    } else {
      console.log(chalk.gray(`┌${border}┐`));
    }

    lines.forEach((line) => {
      const padding = ' '.repeat(maxLength - line.length);
      console.log(chalk.gray('│') + ` ${line}${padding} ` + chalk.gray('│'));
    });

    console.log(chalk.gray(`└${border}┘`));
  }

  progressBar(current: number, total: number, width = 40): string {
    const percentage = current / total;
    const filled = Math.round(width * percentage);
    const empty = width - filled;
    const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
    const percent = Math.round(percentage * 100);
    return `${bar} ${percent}%`;
  }
}

// Singleton instance
export const logger = new Logger();
