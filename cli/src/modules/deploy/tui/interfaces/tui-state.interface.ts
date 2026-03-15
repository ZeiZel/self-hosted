/**
 * TUI state interfaces for deployment dashboard
 *
 * This module defines the complete state model for the deployment TUI,
 * including display settings, navigation state, and user interactions.
 */

import { DeploymentPhase } from '../../../../interfaces/deployment.interface';
import { DeployTask, TaskStatus, LogLine, LogLevel } from './task.interface';
import { DeploymentProgress, PhaseSummary } from './dag.interface';

/**
 * Active panel in the TUI
 */
export type ActivePanel = 'logs' | 'tasks' | 'dag' | 'help' | 'details' | 'settings';

/**
 * Log viewing mode
 */
export type LogViewMode = 'all' | 'current' | 'errors' | 'filtered';

/**
 * Task list viewing mode
 */
export type TaskViewMode = 'list' | 'tree' | 'dag' | 'phases';

/**
 * Task grouping mode for list view
 */
export type TaskGroupMode = 'none' | 'phase' | 'status' | 'type' | 'namespace';

/**
 * Theme for TUI rendering
 */
export type TUITheme = 'default' | 'minimal' | 'unicode' | 'ascii';

/**
 * Display settings for TUI
 */
export interface TUIDisplayState {
  /** Currently active panel */
  activePanel: ActivePanel;
  /** Whether sidebar is collapsed */
  sidebarCollapsed: boolean;
  /** Currently selected task ID */
  selectedTaskId: string | null;
  /** Log scroll offset (lines from bottom) */
  logScrollOffset: number;
  /** Task list scroll offset */
  taskScrollOffset: number;
  /** Current log view mode */
  logViewMode: LogViewMode;
  /** Current task view mode */
  taskViewMode: TaskViewMode;
  /** Current task grouping mode */
  taskGroupMode: TaskGroupMode;
  /** Whether to auto-scroll logs */
  logAutoScroll: boolean;
  /** Whether to show timestamps in logs */
  showLogTimestamps: boolean;
  /** Whether to show task durations */
  showDurations: boolean;
  /** Whether to show completed tasks */
  showCompletedTasks: boolean;
  /** Whether to show skipped tasks */
  showSkippedTasks: boolean;
  /** Filter string for log messages */
  logFilter: string;
  /** Filter string for task names */
  taskFilter: string;
  /** Minimum log level to display */
  minLogLevel: LogLevel;
  /** Current theme */
  theme: TUITheme;
  /** Terminal width */
  terminalWidth: number;
  /** Terminal height */
  terminalHeight: number;
  /** Whether TUI is in fullscreen mode */
  fullscreen: boolean;
  /** Expanded phases (for tree view) */
  expandedPhases: Set<DeploymentPhase>;
  /** Expanded groups (for grouped view) */
  expandedGroups: Set<string>;
  /** Column widths for task list */
  columnWidths: TaskListColumnWidths;
  /** Panel split ratio (0-1) */
  splitRatio: number;
  /** Whether help overlay is visible */
  helpVisible: boolean;
  /** Whether search mode is active */
  searchActive: boolean;
  /** Current search query */
  searchQuery: string;
}

/**
 * Column widths for task list
 */
export interface TaskListColumnWidths {
  status: number;
  name: number;
  phase: number;
  duration: number;
  type: number;
}

/**
 * Default column widths
 */
export const DEFAULT_COLUMN_WIDTHS: TaskListColumnWidths = {
  status: 12,
  name: 30,
  phase: 15,
  duration: 10,
  type: 10,
};

/**
 * Default display state
 */
export const DEFAULT_DISPLAY_STATE: TUIDisplayState = {
  activePanel: 'tasks',
  sidebarCollapsed: false,
  selectedTaskId: null,
  logScrollOffset: 0,
  taskScrollOffset: 0,
  logViewMode: 'all',
  taskViewMode: 'list',
  taskGroupMode: 'phase',
  logAutoScroll: true,
  showLogTimestamps: true,
  showDurations: true,
  showCompletedTasks: true,
  showSkippedTasks: false,
  logFilter: '',
  taskFilter: '',
  minLogLevel: LogLevel.INFO,
  theme: 'default',
  terminalWidth: 120,
  terminalHeight: 40,
  fullscreen: false,
  expandedPhases: new Set(),
  expandedGroups: new Set(),
  columnWidths: DEFAULT_COLUMN_WIDTHS,
  splitRatio: 0.6,
  helpVisible: false,
  searchActive: false,
  searchQuery: '',
};

