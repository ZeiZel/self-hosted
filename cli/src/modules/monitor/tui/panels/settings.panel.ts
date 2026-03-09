import chalk from 'chalk';
import type { SettingsPanelState, SettingsField } from '../../../../telegram/interfaces/telegram.interface';

/**
 * Render settings panel
 */
export function renderSettingsPanel(
  state: SettingsPanelState,
  width: number = 60,
): string[] {
  const lines: string[] = [];
  const innerWidth = width - 4;

  // Header
  lines.push(chalk.bold.cyan(' SETTINGS '));
  lines.push(chalk.gray('─'.repeat(innerWidth)));
  lines.push('');

  // Group fields by category
  const daemonFields = state.fields.filter(
    (f) => f.key.startsWith('daemon.') || f.key === 'check_interval' || f.key === 'retention_days',
  );
  const thresholdFields = state.fields.filter((f) => f.key.startsWith('threshold.'));
  const telegramFields = state.fields.filter((f) => f.key.startsWith('telegram.'));

  let fieldIndex = 0;

  // Daemon section
  lines.push(chalk.bold('  Daemon'));
  lines.push(chalk.gray('  ' + '─'.repeat(6)));
  for (const field of daemonFields) {
    lines.push(renderField(field, fieldIndex === state.selectedIndex, innerWidth));
    fieldIndex++;
  }
  lines.push('');

  // Alert Thresholds section
  if (thresholdFields.length > 0) {
    lines.push(chalk.bold('  Alert Thresholds'));
    lines.push(chalk.gray('  ' + '─'.repeat(16)));
    for (const field of thresholdFields) {
      lines.push(renderField(field, fieldIndex === state.selectedIndex, innerWidth));
      fieldIndex++;
    }
    lines.push('');
  }

  // Telegram section
  lines.push(chalk.bold('  Telegram Bot'));
  lines.push(chalk.gray('  ' + '─'.repeat(12)));

  // Status indicator
  const statusIcon = getStatusIcon(state.telegramStatus);
  const statusText = getStatusText(state.telegramStatus);
  lines.push(`  Status:             ${statusIcon} ${statusText}`);

  for (const field of telegramFields) {
    lines.push(renderField(field, fieldIndex === state.selectedIndex, innerWidth));
    fieldIndex++;
  }
  lines.push('');

  // Footer with controls
  lines.push(chalk.gray('─'.repeat(innerWidth)));

  const saveButton = state.modified ? chalk.green('[Save]') : chalk.gray('[Save]');
  const resetButton = chalk.gray('[Reset]');
  const exitHint = chalk.gray('Press Esc to exit');

  lines.push(`  ${saveButton}  ${resetButton}                    ${exitHint}`);

  return lines;
}

/**
 * Render a single settings field
 */
function renderField(field: SettingsField, isSelected: boolean, width: number): string {
  const prefix = isSelected ? chalk.cyan('▶ ') : '  ';
  const label = field.label.padEnd(18);

  let valueDisplay: string;

  switch (field.type) {
    case 'boolean':
      valueDisplay = field.value ? chalk.green('[✓]') : chalk.gray('[ ]');
      break;

    case 'number':
      const numValue = String(field.value);
      if (isSelected) {
        valueDisplay = chalk.cyan(`[${numValue.padStart(6)}]`) + chalk.gray(' ←/→ adjust');
      } else {
        valueDisplay = `[${numValue.padStart(6)}]`;
      }
      break;

    case 'select':
      if (field.options && field.options.length > 0) {
        valueDisplay = `[${String(field.value)}]`;
        if (isSelected) {
          valueDisplay = chalk.cyan(valueDisplay) + chalk.gray(' ←/→ cycle');
        }
      } else {
        valueDisplay = `[${String(field.value)}]`;
      }
      break;

    default:
      valueDisplay = `[${String(field.value)}]`;
  }

  const line = `${prefix}${label} ${valueDisplay}`;
  return isSelected ? chalk.bold(line) : line;
}

/**
 * Get status icon for Telegram connection
 */
