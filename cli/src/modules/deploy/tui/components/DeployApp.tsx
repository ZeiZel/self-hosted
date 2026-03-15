/**
 * Main deployment TUI application component
 *
 * This is the root component for the deployment TUI. It orchestrates
 * all child components, manages state, and handles user input.
 *
 * Layout:
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ HEADER: [████████████░░░░░░░░] 60% | Phase 5: Core Services | ETA: 5m 30s  │
 * ├──────────────────────────────────────┬──────────────────────────────────────┤
 * │  LOG PANEL (60%)                     │  TASK PANEL (40%)                    │
 * │  ┌────────────────────────────────┐  │  Phase 4: Backup ✓                   │
 * │  │ [13:45:02] Deploying vault...  │  │  Phase 5: Core Services ●            │
 * │  │ [13:45:03] Creating namespace  │  │    ● deploy-namespaces ✓             │
 * │  │ [13:45:05] Installing chart... │  │    ● deploy-traefik ✓                │
 * │  │ [13:45:10] vault is running    │  │    ◐ deploy-vault (running)          │
 * │  │ ...                            │  │    ○ deploy-consul (queued)          │
 * │  │                                │  │    ◌ deploy-authentik (blocked)      │
 * │  └────────────────────────────────┘  │  Phase 6: Databases ○                │
 * ├──────────────────────────────────────┴──────────────────────────────────────┤
 * │ [Tab] Switch panel | [j/k] Scroll | [p] Pause | [q] Quit | Elapsed: 12m 30s│
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import React, { useCallback, useEffect, useReducer } from 'react';
import { Box, useInput, useApp } from 'ink';
import {
  DeployTUIState,
  ActivePanel,
  TUIAction,
  DeploymentPhase,
  LogViewMode,
  TaskViewMode,
  TaskGroupMode,
  DEFAULT_DISPLAY_STATE,
} from '../interfaces';
import { useTerminalSize } from '../hooks';
import { DeployHeader } from './DeployHeader';
import { DeployFooter } from './DeployFooter';
import { LogPanel } from './LogPanel';
import { TaskPanel } from './TaskPanel';
import { HelpOverlay } from './HelpOverlay';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * Props for DeployApp component
 */
export interface DeployAppProps {
  /** Initial TUI state */
  initialState: DeployTUIState;
  /** Callback when abort is requested */
  onAbort: () => Promise<void>;
  /** Callback when pause/resume is toggled */
  onPauseToggle: () => void;
  /** Callback when a task is retried */
  onRetryTask?: (taskId: string) => void;
  /** Callback when a task is skipped */
  onSkipTask?: (taskId: string) => void;
  /** Callback when a task is cancelled */
  onCancelTask?: (taskId: string) => void;
  /** External state update callback */
  onStateChange?: (state: DeployTUIState) => void;
}

/**
 * TUI state reducer
 */