/**
 * Notification message
 */
export interface TUINotification {
  /** Unique notification ID */
  id: string;
  /** Notification type */
  type: 'info' | 'success' | 'warning' | 'error';
  /** Notification message */
  message: string;
  /** When notification was created */
  createdAt: Date;
  /** Duration to show in milliseconds (0 = until dismissed) */
  duration: number;
  /** Whether notification can be dismissed */
  dismissible: boolean;
  /** Action button text */
  actionText?: string;
  /** Action callback */
  action?: () => void;
}

/**
 * Dialog state
 */
export interface TUIDialog {
  /** Whether dialog is visible */
  visible: boolean;
  /** Dialog type */
  type: 'confirm' | 'prompt' | 'alert' | 'custom';
  /** Dialog title */
  title: string;
  /** Dialog message */
  message: string;
  /** Confirm button text */
  confirmText?: string;
  /** Cancel button text */
  cancelText?: string;
  /** Input value for prompt dialogs */
  inputValue?: string;
  /** Focused button */
  focusedButton: 'confirm' | 'cancel';
  /** Callback for confirm */
  onConfirm?: (value?: string) => void;
  /** Callback for cancel */
  onCancel?: () => void;
}

/**
 * Command palette state
 */
export interface CommandPaletteState {
  /** Whether command palette is visible */
  visible: boolean;
  /** Current input */
  input: string;
  /** Selected command index */
  selectedIndex: number;
  /** Filtered commands */
  filteredCommands: TUICommand[];
  /** Recent commands */
  recentCommands: string[];
}

/**
 * TUI command for command palette
 */
export interface TUICommand {
  /** Command ID */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Keyboard shortcut */
  shortcut?: string;
  /** Command category */
  category: 'navigation' | 'task' | 'view' | 'deployment' | 'system';
  /** Command action */
  action: () => void;
  /** Whether command is currently available */
  enabled: boolean;
}

/**
 * Task details panel state
 */
export interface TaskDetailsState {
  /** Task being viewed */
  task: DeployTask | null;
  /** Active tab in details */
  activeTab: 'logs' | 'config' | 'result' | 'dependencies';
  /** Log scroll offset in details panel */
  logScrollOffset: number;
  /** Whether to word wrap logs */
  wordWrap: boolean;
}

/**
 * DAG visualization state
 */
export interface DAGVisualizationState {
  /** Zoom level (1 = 100%) */
  zoom: number;
  /** X pan offset */
  panX: number;
  /** Y pan offset */
  panY: number;
  /** Whether to show labels */
  showLabels: boolean;
  /** Whether to show edges */
  showEdges: boolean;
  /** Highlight mode */
  highlightMode: 'none' | 'critical-path' | 'dependencies' | 'dependents';
  /** Node layout algorithm */
  layout: 'dagre' | 'hierarchical' | 'force';
  /** Minimum node spacing */
  nodeSpacing: number;
  /** Whether animation is enabled */
  animated: boolean;
}

/**
 * Settings panel state
 */
export interface SettingsPanelState {
  /** Active settings tab */
  activeTab: 'general' | 'display' | 'execution' | 'notifications';
  /** Currently selected field index */
  selectedFieldIndex: number;
  /** Pending changes (not yet applied) */
  pendingChanges: Partial<TUISettings>;
  /** Whether there are unsaved changes */
  hasUnsavedChanges: boolean;
}

/**
 * TUI settings (persisted)
 */
export interface TUISettings {
  /** Default theme */
  theme: TUITheme;
  /** Default log view mode */
  defaultLogViewMode: LogViewMode;
  /** Default task view mode */
  defaultTaskViewMode: TaskViewMode;
  /** Auto-scroll logs by default */
  autoScrollLogs: boolean;
  /** Show timestamps by default */
  showTimestamps: boolean;
  /** Notification duration in milliseconds */
  notificationDuration: number;
  /** Maximum log lines to keep in memory */
  maxLogLines: number;
  /** Refresh interval in milliseconds */
  refreshInterval: number;
  /** Enable sound notifications */
  soundEnabled: boolean;
  /** Enable desktop notifications */
  desktopNotifications: boolean;
  /** Keyboard shortcut mappings */
  shortcuts: Record<string, string>;
}

/**
 * Default TUI settings
 */
