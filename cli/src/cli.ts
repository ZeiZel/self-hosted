import { Command } from 'commander';
import { INestApplicationContext } from '@nestjs/common';
import { createInitCommand } from './commands/init.command';
import { createInventoryCommand } from './commands/inventory.command';
import { createServicesCommand } from './commands/services.command';
import { createPlanCommand } from './commands/plan.command';
import { createDeployCommand } from './commands/deploy.command';
import { createStatusCommand } from './commands/status.command';
import { createValidateCommand } from './commands/validate.command';
import { createConfigCommand } from './commands/config.command';
import { createBalanceCommand } from './commands/balance.command';
import { createMonitorCommand } from './commands/monitor.command';
import chalk from 'chalk';

const VERSION = '1.0.0';

const BANNER = `
${chalk.cyan('╔═══════════════════════════════════════════════════════════╗')}
${chalk.cyan('║')}  ${chalk.bold.white('selfhost')} - Self-Hosted Infrastructure Deployment CLI  ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.gray('Automated Kubernetes cluster & services deployment')}    ${chalk.cyan('║')}
${chalk.cyan('╚═══════════════════════════════════════════════════════════╝')}
`;

export function createCli(app: INestApplicationContext): Command {
  const program = new Command();

  program
    .name('selfhost')
    .description('CLI tool for automated self-hosted infrastructure deployment')
    .version(VERSION, '-v, --version', 'Display version number')
    .addHelpText('beforeAll', BANNER)
    .configureHelp({
      sortSubcommands: true,
      sortOptions: true,
    });

  // Global options
  program
    .option('--no-color', 'Disable colored output')
    .option('--verbose', 'Enable verbose output')
    .option('--config <path>', 'Path to configuration file');

  // Register commands
  program.addCommand(createInitCommand(app));
  program.addCommand(createInventoryCommand(app));
  program.addCommand(createServicesCommand(app));
  program.addCommand(createPlanCommand(app));
  program.addCommand(createDeployCommand(app));
  program.addCommand(createStatusCommand(app));
  program.addCommand(createValidateCommand(app));
  program.addCommand(createConfigCommand(app));
  program.addCommand(createBalanceCommand(app));
  program.addCommand(createMonitorCommand(app));

  // Default action (no command)
  program.action(() => {
    // eslint-disable-next-line no-undef
    console.log(BANNER);
    program.help();
  });

  return program;
}
