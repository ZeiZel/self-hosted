/**
 * Task panel component for deployment TUI
 *
 * Displays the list of deployment tasks organized by phases,
 * with status indicators and navigation support.
 */

import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import {
  DeployTask,
  PhaseSummary,
  DeploymentPhase,
  TaskStatus,
  TaskViewMode,
  TaskGroupMode,
} from '../interfaces';
import { PhaseGroup } from './PhaseGroup';
import { TaskItem } from './TaskItem';

export interface TaskPanelProps {
  /** All tasks in the deployment */
  tasks: DeployTask[];
  /** Phase summaries */
  phases: PhaseSummary[];
  /** Maximum height of the panel */
  maxHeight: number;
  /** Current scroll offset */
  scrollOffset: number;
  /** Whether panel is focused */
  focused?: boolean;
  /** Currently selected task ID */
  selectedTaskId?: string | null;
  /** Task view mode */
  viewMode?: TaskViewMode;
  /** Task grouping mode */
  groupMode?: TaskGroupMode;
  /** Expanded phases set */
  expandedPhases?: Set<DeploymentPhase>;
  /** Whether to show completed tasks */
  showCompleted?: boolean;
  /** Whether to show skipped tasks */
  showSkipped?: boolean;
  /** Whether to show durations */
  showDurations?: boolean;
  /** Filter string */
  filter?: string;
  /** Callback when phase is toggled */
  onPhaseToggle?: (phase: DeploymentPhase) => void;
}

/**
 * Get overall status summary
 */
function getStatusSummary(tasks: DeployTask[]): {
  running: number;
  queued: number;
  blocked: number;
  completed: number;
  failed: number;
} {
  return {
    running: tasks.filter((t) => t.status === TaskStatus.RUNNING).length,
    queued: tasks.filter((t) => t.status === TaskStatus.QUEUED).length,
    blocked: tasks.filter((t) => t.status === TaskStatus.BLOCKED).length,
    completed: tasks.filter((t) => t.status === TaskStatus.SUCCESS).length,
    failed: tasks.filter((t) => t.status === TaskStatus.FAILED).length,
  };
}

export const TaskPanel: React.FC<TaskPanelProps> = ({
  tasks,
  phases,
  maxHeight,
  scrollOffset,
  focused = false,
  selectedTaskId,
  viewMode = 'phases',
  groupMode = 'phase',
  expandedPhases,
  showCompleted = true,
  showSkipped = false,
  showDurations = true,
  filter = '',
  onPhaseToggle,
}) => {
  // Filter tasks
  const filteredTasks = useMemo(() => {
    let result = tasks;

    // Apply visibility filters
    if (!showCompleted) {
      result = result.filter((t) => t.status !== TaskStatus.SUCCESS);
    }
    if (!showSkipped) {
      result = result.filter((t) => t.status !== TaskStatus.SKIPPED);
    }

    // Apply text filter
    if (filter) {
      const lowerFilter = filter.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(lowerFilter) ||
          t.description.toLowerCase().includes(lowerFilter) ||
          t.service?.toLowerCase().includes(lowerFilter) ||
          t.namespace?.toLowerCase().includes(lowerFilter)
      );
    }

    return result;
  }, [tasks, showCompleted, showSkipped, filter]);

  // Group tasks by phase
  const tasksByPhase = useMemo(() => {
    const grouped = new Map<DeploymentPhase, DeployTask[]>();

    for (const phase of phases) {
      const phaseTasks = filteredTasks.filter((t) => t.phase === phase.phase);
      grouped.set(phase.phase, phaseTasks);
    }

    return grouped;
  }, [filteredTasks, phases]);

  // Status summary
  const summary = getStatusSummary(tasks);

  // Calculate visible height
  const contentHeight = maxHeight - 4; // Account for borders and title

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={focused ? 'cyan' : 'gray'}
      height={maxHeight}
      width="100%"
    >
      {/* Panel title */}
      <Box justifyContent="space-between" paddingX={1}>
        <Box>
          <Text color={focused ? 'cyan' : 'white'} bold>
            {focused ? '\u25C0 ' : ''}Tasks{focused ? ' \u25B6' : ''}
          </Text>
        </Box>
        <Box>
          <StatusCounts summary={summary} />
        </Box>
      </Box>

      {/* Task content */}
      <Box flexDirection="column" paddingX={1} flexGrow={1} overflowY="hidden">
        {viewMode === 'phases' || viewMode === 'tree' ? (
          // Grouped by phases
          <PhaseView
            phases={phases}
            tasksByPhase={tasksByPhase}
            expandedPhases={expandedPhases}
            selectedTaskId={selectedTaskId}
            showDurations={showDurations}
            onPhaseToggle={onPhaseToggle}
            scrollOffset={scrollOffset}
            maxHeight={contentHeight}
          />
        ) : (
          // Flat list view
          <ListView
            tasks={filteredTasks}
            selectedTaskId={selectedTaskId}
            showDurations={showDurations}
            scrollOffset={scrollOffset}
            maxHeight={contentHeight}
          />
        )}
      </Box>
    </Box>
  );
};

