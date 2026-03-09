import chalk from 'chalk';
import { TraefikState, TraefikRouter } from '../../apis/interfaces/api.interface';

/**
 * Render Traefik panel content
 */
export function renderTraefikPanel(
  state: TraefikState | undefined,
  selectedIndex: number = -1,
  width: number = 40,
): string[] {
  const lines: string[] = [];
  const innerWidth = width - 4;

  lines.push(chalk.bold.cyan(' TRAEFIK '));
  lines.push(chalk.gray('─'.repeat(innerWidth)));

  if (!state) {
    lines.push(chalk.gray('  Loading...'));
    return lines;
  }

  if (!state.available) {
    lines.push(chalk.red('  Unavailable'));
    lines.push(chalk.gray('  Cannot connect to Traefik'));
    return lines;
  }

  // Overview stats
  if (state.overview) {
    const http = state.overview.http;
    lines.push(chalk.bold('  HTTP Stats:'));
    lines.push(`    Routers: ${formatCount(http.routers.total, http.routers.errors)}`);
    lines.push(`    Services: ${formatCount(http.services.total, http.services.errors)}`);
    lines.push(`    Middlewares: ${formatCount(http.middlewares.total, http.middlewares.errors)}`);
    lines.push('');
  }

  // Error summary
  if (state.errorCount > 0) {
    lines.push(chalk.red(`  ⚠ ${state.errorCount} configuration errors`));
    lines.push('');
  }

  // Routers list
  lines.push(chalk.bold('  Routers:'));
  lines.push(chalk.gray('─'.repeat(innerWidth)));

  if (state.routers.length === 0) {
    lines.push(chalk.gray('    No routers configured'));
  } else {
    for (let i = 0; i < Math.min(state.routers.length, 8); i++) {
      const router = state.routers[i];
      const isSelected = i === selectedIndex;
      const prefix = isSelected ? chalk.cyan('  ▶ ') : '    ';
      const icon = router.status === 'enabled' ? chalk.green('●') : chalk.red('●');

      const line = `${prefix}${icon} ${truncate(router.name, 20)}`;
      lines.push(isSelected ? chalk.bold(line) : line);

      // Show rule (truncated)
      const rule = truncate(router.rule, innerWidth - 8);
      lines.push(chalk.gray(`      ${rule}`));

      // Show TLS indicator
      if (router.tls) {
        lines.push(chalk.green('      🔒 TLS'));
      }
    }

    if (state.routers.length > 8) {
      lines.push(chalk.gray(`    ... and ${state.routers.length - 8} more`));
    }
  }

  lines.push('');

  // Services with errors
  const errorServices = state.services.filter((s) => s.status === 'disabled');
  if (errorServices.length > 0) {
    lines.push(chalk.bold.red('  Services with errors:'));
    for (const service of errorServices.slice(0, 3)) {
      lines.push(chalk.red(`    ✗ ${service.name}`));
    }
    if (errorServices.length > 3) {
      lines.push(chalk.red(`    ... and ${errorServices.length - 3} more`));
    }
  }

  return lines;
}

/**
 * Render compact Traefik summary
 */
export function renderTraefikSummary(state: TraefikState | undefined): string {
  if (!state || !state.available) {
    return chalk.gray('Traefik: unavailable');
  }

  const routerCount = state.routers.length;
  const serviceCount = state.services.length;

  if (state.errorCount > 0) {
    return `Traefik: ${chalk.red(`${state.errorCount} errors`)} (${routerCount} routes)`;
  }

  return `Traefik: ${chalk.green('healthy')} (${routerCount} routes, ${serviceCount} services)`;
}

/**
 * Render detailed router info
 */
export function renderRouterDetails(router: TraefikRouter): string[] {
  const lines: string[] = [];

  lines.push(chalk.bold(`  Router: ${router.name}`));
  lines.push(
    `    Status: ${router.status === 'enabled' ? chalk.green('enabled') : chalk.red('disabled')}`,
  );
  lines.push(`    Rule: ${chalk.white(router.rule)}`);
  lines.push(`    Service: ${chalk.cyan(router.service)}`);
  lines.push(`    Entry Points: ${router.entryPoints.join(', ')}`);

  if (router.middlewares && router.middlewares.length > 0) {
    lines.push(`    Middlewares: ${router.middlewares.join(', ')}`);
  }

  if (router.tls) {
    lines.push(`    TLS: ${chalk.green('enabled')}`);
  }

  return lines;
}

/**
 * Format count with error indicator
 */
function formatCount(total: number, errors: number): string {
  if (errors > 0) {
    return `${total} (${chalk.red(`${errors} errors`)})`;
  }
  return chalk.green(String(total));
}

/**
 * Truncate string
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}
