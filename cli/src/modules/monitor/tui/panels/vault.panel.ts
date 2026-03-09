import chalk from 'chalk';
import { VaultState, ApiHealthStatus } from '../../apis/interfaces/api.interface';

/**
 * Render Vault panel content
 */
export function renderVaultPanel(
  state: VaultState | undefined,
  width: number = 40,
): string[] {
  const lines: string[] = [];
  const innerWidth = width - 4;

  lines.push(chalk.bold.cyan(' VAULT '));
  lines.push(chalk.gray('─'.repeat(innerWidth)));

  if (!state) {
    lines.push(chalk.gray('  Loading...'));
    return lines;
  }

  if (!state.available) {
    lines.push(chalk.red('  Unavailable'));
    lines.push(chalk.gray('  Cannot connect to Vault'));
    return lines;
  }

  // Health status
  const healthIcon = getHealthIcon(state.health);
  const healthText = getHealthText(state.health);
  lines.push(`  Status: ${healthIcon} ${healthText}`);
  lines.push('');

  if (state.status) {
    // Initialization status
    const initIcon = state.status.initialized ? chalk.green('✓') : chalk.red('✗');
    lines.push(`  Initialized: ${initIcon} ${state.status.initialized ? 'Yes' : 'No'}`);

    // Seal status
    const sealIcon = state.status.sealed ? chalk.red('🔒') : chalk.green('🔓');
    const sealText = state.status.sealed ? chalk.red('Sealed') : chalk.green('Unsealed');
    lines.push(`  Seal Status: ${sealIcon} ${sealText}`);
    lines.push('');

    // Version
    lines.push(`  Version: ${chalk.white(state.status.version)}`);

    // Cluster info
    if (state.status.clusterName) {
      lines.push(`  Cluster: ${chalk.gray(state.status.clusterName)}`);
    }

    // HA status
    if (state.status.haEnabled) {
      lines.push('');
      lines.push(chalk.bold('  High Availability:'));
      lines.push(`    HA Enabled: ${chalk.green('Yes')}`);
      lines.push(
        `    Mode: ${state.status.standby ? chalk.yellow('Standby') : chalk.green('Active')}`,
      );
      if (state.status.clusterLeader) {
        lines.push(`    Leader: ${chalk.gray(state.status.clusterLeader)}`);
      }
    }
  }

  lines.push('');
  lines.push(chalk.gray('─'.repeat(innerWidth)));
  lines.push(chalk.gray(`  Updated: ${formatTime(state.lastUpdated)}`));

  return lines;
}

/**
 * Render compact Vault summary
 */
export function renderVaultSummary(state: VaultState | undefined): string {
  if (!state || !state.available) {
    return chalk.gray('Vault: unavailable');
  }

  if (!state.status) {
    return chalk.yellow('Vault: unknown status');
  }

  if (state.status.sealed) {
    return chalk.red('Vault: sealed');
  }

  if (!state.status.initialized) {
    return chalk.yellow('Vault: not initialized');
  }

  return chalk.green(`Vault: unsealed (${state.status.version})`);
}

/**
 * Get health status icon
 */
function getHealthIcon(health: ApiHealthStatus): string {
  switch (health) {
    case ApiHealthStatus.HEALTHY:
      return chalk.green('●');
    case ApiHealthStatus.DEGRADED:
      return chalk.yellow('●');
    case ApiHealthStatus.UNAVAILABLE:
      return chalk.red('●');
    default:
      return chalk.gray('○');
  }
}

/**
 * Get health status text
 */
function getHealthText(health: ApiHealthStatus): string {
  switch (health) {
    case ApiHealthStatus.HEALTHY:
      return chalk.green('Healthy');
    case ApiHealthStatus.DEGRADED:
      return chalk.yellow('Degraded');
    case ApiHealthStatus.UNAVAILABLE:
      return chalk.red('Unavailable');
    default:
      return chalk.gray('Unknown');
  }
}

/**
 * Format timestamp
 */
function formatTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  } catch {
    return 'unknown';
  }
}