export const DEFAULT_TUI_SETTINGS: TUISettings = {
  theme: 'default',
  defaultLogViewMode: 'all',
  defaultTaskViewMode: 'list',
  autoScrollLogs: true,
  showTimestamps: true,
  notificationDuration: 5000,
  maxLogLines: 10000,
  refreshInterval: 1000,
  soundEnabled: false,
  desktopNotifications: false,
  shortcuts: {},
};

/**
 * Complete deployment TUI state
 */
export interface DeployTUIState {
  /** Deployment progress information */
  progress: DeploymentProgress;
  /** All tasks in deployment */
  tasks: DeployTask[];
  /** Currently executing task */
  currentTask: DeployTask | null;
  /** All log lines */
  logs: LogLine[];
  /** Display state */
  display: TUIDisplayState;
  /** Whether deployment is paused */
  paused: boolean;
  /** Current error message */
  error: string | null;
  /** Phase summaries */
  phases: PhaseSummary[];
  /** Active notifications */
  notifications: TUINotification[];
  /** Dialog state */
  dialog: TUIDialog | null;
  /** Command palette state */
  commandPalette: CommandPaletteState;
  /** Task details state */
  taskDetails: TaskDetailsState;
  /** DAG visualization state */
  dagVisualization: DAGVisualizationState;
  /** Settings panel state */
  settingsPanel: SettingsPanelState;
  /** User settings */
  settings: TUISettings;
  /** Whether TUI is initialized */
  initialized: boolean;
  /** Last update timestamp */
  lastUpdate: Date;
  /** Connection status to daemon */
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting';
}

/**
 * Default DAG visualization state
 */
export const DEFAULT_DAG_VISUALIZATION_STATE: DAGVisualizationState = {
  zoom: 1,
  panX: 0,
  panY: 0,
  showLabels: true,
  showEdges: true,
  highlightMode: 'none',
  layout: 'hierarchical',
  nodeSpacing: 50,
  animated: true,
};

/**
 * Default command palette state
 */
export const DEFAULT_COMMAND_PALETTE_STATE: CommandPaletteState = {
  visible: false,
  input: '',
  selectedIndex: 0,
  filteredCommands: [],
  recentCommands: [],
};

/**
 * Default task details state
 */
export const DEFAULT_TASK_DETAILS_STATE: TaskDetailsState = {
  task: null,
  activeTab: 'logs',
  logScrollOffset: 0,
  wordWrap: true,
};

/**
 * Default settings panel state
 */
export const DEFAULT_SETTINGS_PANEL_STATE: SettingsPanelState = {
  activeTab: 'general',
  selectedFieldIndex: 0,
  pendingChanges: {},
  hasUnsavedChanges: false,
};

/**
 * Create initial TUI state
 */
export function createInitialTUIState(): DeployTUIState {
  return {
    progress: {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      skippedTasks: 0,
      runningTasks: 0,
      queuedTasks: 0,
      blockedTasks: 0,
      pendingTasks: 0,
      cancelledTasks: 0,
      progressPercent: 0,
      currentPhase: DeploymentPhase.INFRASTRUCTURE_SETUP,
      phases: [],
      startedAt: new Date(),
      elapsedMs: 0,
      estimatedRemainingSeconds: 0,
      status: 'pending',
    },
    tasks: [],
    currentTask: null,
    logs: [],
    display: { ...DEFAULT_DISPLAY_STATE },
    paused: false,
    error: null,
    phases: [],
    notifications: [],
    dialog: null,
    commandPalette: { ...DEFAULT_COMMAND_PALETTE_STATE },
    taskDetails: { ...DEFAULT_TASK_DETAILS_STATE },
    dagVisualization: { ...DEFAULT_DAG_VISUALIZATION_STATE },
    settingsPanel: { ...DEFAULT_SETTINGS_PANEL_STATE },
    settings: { ...DEFAULT_TUI_SETTINGS },
    initialized: false,
    lastUpdate: new Date(),
    connectionStatus: 'disconnected',
  };
}

/**
 * TUI action types for state updates
 */
