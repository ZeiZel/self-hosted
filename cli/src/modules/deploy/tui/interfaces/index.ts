/**
 * TUI Deployment Interfaces
 *
 * This module exports all interfaces for the deployment TUI system,
 * including task definitions, DAG management, executor interfaces,
 * and TUI state management.
 */

// ============================================================================
// Task interfaces - core task types and configurations
// ============================================================================

// Runtime values (enums)
export { TaskStatus, TaskType, LogLevel } from './task.interface';

// Type-only exports (interfaces and types)
export type {
  LogLine,
  TaskTiming,
  TaskResult,
  TaskChange,
  DeployTask,
  AnsibleTaskConfig,
  HelmfileTaskConfig,
  KubectlTaskConfig,
  ShellTaskConfig,
  ValidationTaskConfig,
  CompositeTaskConfig,
  TaskConfig,
  TaskFilter,
  TaskSortOptions,
  TaskBatch,
  TaskDependencyEdge,
  TaskStatistics,
} from './task.interface';

// ============================================================================
// Error interfaces - structured error handling
// ============================================================================

// Runtime values (utility functions)
export {
  ansibleErrorToStructured,
  createShellError,
  createHelmfileError,
  createKubectlError,
} from './error.interface';

// Type-only exports
export type {
  ErrorSource,
  AnsibleErrorType,
  AnsibleError,
  AnsibleErrorContext,
  StructuredError,
  StructuredErrorDetails,
  LogLineWithError,
} from './error.interface';

// ============================================================================
// DAG interfaces - dependency graph management
// ============================================================================

// Runtime values (default options)
export { DEFAULT_DAG_OPTIONS } from './dag.interface';

// Type-only exports
export type {
  PhaseStatus,
  PhaseSummary,
  DeploymentProgress,
  DAGValidationResult,
  DAGValidationError,
  DAGValidationWarning,
  TopologicalSortOptions,
  TopologicalSortResult,
  DAGGraph,
  DAGNode,
  DAGLevel,
  DAGManagerOptions,
  DAGEvent,
  DAGEventCallback,
  IDAGManager,
  DAGState,
  DAGVisitor,
  DAGTraversalOptions,
} from './dag.interface';

// ============================================================================
// Executor interfaces - task execution
// ============================================================================

// Runtime values (default options)
export { DEFAULT_EXECUTOR_OPTIONS, DEFAULT_RETRY_POLICY } from './executor.interface';

// Type-only exports
export type {
  TaskEvent,
  ExecutionContext,
  ExecutionResult,
  ExecutorStatistics,
  ExecutorOptions,
  ITaskExecutor,
  ITaskHandler,
  IAnsibleTaskHandler,
  IHelmfileTaskHandler,
  IKubectlTaskHandler,
  IShellTaskHandler,
  IValidationTaskHandler,
  HelmReleaseStatus,
  CertificateInfo,
  ITaskQueue,
  SpawnOptions,
  SpawnResult,
  RetryPolicy,
} from './executor.interface';

// ============================================================================
// TUI state interfaces - UI state management
// ============================================================================

// Runtime values (default states and functions)
export {
  DEFAULT_COLUMN_WIDTHS,
  DEFAULT_DISPLAY_STATE,
  DEFAULT_TUI_SETTINGS,
  DEFAULT_DAG_VISUALIZATION_STATE,
  DEFAULT_COMMAND_PALETTE_STATE,
  DEFAULT_TASK_DETAILS_STATE,
  DEFAULT_SETTINGS_PANEL_STATE,
  TUI_KEYBOARD_SHORTCUTS,
  createInitialTUIState,
} from './tui-state.interface';

// Type-only exports
export type {
  ActivePanel,
  LogViewMode,
  TaskViewMode,
  TaskGroupMode,
  TUITheme,
  TUIDisplayState,
  TaskListColumnWidths,
  TUINotification,
  TUIDialog,
  CommandPaletteState,
  TUICommand,
  TaskDetailsState,
  DAGVisualizationState,
  SettingsPanelState,
  TUISettings,
  DeployTUIState,
  TUIAction,
  TUIReducer,
} from './tui-state.interface';

// ============================================================================
// Re-exports from main interfaces
// ============================================================================

// Runtime values (enum and function)
export { DeploymentPhase, getPhaseName } from '../../../../interfaces/deployment.interface';
