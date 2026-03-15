/**
 * Single task item component for deployment TUI
 *
 * Displays a task with its status icon, name, and optional duration.
 * Supports different visual states for selection and status highlighting.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { TaskStatus, DeployTask } from '../interfaces';

/**
 * Status icons for task display
 */
const STATUS_ICONS: Record<TaskStatus, string> = {
  [TaskStatus.PENDING]: '\u25CB',    // Empty circle
  [TaskStatus.BLOCKED]: '\u25CC',    // Dotted circle
  [TaskStatus.QUEUED]: '\u25D4',     // Circle with upper right quadrant
  [TaskStatus.RUNNING]: '\u25D0',    // Circle with left half
  [TaskStatus.SUCCESS]: '\u25CF',    // Filled circle
  [TaskStatus.FAILED]: '\u2716',     // Heavy X
  [TaskStatus.SKIPPED]: '\u2298',    // Circled division slash
  [TaskStatus.CANCELLED]: '\u2718',  // Heavy ballot X
};

/**
 * Status colors for task display
 */
const STATUS_COLORS: Record<TaskStatus, string> = {
  [TaskStatus.PENDING]: 'gray',
  [TaskStatus.BLOCKED]: 'magenta',
  [TaskStatus.QUEUED]: 'blue',
  [TaskStatus.RUNNING]: 'yellow',
  [TaskStatus.SUCCESS]: 'green',
  [TaskStatus.FAILED]: 'red',
  [TaskStatus.SKIPPED]: 'gray',
  [TaskStatus.CANCELLED]: 'red',
};

export interface TaskItemProps {
  /** Task to display */
  task: DeployTask;
  /** Whether the task is currently selected */
  selected?: boolean;
  /** Whether to show duration */
  showDuration?: boolean;
  /** Indentation level for nested display */
  indent?: number;
  /** Whether this is a compact view */
  compact?: boolean;
}

/**
 * Format duration in milliseconds to human readable string
 */
function formatDuration(ms: number | undefined): string {
  if (ms === undefined || ms === 0) return '';

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Get status icon for a task
 */
export function getStatusIcon(status: TaskStatus): string {
  return STATUS_ICONS[status] || '?';
}

/**
 * Get status color for a task
 */
export function getStatusColor(status: TaskStatus): string {
  return STATUS_COLORS[status] || 'white';
}

export const TaskItem: React.FC<TaskItemProps> = ({
  task,
  selected = false,
  showDuration = true,
  indent = 0,
  compact = false,
}) => {
  const icon = getStatusIcon(task.status);
  const color = getStatusColor(task.status);
  const duration = formatDuration(task.timing.durationMs);
  const indentSpaces = '  '.repeat(indent);

  // Running animation effect
  const runningIndicator = task.status === TaskStatus.RUNNING ? ' ...' : '';

  if (compact) {
    return (
      <Box>
        <Text color={color}>{icon}</Text>
        <Text inverse={selected}> {task.name}</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text>{indentSpaces}</Text>
      <Text color={color}>{icon}</Text>
      <Text inverse={selected} color={selected ? undefined : color === 'gray' ? 'gray' : undefined}>
        {' '}
        {task.name}
      </Text>
      {task.status === TaskStatus.RUNNING && (
        <Text color="yellow" dimColor>{runningIndicator}</Text>
      )}
      {showDuration && duration && (
        <Text dimColor> ({duration})</Text>
      )}
    </Box>
  );
};
