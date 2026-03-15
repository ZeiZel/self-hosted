/**
 * Phase group component for deployment TUI
 *
 * Displays a deployment phase as a collapsible group containing
 * its associated tasks. Shows phase status and progress information.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { DeploymentPhase, getPhaseName, PhaseSummary, DeployTask, TaskStatus } from '../interfaces';
import { TaskItem, getStatusColor } from './TaskItem';

/**
 * Phase status icons
 */
const PHASE_STATUS_ICONS: Record<string, string> = {
  pending: '\u25CB',     // Empty circle
  running: '\u25D0',     // Circle with left half
  completed: '\u2713',   // Check mark
  failed: '\u2717',      // X mark
  skipped: '\u2298',     // Circled division slash
};

export interface PhaseGroupProps {
  /** Phase summary information */
  phase: PhaseSummary;
  /** Tasks belonging to this phase */
  tasks: DeployTask[];
  /** Whether the phase is expanded */
  expanded?: boolean;
  /** Whether the phase is focused */
  focused?: boolean;
  /** Currently selected task ID */
  selectedTaskId?: string | null;
  /** Callback when expand/collapse is toggled */
  onToggle?: (phase: DeploymentPhase) => void;
  /** Whether to show durations */
  showDurations?: boolean;
}

/**
 * Get status icon for a phase
 */
function getPhaseStatusIcon(status: string): string {
  return PHASE_STATUS_ICONS[status] || '?';
}

/**
 * Get status color for a phase
 */
function getPhaseStatusColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'green';
    case 'running':
      return 'yellow';
    case 'failed':
      return 'red';
    case 'skipped':
      return 'gray';
    default:
      return 'white';
  }
}

export const PhaseGroup: React.FC<PhaseGroupProps> = ({
  phase,
  tasks,
  expanded = true,
  focused = false,
  selectedTaskId,
  onToggle,
  showDurations = true,
}) => {
  const icon = getPhaseStatusIcon(phase.status);
  const color = getPhaseStatusColor(phase.status);
  const expandIcon = expanded ? '\u25BC' : '\u25B6'; // Down or right triangle

  // Calculate progress
  const progress = phase.totalTasks > 0
    ? Math.round((phase.completedTasks / phase.totalTasks) * 100)
    : 0;

  // Phase header
  const header = (
    <Box>
      <Text color={focused ? 'cyan' : 'white'}>
        {expandIcon}{' '}
      </Text>
      <Text color={color}>{icon}</Text>
      <Text bold color={focused ? 'cyan' : undefined}>
        {' '}Phase {phase.phase}: {phase.name}
      </Text>
      <Text dimColor>
        {' '}({phase.completedTasks}/{phase.totalTasks})
      </Text>
      {phase.status === 'running' && (
        <Text color="yellow" dimColor> [{progress}%]</Text>
      )}
    </Box>
  );

  // Filter and sort tasks by status for display
  const sortedTasks = [...tasks].sort((a, b) => {
    // Running tasks first, then by name
    const statusOrder: Record<TaskStatus, number> = {
      [TaskStatus.RUNNING]: 0,
      [TaskStatus.QUEUED]: 1,
      [TaskStatus.BLOCKED]: 2,
      [TaskStatus.PENDING]: 3,
      [TaskStatus.SUCCESS]: 4,
      [TaskStatus.FAILED]: 5,
      [TaskStatus.SKIPPED]: 6,
      [TaskStatus.CANCELLED]: 7,
    };
    const aOrder = statusOrder[a.status] ?? 99;
    const bOrder = statusOrder[b.status] ?? 99;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.name.localeCompare(b.name);
  });

  return (
    <Box flexDirection="column">
      {header}
      {expanded && (
        <Box flexDirection="column" marginLeft={2}>
          {sortedTasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              selected={task.id === selectedTaskId}
              showDuration={showDurations}
              indent={1}
            />
          ))}
        </Box>
      )}
    </Box>
  );
};
