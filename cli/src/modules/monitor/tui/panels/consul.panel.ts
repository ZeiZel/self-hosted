import chalk from 'chalk';
import { ConsulState, ConsulService } from '../../apis/interfaces/api.interface';

/**
 * Render Consul panel content
 */
export function renderConsulPanel(
  state: ConsulState | undefined,
  selectedIndex: number = -1,
  width: number = 40,
): string[] {
  const lines: string[] = [];
  const innerWidth = width - 4;

  lines.push(chalk.bold.cyan(' CONSUL '));
  lines.push(chalk.gray('─'.repeat(innerWidth)));

  if (!state) {
    lines.push(chalk.gray('  Loading...'));
    return lines;
  }

  if (!state.available) {
    lines.push(chalk.red('  Unavailable'));
    lines.push(chalk.gray('  Cannot connect to Consul'));
    return lines;
  }

  // Leader status
  const leaderStatus = state.leader
    ? chalk.green(`● Leader: ${state.leader}`)
    : chalk.yellow('○ No leader elected');
  lines.push(`  ${leaderStatus}`);
  lines.push('');

  // Service counts
  const totalServices = state.services.length;
  const passingServices = state.services.filter((s) => s.status === 'passing').length;
  const warningServices = state.services.filter((s) => s.status === 'warning').length;
  const criticalServices = state.services.filter((s) => s.status === 'critical').length;

  lines.push(chalk.bold('  Services:'));
  lines.push(
    `    ${chalk.green(String(passingServices))} passing, ` +
      `${chalk.yellow(String(warningServices))} warning, ` +
      `${chalk.red(String(criticalServices))} critical`,
  );
  lines.push('');

  // Health checks summary
  if (state.failingChecks > 0) {
    lines.push(chalk.red(`  ⚠ ${state.failingChecks} failing health checks`));
    lines.push('');
  }

  // List services
  lines.push(chalk.bold('  Registered Services:'));
  lines.push(chalk.gray('─'.repeat(innerWidth)));

  if (state.services.length === 0) {
    lines.push(chalk.gray('    No services registered'));
  } else {
    for (let i = 0; i < Math.min(state.services.length, 10); i++) {
      const service = state.services[i];
      const isSelected = i === selectedIndex;
      const prefix = isSelected ? chalk.cyan('  ▶ ') : '    ';
      const icon = getServiceIcon(service.status);

      const line = `${prefix}${icon} ${service.name}`;
      lines.push(isSelected ? chalk.bold(line) : line);

      if (service.address && service.port) {
        lines.push(chalk.gray(`      ${service.address}:${service.port}`));
      }
    }

    if (state.services.length > 10) {
      lines.push(chalk.gray(`    ... and ${state.services.length - 10} more`));
    }
  }

  return lines;
}

/**
 * Render compact Consul summary
 */
export function renderConsulSummary(state: ConsulState | undefined): string {
  if (!state || !state.available) {
    return chalk.gray('Consul: unavailable');
  }

  const total = state.services.length;
  const failing = state.failingChecks;

  if (failing > 0) {
    return `Consul: ${chalk.red(`${failing} failing`)} / ${total} services`;
  }

  return `Consul: ${chalk.green('healthy')} (${total} services)`;
}

/**
 * Get service status icon
 */
function getServiceIcon(status: ConsulService['status']): string {
  switch (status) {
    case 'passing':
      return chalk.green('●');
    case 'warning':
      return chalk.yellow('●');
    case 'critical':
      return chalk.red('●');
    default:
      return chalk.gray('○');
  }
}