function getStatusIcon(status: SettingsPanelState['telegramStatus']): string {
  switch (status) {
    case 'connected':
      return chalk.green('●');
    case 'disconnected':
      return chalk.gray('●');
    case 'error':
      return chalk.red('●');
    case 'not_configured':
      return chalk.yellow('○');
    default:
      return chalk.gray('○');
  }
}

/**
 * Get status text for Telegram connection
 */
function getStatusText(status: SettingsPanelState['telegramStatus']): string {
  switch (status) {
    case 'connected':
      return chalk.green('Connected');
    case 'disconnected':
      return chalk.gray('Disconnected');
    case 'error':
      return chalk.red('Error');
    case 'not_configured':
      return chalk.yellow('Not Configured');
    default:
      return chalk.gray('Unknown');
  }
}

/**
 * Create default settings fields
 */
export function createDefaultSettingsFields(): SettingsField[] {
  return [
    // Daemon fields
    {
      key: 'check_interval',
      label: 'Check interval:',
      type: 'number',
      value: 60,
      min: 10,
      max: 3600,
      step: 10,
    },
    {
      key: 'retention_days',
      label: 'Retention days:',
      type: 'number',
      value: 7,
      min: 1,
      max: 365,
      step: 1,
    },

    // Threshold fields
    {
      key: 'threshold.cpu_warning',
      label: 'CPU warning:',
      type: 'number',
      value: 75,
      min: 0,
      max: 100,
      step: 5,
    },
    {
      key: 'threshold.cpu_critical',
      label: 'CPU critical:',
      type: 'number',
      value: 90,
      min: 0,
      max: 100,
      step: 5,
    },
    {
      key: 'threshold.memory_warning',
      label: 'Memory warning:',
      type: 'number',
      value: 80,
      min: 0,
      max: 100,
      step: 5,
    },
    {
      key: 'threshold.memory_critical',
      label: 'Memory critical:',
      type: 'number',
      value: 95,
      min: 0,
      max: 100,
      step: 5,
    },

    // Telegram fields
    {
      key: 'telegram.enabled',
      label: 'Enabled:',
      type: 'boolean',
      value: true,
    },
    {
      key: 'telegram.alert_critical',
      label: 'Alert on critical:',
      type: 'boolean',
      value: true,
    },
    {
      key: 'telegram.alert_degraded',
      label: 'Alert on degraded:',
      type: 'boolean',
      value: false,
    },
    {
      key: 'telegram.rate_limit',
      label: 'Rate limit:',
      type: 'number',
      value: 60,
      min: 0,
      max: 3600,
      step: 10,
    },
  ];
}

/**
 * Create initial settings panel state
 */
export function createSettingsPanelState(): SettingsPanelState {
  return {
    visible: false,
    selectedIndex: 0,
    fields: createDefaultSettingsFields(),
    telegramStatus: 'not_configured',
    modified: false,
  };
}

/**
 * Update a field value
 */
export function updateFieldValue(
  state: SettingsPanelState,
  delta: number,
): SettingsPanelState {
  const field = state.fields[state.selectedIndex];
  if (!field) return state;

  const newFields = [...state.fields];
  const newField = { ...field };

  switch (field.type) {
    case 'boolean':
      newField.value = !field.value;
      break;

    case 'number':
      const numValue = field.value as number;
      const step = field.step || 1;
      const min = field.min ?? 0;
      const max = field.max ?? 100;
      newField.value = Math.max(min, Math.min(max, numValue + delta * step));
      break;

    case 'select':
      if (field.options && field.options.length > 0) {
        const currentIndex = field.options.indexOf(String(field.value));
        const newIndex = (currentIndex + delta + field.options.length) % field.options.length;
        newField.value = field.options[newIndex];
      }
      break;
  }

  newFields[state.selectedIndex] = newField;

  return {
    ...state,
    fields: newFields,
    modified: true,
  };
}

/**
 * Navigate to next/previous field
 */
export function navigateField(state: SettingsPanelState, delta: number): SettingsPanelState {
  const newIndex = Math.max(
    0,
    Math.min(state.fields.length - 1, state.selectedIndex + delta),
  );

  return {
    ...state,
    selectedIndex: newIndex,
  };
}
