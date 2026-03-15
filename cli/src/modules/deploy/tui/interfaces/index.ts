/**
 * TUI Deployment Interfaces
 *
 * This module exports all interfaces for the deployment TUI system,
 * including task definitions, DAG management, executor interfaces,
 * and TUI state management.
 */

// Task interfaces - core task types and configurations
export {
  // Enums
  TaskStatus,
  TaskType,
  LogLevel,
  // Core interfaces
  LogLine,
  TaskTiming,
  TaskResult,
  TaskChange,
  DeployTask,
  // Task configuration types
  AnsibleTaskConfig,
  HelmfileTaskConfig,
  KubectlTaskConfig,
  ShellTaskConfig,
  ValidationTaskConfig,
  CompositeTaskConfig,
  TaskConfig,
  // Query and filtering
  TaskFilter,
  TaskSortOptions,
  TaskBatch,
  TaskDependencyEdge,
  TaskStatistics,
} from './task.interface';

// Error interfaces - structured error handling
export {
  // Types
  ErrorSource,
  AnsibleErrorType,
  // Core interfaces
  AnsibleError,
  AnsibleErrorContext,
  StructuredError,
  StructuredErrorDetails,
  LogLineWithError,
  // Utility functions
  ansibleErrorToStructured,
  createShellError,
  createHelmfileError,
  createKubectlError,
} from './error.interface';

// DAG interfaces - dependency graph management
export {
  // Types
  PhaseStatus,
  // Core interfaces
  PhaseSummary,
  DeploymentProgress,
  // DAG validation
  DAGValidationResult,
  DAGValidationError,
  DAGValidationWarning,
  // Topological sort
  TopologicalSortOptions,
  TopologicalSortResult,
  // DAG visualization
  DAGGraph,
  DAGNode,
  DAGLevel,
  // DAG management
  DAGManagerOptions,
  DEFAULT_DAG_OPTIONS,
  DAGEvent,
  DAGEventCallback,
  IDAGManager,
  DAGState,
  // DAG traversal
  DAGVisitor,
  DAGTraversalOptions,
} from './dag.interface';

// Executor interfaces - task execution
export {
  // Events and results
  TaskEvent,
  ExecutionContext,
  ExecutionResult,
  ExecutorStatistics,
  // Options
  ExecutorOptions,
  DEFAULT_EXECUTOR_OPTIONS,
  // Core executor interface
  ITaskExecutor,
  // Task handlers
  ITaskHandler,
  IAnsibleTaskHandler,
  IHelmfileTaskHandler,
  IKubectlTaskHandler,
  IShellTaskHandler,
  IValidationTaskHandler,
  // Handler data types
  HelmReleaseStatus,
  CertificateInfo,
  // Queue interface
  ITaskQueue,
  // Process execution
  SpawnOptions,
  SpawnResult,
  // Retry policy
  RetryPolicy,
  DEFAULT_RETRY_POLICY,
} from './executor.interface';

// TUI state interfaces - UI state management
export {
  // Panel and view types
  ActivePanel,
  LogViewMode,
  TaskViewMode,
  TaskGroupMode,
  TUITheme,
  // Display state
  TUIDisplayState,
  TaskListColumnWidths,
  DEFAULT_COLUMN_WIDTHS,
  DEFAULT_DISPLAY_STATE,
  // UI components state
  TUINotification,
  TUIDialog,
  CommandPaletteState,
  TUICommand,
  TaskDetailsState,
  DAGVisualizationState,
  SettingsPanelState,
  // Settings
  TUISettings,
  DEFAULT_TUI_SETTINGS,
  // Main TUI state
  DeployTUIState,
  createInitialTUIState,
  // Default states
  DEFAULT_DAG_VISUALIZATION_STATE,
  DEFAULT_COMMAND_PALETTE_STATE,
  DEFAULT_TASK_DETAILS_STATE,
  DEFAULT_SETTINGS_PANEL_STATE,
  // Actions and reducer
  TUIAction,
  TUIReducer,
  // Keyboard shortcuts
  TUI_KEYBOARD_SHORTCUTS,
} from './tui-state.interface';

// Re-export DeploymentPhase from main interfaces for convenience
export { DeploymentPhase, getPhaseName } from '../../../../interfaces/deployment.interface';