function tuiReducer(state: DeployTUIState, action: TUIAction): DeployTUIState {
  switch (action.type) {
    case 'SET_ACTIVE_PANEL':
      return {
        ...state,
        display: { ...state.display, activePanel: action.panel },
      };

    case 'TOGGLE_SIDEBAR':
      return {
        ...state,
        display: {
          ...state.display,
          sidebarCollapsed: !state.display.sidebarCollapsed,
        },
      };

    case 'SELECT_TASK':
      return {
        ...state,
        display: { ...state.display, selectedTaskId: action.taskId },
      };

    case 'SET_LOG_VIEW_MODE':
      return {
        ...state,
        display: { ...state.display, logViewMode: action.mode },
      };

    case 'SET_TASK_VIEW_MODE':
      return {
        ...state,
        display: { ...state.display, taskViewMode: action.mode },
      };

    case 'SET_TASK_GROUP_MODE':
      return {
        ...state,
        display: { ...state.display, taskGroupMode: action.mode },
      };

    case 'TOGGLE_LOG_AUTO_SCROLL':
      return {
        ...state,
        display: { ...state.display, logAutoScroll: !state.display.logAutoScroll },
      };

    case 'SCROLL_LOGS':
      return {
        ...state,
        display: { ...state.display, logScrollOffset: action.offset },
      };

    case 'SCROLL_TASKS':
      return {
        ...state,
        display: { ...state.display, taskScrollOffset: action.offset },
      };

    case 'TOGGLE_PHASE_EXPANDED': {
      const expandedPhases = new Set(state.display.expandedPhases);
      if (expandedPhases.has(action.phase)) {
        expandedPhases.delete(action.phase);
      } else {
        expandedPhases.add(action.phase);
      }
      return {
        ...state,
        display: { ...state.display, expandedPhases },
      };
    }

    case 'TOGGLE_HELP':
      return {
        ...state,
        display: { ...state.display, helpVisible: !state.display.helpVisible },
      };

    case 'UPDATE_PROGRESS':
      return { ...state, progress: action.progress };

    case 'UPDATE_TASKS':
      return { ...state, tasks: action.tasks };

    case 'UPDATE_TASK': {
      const taskIndex = state.tasks.findIndex((t) => t.id === action.task.id);
      if (taskIndex === -1) return state;
      const tasks = [...state.tasks];
      tasks[taskIndex] = action.task;
      return { ...state, tasks };
    }

    case 'ADD_LOG':
      return { ...state, logs: [...state.logs, action.log] };

    case 'ADD_LOGS':
      return { ...state, logs: [...state.logs, ...action.logs] };

    case 'CLEAR_LOGS':
      return { ...state, logs: [] };

    case 'SET_CURRENT_TASK':
      return { ...state, currentTask: action.task };

    case 'SET_PAUSED':
      return { ...state, paused: action.paused };

    case 'SET_ERROR':
      return { ...state, error: action.error };

    case 'UPDATE_PHASES':
      return { ...state, phases: action.phases };

    case 'SHOW_DIALOG':
      return { ...state, dialog: action.dialog };

    case 'HIDE_DIALOG':
      return { ...state, dialog: null };

    case 'SET_CONNECTION_STATUS':
      return { ...state, connectionStatus: action.status };

    case 'INITIALIZE':
      return { ...state, initialized: true };

    case 'RESET':
      return {
        ...state,
        tasks: [],
        logs: [],
        currentTask: null,
        error: null,
        display: { ...DEFAULT_DISPLAY_STATE },
      };

    default:
      return state;
  }
}