/**
 * Status counts component
 */
interface StatusCountsProps {
  summary: {
    running: number;
    queued: number;
    blocked: number;
    completed: number;
    failed: number;
  };
}

const StatusCounts: React.FC<StatusCountsProps> = ({ summary }) => {
  const parts: Array<{ count: number; color: string; label: string }> = [];

  if (summary.running > 0) {
    parts.push({ count: summary.running, color: 'yellow', label: 'run' });
  }
  if (summary.queued > 0) {
    parts.push({ count: summary.queued, color: 'blue', label: 'que' });
  }
  if (summary.failed > 0) {
    parts.push({ count: summary.failed, color: 'red', label: 'fail' });
  }
  if (summary.completed > 0) {
    parts.push({ count: summary.completed, color: 'green', label: 'done' });
  }

  return (
    <Box>
      {parts.map((part, index) => (
        <React.Fragment key={part.label}>
          {index > 0 && <Text dimColor> </Text>}
          <Text color={part.color}>{part.count}</Text>
          <Text dimColor>{part.label}</Text>
        </React.Fragment>
      ))}
    </Box>
  );
};

/**
 * Phase-grouped view
 */
interface PhaseViewProps {
  phases: PhaseSummary[];
  tasksByPhase: Map<DeploymentPhase, DeployTask[]>;
  expandedPhases?: Set<DeploymentPhase>;
  selectedTaskId?: string | null;
  showDurations: boolean;
  onPhaseToggle?: (phase: DeploymentPhase) => void;
  scrollOffset: number;
  maxHeight: number;
}

const PhaseView: React.FC<PhaseViewProps> = ({
  phases,
  tasksByPhase,
  expandedPhases,
  selectedTaskId,
  showDurations,
  onPhaseToggle,
  scrollOffset,
  maxHeight,
}) => {
  // Sort phases by phase number
  const sortedPhases = [...phases].sort((a, b) => a.phase - b.phase);

  // Default: expand phases that have running or failed tasks
  const defaultExpanded = new Set(
    sortedPhases
      .filter((p) => p.status === 'running' || p.status === 'failed')
      .map((p) => p.phase)
  );

  const isExpanded = (phase: DeploymentPhase) => {
    if (expandedPhases) {
      return expandedPhases.has(phase);
    }
    return defaultExpanded.has(phase);
  };

  return (
    <Box flexDirection="column">
      {sortedPhases.map((phase) => {
        const phaseTasks = tasksByPhase.get(phase.phase) || [];
        if (phaseTasks.length === 0 && phase.status === 'pending') {
          // Don't show empty pending phases
          return null;
        }

        return (
          <PhaseGroup
            key={phase.phase}
            phase={phase}
            tasks={phaseTasks}
            expanded={isExpanded(phase.phase)}
            selectedTaskId={selectedTaskId}
            showDurations={showDurations}
            onToggle={onPhaseToggle}
          />
        );
      })}
    </Box>
  );
};

/**
 * Flat list view
 */
interface ListViewProps {
  tasks: DeployTask[];
  selectedTaskId?: string | null;
  showDurations: boolean;
  scrollOffset: number;
  maxHeight: number;
}

const ListView: React.FC<ListViewProps> = ({
  tasks,
  selectedTaskId,
  showDurations,
  scrollOffset,
  maxHeight,
}) => {
  // Sort tasks: running first, then by phase and name
  const sortedTasks = [...tasks].sort((a, b) => {
    const statusOrder: Record<TaskStatus, number> = {
      [TaskStatus.RUNNING]: 0,
      [TaskStatus.FAILED]: 1,
      [TaskStatus.QUEUED]: 2,
      [TaskStatus.BLOCKED]: 3,
      [TaskStatus.PENDING]: 4,
      [TaskStatus.SUCCESS]: 5,
      [TaskStatus.SKIPPED]: 6,
      [TaskStatus.CANCELLED]: 7,
    };

    const aOrder = statusOrder[a.status] ?? 99;
    const bOrder = statusOrder[b.status] ?? 99;

    if (aOrder !== bOrder) return aOrder - bOrder;
    if (a.phase !== b.phase) return a.phase - b.phase;
    return a.name.localeCompare(b.name);
  });

  // Calculate visible range
  const visibleCount = Math.max(1, maxHeight - 2);
  const startIndex = Math.max(0, scrollOffset);
  const endIndex = Math.min(sortedTasks.length, startIndex + visibleCount);
  const visibleTasks = sortedTasks.slice(startIndex, endIndex);

  return (
    <Box flexDirection="column">
      {visibleTasks.map((task) => (
        <TaskItem
          key={task.id}
          task={task}
          selected={task.id === selectedTaskId}
          showDuration={showDurations}
        />
      ))}
    </Box>
  );
};
