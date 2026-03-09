import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getVersion } from '../utils/version';
import { checkForUpdate, printUpdateNotification } from '../utils/update-checker';
import { GITHUB_INFO } from '../core/constants';

export function createUpdateCommand(): Command {
  const command = new Command('update');

  command
    .description('Check for CLI updates')
    .option('--json', 'Output as JSON')
    .action(async (options: { json?: boolean }) => {
      const currentVersion = getVersion();

      if (options.json) {
        const spinner = ora('Checking for updates...').start();
        const { hasUpdate, latestVersion } = await checkForUpdate();
        spinner.stop();

        console.log(
          JSON.stringify(
            {
              currentVersion,
              latestVersion,
              hasUpdate,
              installUrl: hasUpdate
                ? `https://raw.githubusercontent.com/${GITHUB_INFO.OWNER}/${GITHUB_INFO.REPO}/main/scripts/install.sh`
                : null,
            },
            null,
            2,
          ),
        );
        return;
      }

      console.log();
      console.log(chalk.bold('Selfhost CLI Update Check'));
      console.log();
      console.log(`${chalk.gray('Current version:')} ${chalk.cyan(currentVersion)}`);

      const spinner = ora('Checking for updates...').start();

      const { hasUpdate, latestVersion } = await checkForUpdate();

      if (latestVersion === null) {
        spinner.fail('Unable to check for updates');
        console.log(chalk.gray('Check your internet connection or try again later.'));
        return;
      }

      if (hasUpdate) {
        spinner.succeed('Update available!');
        printUpdateNotification(currentVersion, latestVersion);
      } else {
        spinner.succeed(`You're on the latest version (${chalk.green(currentVersion)})`);
      }
    });

  return command;
}
