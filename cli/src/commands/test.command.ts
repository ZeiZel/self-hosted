import { Command } from 'commander';
import { INestApplicationContext } from '@nestjs/common';
import { spawn } from 'child_process';
import chalk from 'chalk';
import { logger } from '../utils/logger';

interface HelmTestResult {
  name: string;
  namespace: string;
  status: 'passed' | 'failed' | 'skipped';
  duration?: string;
  error?: string;
}

export function createTestCommand(app: INestApplicationContext): Command {
  const command = new Command('test');

  command
    .description('Run Helm tests for deployed services')
    .option('--all', 'Test all deployed services')
    .option('-s, --service <name>', 'Test specific service')
    .option('-n, --namespace <ns>', 'Filter by namespace')
    .option('--json', 'Output results as JSON')
    .option('--timeout <seconds>', 'Test timeout in seconds', parseInt, 300)
    .action(async (options) => {
      if (!options.all && !options.service) {
        logger.error('Please specify --all or --service <name>');
        logger.newLine();
        logger.log('Examples:');
        logger.log('  selfhost test --all');
        logger.log('  selfhost test --service traefik');
        logger.log('  selfhost test --namespace db');
        process.exit(1);
      }

      try {
        if (options.service) {
          // Test specific service
          const result = await runHelmTest(
            options.service,
            options.namespace,
            options.timeout,
          );

          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            displayResult(result);
          }

          if (result.status === 'failed') {
            process.exit(1);
          }
        } else {
          // Test all services
          const releases = await getHelmReleases(options.namespace);

          if (releases.length === 0) {
            logger.warn('No Helm releases found');
            return;
          }

          logger.header(`Running tests for ${releases.length} release(s)`);
          logger.newLine();

          const results: HelmTestResult[] = [];

          for (const release of releases) {
            const spinner = logger.spinner(`Testing ${release.name}...`).start();

            const result = await runHelmTest(
              release.name,
              release.namespace,
              options.timeout,
            );
            results.push(result);

            if (result.status === 'passed') {
              spinner.succeed(`${release.name}: ${chalk.green('passed')}`);
            } else if (result.status === 'failed') {
              spinner.fail(`${release.name}: ${chalk.red('failed')}`);
            } else {
              spinner.warn(`${release.name}: ${chalk.yellow('skipped')}`);
            }
          }

          if (options.json) {
            console.log(JSON.stringify(results, null, 2));
          } else {
            displaySummary(results);
          }

          const failed = results.filter((r) => r.status === 'failed');
          if (failed.length > 0) {
            process.exit(1);
          }
        }
      } catch (error) {
        logger.error('Test error:');
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // Add subcommands
  command.addCommand(createListSubcommand());

  return command;
}

/**
 * List available tests subcommand
 */
function createListSubcommand(): Command {
  return new Command('list')
    .description('List Helm releases that can be tested')
    .option('-n, --namespace <ns>', 'Filter by namespace')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const releases = await getHelmReleases(options.namespace);

        if (options.json) {
          console.log(JSON.stringify(releases, null, 2));
          return;
        }

        logger.header('Helm Releases');
        logger.newLine();

        if (releases.length === 0) {
          logger.log('  No releases found');
          return;
        }

        // Group by namespace
        const byNamespace = new Map<string, typeof releases>();
        for (const release of releases) {
          if (!byNamespace.has(release.namespace)) {
            byNamespace.set(release.namespace, []);
          }
          byNamespace.get(release.namespace)!.push(release);
        }

        for (const [namespace, nsReleases] of byNamespace) {
          logger.log(chalk.bold(`  ${namespace}/`));
          for (const release of nsReleases) {
            logger.log(`    ${release.name} (${release.chart})`);
          }
          logger.newLine();
        }

        logger.info(`Total: ${releases.length} releases`);
      } catch (error) {
        logger.error('Failed to list releases');
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

/**
 * Get Helm releases
 */
async function getHelmReleases(
  namespace?: string,
): Promise<Array<{ name: string; namespace: string; chart: string }>> {
  const args = ['list', '--all-namespaces', '-o', 'json'];

  if (namespace) {
    args.splice(1, 1, '-n', namespace);
  }

  const result = await runCommand('helm', args);

  if (!result.success) {
    throw new Error(`Failed to list releases: ${result.stderr}`);
  }

  try {
    const releases = JSON.parse(result.stdout);
    return releases.map((r: any) => ({
      name: r.name,
      namespace: r.namespace,
      chart: r.chart,
    }));
  } catch {
    return [];
  }
}

/**
 * Run Helm test for a release
 */
async function runHelmTest(
  releaseName: string,
  namespace?: string,
  timeout: number = 300,
): Promise<HelmTestResult> {
  const args = ['test', releaseName, `--timeout=${timeout}s`];

  if (namespace) {
    args.push('-n', namespace);
  }

  const startTime = Date.now();
  const result = await runCommand('helm', args);
  const duration = `${Math.round((Date.now() - startTime) / 1000)}s`;

  if (result.success) {
    return {
      name: releaseName,
      namespace: namespace || 'default',
      status: 'passed',
      duration,
    };
  }

  // Check if test was skipped (no test hooks)
  if (result.stderr.includes('no tests found') || result.stderr.includes('no test pods')) {
    return {
      name: releaseName,
      namespace: namespace || 'default',
      status: 'skipped',
    };
  }

  return {
    name: releaseName,
    namespace: namespace || 'default',
    status: 'failed',
    duration,
    error: result.stderr,
  };
}

/**
 * Display single test result
 */
function displayResult(result: HelmTestResult): void {
  logger.header('Test Result');
  logger.newLine();

  const statusIcon =
    result.status === 'passed'
      ? chalk.green('✓')
      : result.status === 'failed'
        ? chalk.red('✗')
        : chalk.yellow('○');

  const statusText =
    result.status === 'passed'
      ? chalk.green('PASSED')
      : result.status === 'failed'
        ? chalk.red('FAILED')
        : chalk.yellow('SKIPPED');

  logger.log(`  ${statusIcon} ${result.name} in ${result.namespace}`);
  logger.log(`    Status: ${statusText}`);

  if (result.duration) {
    logger.log(`    Duration: ${result.duration}`);
  }

  if (result.error) {
    logger.newLine();
    logger.log(chalk.red('  Error:'));
    logger.log(chalk.gray(`    ${result.error.replace(/\n/g, '\n    ')}`));
  }
}

/**
 * Display summary of all test results
 */
function displaySummary(results: HelmTestResult[]): void {
  logger.newLine();
  logger.header('Test Summary');
  logger.newLine();

  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;

  logger.log(`  ${chalk.green('Passed:')}  ${passed}`);
  logger.log(`  ${chalk.red('Failed:')}  ${failed}`);
  logger.log(`  ${chalk.yellow('Skipped:')} ${skipped}`);
  logger.newLine();

  if (failed > 0) {
    logger.log(chalk.red('  Failed tests:'));
    for (const result of results.filter((r) => r.status === 'failed')) {
      logger.log(`    - ${result.namespace}/${result.name}`);
      if (result.error) {
        logger.log(chalk.gray(`      ${result.error.split('\n')[0]}`));
      }
    }
    logger.newLine();
  }

  const totalIcon = failed > 0 ? chalk.red('✗') : chalk.green('✓');
  logger.log(`  ${totalIcon} Total: ${passed}/${results.length} passed`);
}

/**
 * Run a command and capture output
 */
function runCommand(
  command: string,
  args: string[],
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({
        success: code === 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });

    proc.on('error', (err) => {
      resolve({
        success: false,
        stdout: '',
        stderr: err.message,
      });
    });
  });
}