export const DeployApp: React.FC<DeployAppProps> = ({
  initialState,
  onAbort,
  onPauseToggle,
  onRetryTask,
  onSkipTask,
  onCancelTask,
  onStateChange,
}) => {
  const { exit } = useApp();
  const { width, height, layout } = useTerminalSize(initialState.display.splitRatio);
  const [state, dispatch] = useReducer(tuiReducer, initialState);

  // Update elapsed time
  useEffect(() => {
    const interval = setInterval(() => {
      // This would normally be handled by external state updates
      // but we track it here for display purposes
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Notify state changes
  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  // Handle quit confirmation
  const handleQuit = useCallback(async () => {
    if (state.progress.status === 'running' && !state.paused) {
      dispatch({
        type: 'SHOW_DIALOG',
        dialog: {
          visible: true,
          type: 'confirm',
          title: 'Quit Deployment',
          message: 'Deployment is in progress. Are you sure you want to quit? This will abort the current deployment.',
          confirmText: 'Quit',
          cancelText: 'Continue',
          focusedButton: 'cancel',
        },
      });
    } else {
      await onAbort();
      exit();
    }
  }, [state.progress.status, state.paused, onAbort, exit]);

  // Handle dialog confirm
  const handleDialogConfirm = useCallback(async () => {
    dispatch({ type: 'HIDE_DIALOG' });
    await onAbort();
    exit();
  }, [onAbort, exit]);

  // Handle dialog cancel
  const handleDialogCancel = useCallback(() => {
    dispatch({ type: 'HIDE_DIALOG' });
  }, []);

  // Handle phase toggle
  const handlePhaseToggle = useCallback((phase: DeploymentPhase) => {
    dispatch({ type: 'TOGGLE_PHASE_EXPANDED', phase });
  }, []);

  // Handle keyboard input
  useInput((input, key) => {
    // If dialog is open, don't process other keys
    if (state.dialog?.visible) {
      return;
    }

    // If help is visible, close on any key
    if (state.display.helpVisible) {
      if (key.escape || input === '?' || input === 'q') {
        dispatch({ type: 'TOGGLE_HELP' });
      }
      return;
    }

    // Global shortcuts
    if (input === 'q' || (key.ctrl && input === 'c')) {
      handleQuit();
      return;
    }

    if (input === '?') {
      dispatch({ type: 'TOGGLE_HELP' });
      return;
    }

    // Pause toggle
    if (input === 'p' && state.progress.status === 'running') {
      onPauseToggle();
      dispatch({ type: 'SET_PAUSED', paused: !state.paused });
      return;
    }

    // Panel switching
    if (key.tab) {
      const panels: ActivePanel[] = ['logs', 'tasks'];
      const currentIndex = panels.indexOf(state.display.activePanel);
      const nextIndex = (currentIndex + 1) % panels.length;
      dispatch({ type: 'SET_ACTIVE_PANEL', panel: panels[nextIndex] });
      return;
    }

    // Quick panel selection
    if (input === '1') {
      dispatch({ type: 'SET_ACTIVE_PANEL', panel: 'tasks' });
      return;
    }
    if (input === '2') {
      dispatch({ type: 'SET_ACTIVE_PANEL', panel: 'logs' });
      return;
    }

    // Scrolling
    const scrollAmount = key.shift ? 10 : 1;
    if (input === 'j' || key.downArrow) {
      if (state.display.activePanel === 'logs') {
        const newOffset = Math.max(0, state.display.logScrollOffset - scrollAmount);
        dispatch({ type: 'SCROLL_LOGS', offset: newOffset });
      } else {
        const newOffset = state.display.taskScrollOffset + scrollAmount;
        dispatch({ type: 'SCROLL_TASKS', offset: newOffset });
      }
      return;
    }

    if (input === 'k' || key.upArrow) {
      if (state.display.activePanel === 'logs') {
        const newOffset = state.display.logScrollOffset + scrollAmount;
        dispatch({ type: 'SCROLL_LOGS', offset: newOffset });
      } else {
        const newOffset = Math.max(0, state.display.taskScrollOffset - scrollAmount);
        dispatch({ type: 'SCROLL_TASKS', offset: newOffset });
      }
      return;
    }

    // Auto-scroll toggle
    if (input === 'a' && state.display.activePanel === 'logs') {
      dispatch({ type: 'TOGGLE_LOG_AUTO_SCROLL' });
      return;
    }

    // Timestamp toggle
    if (input === 't' && state.display.activePanel === 'logs') {
      dispatch({
        type: 'SET_LOG_VIEW_MODE',
        mode: state.display.logViewMode === 'all' ? 'current' : 'all',
      });
      return;
    }

    // View mode cycling
    if (input === 'v') {
      if (state.display.activePanel === 'tasks') {
        const modes: TaskViewMode[] = ['phases', 'list', 'tree'];
        const currentIndex = modes.indexOf(state.display.taskViewMode);
        const nextIndex = (currentIndex + 1) % modes.length;
        dispatch({ type: 'SET_TASK_VIEW_MODE', mode: modes[nextIndex] });
      } else if (state.display.activePanel === 'logs') {
        const modes: LogViewMode[] = ['all', 'current', 'errors'];
        const currentIndex = modes.indexOf(state.display.logViewMode);
        const nextIndex = (currentIndex + 1) % modes.length;
        dispatch({ type: 'SET_LOG_VIEW_MODE', mode: modes[nextIndex] });
      }
      return;
    }

    // Group mode cycling (for tasks panel)
    if (input === 'g' && state.display.activePanel === 'tasks') {
      const modes: TaskGroupMode[] = ['phase', 'status', 'none'];
      const currentIndex = modes.indexOf(state.display.taskGroupMode);
      const nextIndex = (currentIndex + 1) % modes.length;
      dispatch({ type: 'SET_TASK_GROUP_MODE', mode: modes[nextIndex] });
      return;
    }

    // Expand/collapse in tasks panel
    if (input === ' ' && state.display.activePanel === 'tasks') {
      // Toggle the currently focused phase
      const currentPhase = state.progress.currentPhase;
      dispatch({ type: 'TOGGLE_PHASE_EXPANDED', phase: currentPhase });
      return;
    }

    // Retry failed task
    if (input === 'r' && state.display.selectedTaskId && onRetryTask) {
      const task = state.tasks.find((t) => t.id === state.display.selectedTaskId);
      if (task?.status === 'failed') {
        onRetryTask(task.id);
      }
      return;
    }

    // Skip task
    if (input === 's' && state.display.selectedTaskId && onSkipTask) {
      onSkipTask(state.display.selectedTaskId);
      return;
    }

    // Cancel task
    if (input === 'c' && state.display.selectedTaskId && onCancelTask) {
      onCancelTask(state.display.selectedTaskId);
      return;
    }

    // Clear logs
    if (key.ctrl && input === 'l') {
      dispatch({ type: 'CLEAR_LOGS' });
      return;
    }
  });

  // Render help overlay if visible
  if (state.display.helpVisible) {
    return (
      <Box
        width={width}
        height={height}
        justifyContent="center"
        alignItems="center"
      >
        <HelpOverlay onClose={() => dispatch({ type: 'TOGGLE_HELP' })} />
      </Box>
    );
  }

  // Render dialog if visible
  if (state.dialog?.visible) {
    return (
      <Box flexDirection="column" width={width} height={height}>
        <DeployHeader
          progress={state.progress}
          paused={state.paused}
          error={state.error}
        />
        <Box
          flexGrow={1}
          justifyContent="center"
          alignItems="center"
        >
          <ConfirmDialog
            dialog={state.dialog}
            onConfirm={handleDialogConfirm}
            onCancel={handleDialogCancel}
          />
        </Box>
        <DeployFooter
          elapsedTime={state.progress.elapsedMs}
          status={state.paused ? 'paused' : state.progress.status}
          activePanel={state.display.activePanel}
          paused={state.paused}
          connectionStatus={state.connectionStatus}
        />
      </Box>
    );
  }

  // Main TUI layout
  return (
    <Box flexDirection="column" width={width} height={height}>
      {/* Header */}
      <DeployHeader
        progress={state.progress}
        paused={state.paused}
        error={state.error}
      />

      {/* Main content area */}
      <Box flexDirection="row" height={layout.contentHeight}>
        {/* Log panel (left) */}
        <Box width={layout.logPanelWidth}>
          <LogPanel
            logs={state.logs}
            maxHeight={layout.contentHeight}
            scrollOffset={state.display.logScrollOffset}
            focused={state.display.activePanel === 'logs'}
            viewMode={state.display.logViewMode}
            filter={state.display.logFilter}
            minLevel={state.display.minLogLevel}
            showTimestamps={state.display.showLogTimestamps}
            autoScroll={state.display.logAutoScroll}
            currentTaskId={state.currentTask?.id}
          />
        </Box>

        {/* Task panel (right) */}
        <Box width={layout.taskPanelWidth}>
          <TaskPanel
            tasks={state.tasks}
            phases={state.phases}
            maxHeight={layout.contentHeight}
            scrollOffset={state.display.taskScrollOffset}
            focused={state.display.activePanel === 'tasks'}
            selectedTaskId={state.display.selectedTaskId}
            viewMode={state.display.taskViewMode}
            groupMode={state.display.taskGroupMode}
            expandedPhases={state.display.expandedPhases}
            showCompleted={state.display.showCompletedTasks}
            showSkipped={state.display.showSkippedTasks}
            showDurations={state.display.showDurations}
            filter={state.display.taskFilter}
            onPhaseToggle={handlePhaseToggle}
          />
        </Box>
      </Box>

      {/* Footer */}
      <DeployFooter
        elapsedTime={state.progress.elapsedMs}
        status={state.paused ? 'paused' : state.progress.status}
        activePanel={state.display.activePanel}
        paused={state.paused}
        helpVisible={state.display.helpVisible}
        connectionStatus={state.connectionStatus}
      />
    </Box>
  );
};

/**
 * Export dispatch action type for external state management
 */
export type { TUIAction };
export { tuiReducer };