export type TUIAction =
  | { type: 'SET_ACTIVE_PANEL'; panel: ActivePanel }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SELECT_TASK'; taskId: string | null }
  | { type: 'SET_LOG_VIEW_MODE'; mode: LogViewMode }
  | { type: 'SET_TASK_VIEW_MODE'; mode: TaskViewMode }
  | { type: 'SET_TASK_GROUP_MODE'; mode: TaskGroupMode }
  | { type: 'TOGGLE_LOG_AUTO_SCROLL' }
  | { type: 'SCROLL_LOGS'; offset: number }
  | { type: 'SCROLL_TASKS'; offset: number }
  | { type: 'SET_LOG_FILTER'; filter: string }
  | { type: 'SET_TASK_FILTER'; filter: string }
  | { type: 'TOGGLE_PHASE_EXPANDED'; phase: DeploymentPhase }
  | { type: 'TOGGLE_GROUP_EXPANDED'; group: string }
  | { type: 'SET_THEME'; theme: TUITheme }
  | { type: 'RESIZE_TERMINAL'; width: number; height: number }
  | { type: 'TOGGLE_FULLSCREEN' }
  | { type: 'SET_SPLIT_RATIO'; ratio: number }
  | { type: 'TOGGLE_HELP' }
  | { type: 'TOGGLE_SEARCH' }
  | { type: 'SET_SEARCH_QUERY'; query: string }
  | { type: 'UPDATE_PROGRESS'; progress: DeploymentProgress }
  | { type: 'UPDATE_TASKS'; tasks: DeployTask[] }
  | { type: 'UPDATE_TASK'; task: DeployTask }
  | { type: 'ADD_LOG'; log: LogLine }
  | { type: 'ADD_LOGS'; logs: LogLine[] }
  | { type: 'CLEAR_LOGS' }
  | { type: 'SET_CURRENT_TASK'; task: DeployTask | null }
  | { type: 'SET_PAUSED'; paused: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'UPDATE_PHASES'; phases: PhaseSummary[] }
  | { type: 'ADD_NOTIFICATION'; notification: TUINotification }
  | { type: 'DISMISS_NOTIFICATION'; id: string }
  | { type: 'SHOW_DIALOG'; dialog: TUIDialog }
  | { type: 'HIDE_DIALOG' }
  | { type: 'SET_DIALOG_FOCUS'; button: 'confirm' | 'cancel' }
  | { type: 'SET_DIALOG_INPUT'; value: string }
  | { type: 'TOGGLE_COMMAND_PALETTE' }
  | { type: 'SET_COMMAND_PALETTE_INPUT'; input: string }
  | { type: 'SET_COMMAND_PALETTE_SELECTION'; index: number }
  | { type: 'SET_TASK_DETAILS_TAB'; tab: 'logs' | 'config' | 'result' | 'dependencies' }
  | { type: 'SET_DAG_ZOOM'; zoom: number }
  | { type: 'SET_DAG_PAN'; x: number; y: number }
  | { type: 'SET_DAG_HIGHLIGHT_MODE'; mode: 'none' | 'critical-path' | 'dependencies' | 'dependents' }
  | { type: 'SET_SETTINGS_TAB'; tab: 'general' | 'display' | 'execution' | 'notifications' }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<TUISettings> }
  | { type: 'SET_CONNECTION_STATUS'; status: 'connected' | 'disconnected' | 'reconnecting' }
  | { type: 'INITIALIZE' }
  | { type: 'RESET' };

/**
 * TUI state reducer type
 */
export type TUIReducer = (state: DeployTUIState, action: TUIAction) => DeployTUIState;

/**
 * Keyboard shortcuts for TUI
 */
export const TUI_KEYBOARD_SHORTCUTS: Record<string, string> = {
  'q, Ctrl+C': 'Quit deployment',
  'p': 'Pause/Resume deployment',
  'Tab': 'Switch panel',
  '1': 'Tasks panel',
  '2': 'Logs panel',
  '3': 'DAG panel',
  '?': 'Toggle help',
  '/': 'Search',
  'Esc': 'Close overlay/Cancel',
  'j, Down': 'Navigate down',
  'k, Up': 'Navigate up',
  'Enter': 'Select/Confirm',
  'Space': 'Toggle expand',
  'r': 'Retry failed task',
  's': 'Skip task',
  'c': 'Cancel task',
  'g': 'Change grouping',
  'v': 'Change view mode',
  't': 'Toggle timestamps',
  'a': 'Toggle auto-scroll',
  'Ctrl+p': 'Command palette',
  'Ctrl+l': 'Clear logs',
  'Home': 'Jump to start',
  'End': 'Jump to end',
  'PgUp': 'Page up',
  'PgDn': 'Page down',
};
