import { NodeMetrics, ServiceMetrics } from '../../../../interfaces/monitor.interface';
import chalk from 'chalk';

/**
 * Migration panel state
 */
export interface MigrationPanelState {
  visible: boolean;
  service: ServiceMetrics | null;
  targetNodeIndex: number;
  nodes: NodeMetrics[];
}

/**
 * Render migration panel
 */
export function renderMigrationPanel(state: MigrationPanelState, width: number = 60): string[] {
  const lines: string[] = [];
  const innerWidth = width - 4;

  if (!state.visible || !state.service) {
    return lines;
  }

  lines.push(chalk.bold.cyan(' MIGRATE SERVICE '));
  lines.push(chalk.gray('─'.repeat(innerWidth)));

  // Service info
  lines.push(`  Service: ${chalk.bold(state.service.name)}`);
  lines.push(`  Current: ${state.service.node}`);
  lines.push('');

  // Target node selection
  lines.push('  Target node:');
  for (let i = 0; i < state.nodes.length; i++) {
    const node = state.nodes[i];
    const isSelected = i === state.targetNodeIndex;
    const isCurrent = node.name === state.service.node;

    const prefix = isSelected ? chalk.cyan('●') : '○';
    const suffix = isCurrent ? chalk.gray(' (current)') : '';
    const utilization = `${node.memory.percent}% mem`;

    const line = `    ${prefix} ${node.name} ${chalk.gray(`[${utilization}]`)}${suffix}`;
    lines.push(isSelected ? chalk.bold(line) : line);
  }

  lines.push('');
  lines.push(chalk.gray('  [Enter] Migrate  [Esc] Cancel'));

  return lines;
}

/**
 * Render migration confirmation
 */
export function renderMigrationConfirmation(
  service: ServiceMetrics,
  targetNode: NodeMetrics,
): string[] {
  return [
    '',
    chalk.bold.yellow('  Confirm Migration'),
    chalk.gray('  ─'.repeat(20)),
    `  Service: ${service.name}`,
    `  From:    ${service.node}`,
    `  To:      ${targetNode.name}`,
    '',
    chalk.gray('  This will:'),
    chalk.gray('  1. Delete the pod from current node'),
    chalk.gray('  2. Update placement constraints'),
    chalk.gray('  3. Schedule pod on target node'),
    '',
    chalk.bold('  Press [Y] to confirm, [N] to cancel'),
  ];
}

/**
 * Render migration progress
 */
export function renderMigrationProgress(
  service: string,
  status: string,
  progress: number,
): string[] {
  const progressBar = createProgressBar(progress, 20);

  return [
    '',
    chalk.bold.cyan(`  Migrating ${service}`),
    `  ${progressBar} ${progress}%`,
    chalk.gray(`  Status: ${status}`),
    '',
  ];
}

/**
 * Create progress bar
 */
function createProgressBar(percent: number, width: number): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return `[${chalk.cyan('█'.repeat(filled))}${chalk.gray('░'.repeat(empty))}]`;
}
