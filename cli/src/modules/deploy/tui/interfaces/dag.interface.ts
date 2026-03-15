/**
 * DAG (Directed Acyclic Graph) interfaces for deployment orchestration
 *
 * This module defines interfaces for managing task dependencies,
 * tracking deployment progress, and orchestrating task execution
 * in the correct order.
 */

import { DeploymentPhase } from '../../../../interfaces/deployment.interface';
import {
  DeployTask,
  TaskStatus,
  TaskResult,
  TaskFilter,
  TaskSortOptions,
  TaskStatistics,
  TaskDependencyEdge,
} from './task.interface';

/**
 * Status of a deployment phase
 */
export type PhaseStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/**
 * Summary of a deployment phase
 */
export interface PhaseSummary {
  /** Deployment phase enum value */
  phase: DeploymentPhase;
  /** Human-readable phase name */
  name: string;
  /** Total tasks in this phase */
  totalTasks: number;
  /** Successfully completed tasks */
  completedTasks: number;
  /** Failed tasks */
  failedTasks: number;
  /** Skipped tasks */
  skippedTasks: number;
  /** Currently running tasks */
  runningTasks: number;
  /** Queued tasks waiting for execution slot */
  queuedTasks: number;
  /** Blocked tasks waiting for dependencies */
  blockedTasks: number;
  /** Overall phase status */
  status: PhaseStatus;
  /** Phase start time */
  startedAt?: Date;
  /** Phase completion time */
  completedAt?: Date;
  /** Phase duration in milliseconds */
  durationMs?: number;
  /** Estimated time remaining in seconds */
  estimatedRemainingSeconds?: number;
}

/**
 * Overall deployment progress tracking
 */
export interface DeploymentProgress {
  /** Total number of tasks */
  totalTasks: number;
  /** Successfully completed tasks */
  completedTasks: number;
  /** Failed tasks */
  failedTasks: number;
  /** Skipped tasks */
  skippedTasks: number;
  /** Currently running tasks */
  runningTasks: number;
  /** Queued tasks ready for execution */
  queuedTasks: number;
  /** Blocked tasks awaiting dependencies */
  blockedTasks: number;
  /** Pending tasks not yet processed */
  pendingTasks: number;
  /** Cancelled tasks */
  cancelledTasks: number;
  /** Progress percentage (0-100) */
  progressPercent: number;
  /** Current deployment phase */
  currentPhase: DeploymentPhase;
  /** Summary for each phase */
  phases: PhaseSummary[];
  /** Deployment start time */
  startedAt: Date;
  /** Deployment completion time */
  completedAt?: Date;
  /** Total elapsed time in milliseconds */
  elapsedMs: number;
  /** Estimated time remaining in seconds */
  estimatedRemainingSeconds: number;
  /** Overall deployment status */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
  /** Most recent error message */
  lastError?: string;
  /** Task causing the last error */
  lastFailedTask?: string;
}

/**
 * DAG validation result
 */
export interface DAGValidationResult {
  /** Whether the DAG is valid */
  valid: boolean;
  /** Validation errors found */
  errors: DAGValidationError[];
  /** Validation warnings */
  warnings: DAGValidationWarning[];
  /** Number of tasks in DAG */
  taskCount: number;
  /** Number of edges in DAG */
  edgeCount: number;
  /** Maximum depth of dependency chain */
  maxDepth: number;
  /** Tasks with no dependencies (entry points) */
  entryPoints: string[];
  /** Tasks with no dependents (exit points) */
  exitPoints: string[];
}

/**
 * DAG validation error
 */
export interface DAGValidationError {
  /** Error code for programmatic handling */
  code: 'CYCLE_DETECTED' | 'MISSING_DEPENDENCY' | 'DUPLICATE_ID' | 'SELF_REFERENCE' | 'INVALID_PHASE_ORDER';
  /** Human-readable error message */
  message: string;
  /** Affected task IDs */
  taskIds: string[];
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * DAG validation warning
 */
export interface DAGValidationWarning {
  /** Warning code */
  code: 'ORPHAN_TASK' | 'LONG_CHAIN' | 'BOTTLENECK' | 'UNBALANCED_PHASES';
  /** Human-readable warning message */
  message: string;
  /** Affected task IDs */
  taskIds: string[];
  /** Suggestion for resolution */
  suggestion?: string;
}

/**
 * Options for topological sort
 */
export interface TopologicalSortOptions {
  /** Consider task priority in ordering */
  respectPriority?: boolean;
  /** Group tasks by phase */
  groupByPhase?: boolean;
  /** Maximum tasks per group */
  maxGroupSize?: number;
}

/**
 * Result of topological sort
 */
export interface TopologicalSortResult {
  /** Ordered task IDs */
  order: string[];
  /** Execution levels (tasks at same level can run in parallel) */
  levels: string[][];
  /** Critical path (longest dependency chain) */
  criticalPath: string[];
  /** Critical path duration in seconds */
  criticalPathDuration: number;
}

/**
 * DAG graph structure for visualization
 */
export interface DAGGraph {
  /** All nodes (tasks) in the graph */
  nodes: DAGNode[];
  /** All edges (dependencies) in the graph */
  edges: TaskDependencyEdge[];
  /** Graph width (max parallel tasks) */
  width: number;
  /** Graph depth (max dependency chain) */
  depth: number;
  /** Levels for layered visualization */
  levels: DAGLevel[];
}

/**
 * Single node in DAG visualization
 */
export interface DAGNode {
  /** Task ID */
  id: string;
  /** Display label */
  label: string;
  /** Task status for coloring */
  status: TaskStatus;
  /** X position in visualization */
  x: number;
  /** Y position (level) in visualization */
  y: number;
  /** Node width for rendering */
  width: number;
  /** Whether node is currently selected */
  selected?: boolean;
  /** Whether node is highlighted (e.g., on critical path) */
  highlighted?: boolean;
}

/**
 * Level in DAG for parallel visualization
 */
export interface DAGLevel {
  /** Level index (0 = entry points) */
  index: number;
  /** Task IDs at this level */
  tasks: string[];
  /** Phase this level belongs to */
  phase?: DeploymentPhase;
  /** Whether all tasks in level can run in parallel */
  canParallelize: boolean;
}

/**
 * Options for DAG Manager initialization
 */
export interface DAGManagerOptions {
  /** Maximum parallel task execution */
  maxParallel: number;
  /** Whether to fail fast on first error */
  failFast: boolean;
  /** Continue non-dependent tasks on failure */
  continueOnError: boolean;
  /** Retry failed tasks automatically */
  autoRetry: boolean;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Delay between retries in milliseconds */
  retryDelayMs: number;
  /** Phases to skip */
  skipPhases: DeploymentPhase[];
  /** Services to skip */
  skipServices: string[];
  /** Dry run mode (no actual execution) */
  dryRun: boolean;
}

/**
 * Default DAG manager options
 */
export const DEFAULT_DAG_OPTIONS: DAGManagerOptions = {
  maxParallel: 3,
  failFast: false,
  continueOnError: true,
  autoRetry: false,
  maxRetries: 2,
  retryDelayMs: 5000,
  skipPhases: [],
  skipServices: [],
  dryRun: false,
};

/**
 * Event emitted by DAG Manager
 */
export type DAGEvent =
  | { type: 'task:queued'; taskId: string; timestamp: Date }
  | { type: 'task:started'; taskId: string; timestamp: Date }
  | { type: 'task:completed'; taskId: string; result: TaskResult; timestamp: Date }
  | { type: 'task:failed'; taskId: string; result: TaskResult; timestamp: Date }
  | { type: 'task:skipped'; taskId: string; reason: string; timestamp: Date }
  | { type: 'task:cancelled'; taskId: string; timestamp: Date }
  | { type: 'task:retrying'; taskId: string; attempt: number; maxRetries: number; timestamp: Date }
  | { type: 'phase:started'; phase: DeploymentPhase; timestamp: Date }
  | { type: 'phase:completed'; phase: DeploymentPhase; timestamp: Date }
  | { type: 'phase:failed'; phase: DeploymentPhase; timestamp: Date }
  | { type: 'deployment:started'; timestamp: Date }
  | { type: 'deployment:completed'; timestamp: Date }
  | { type: 'deployment:failed'; reason: string; timestamp: Date }
  | { type: 'deployment:paused'; timestamp: Date }
  | { type: 'deployment:resumed'; timestamp: Date }
  | { type: 'deployment:cancelled'; timestamp: Date }
  | { type: 'progress:updated'; progress: DeploymentProgress; timestamp: Date };

/**
 * Callback type for DAG events
 */
export type DAGEventCallback = (event: DAGEvent) => void;

/**
 * Interface for DAG Manager implementation
 */
export interface IDAGManager {
  /**
   * Initialize DAG with tasks
   * @param tasks - Array of deployment tasks
   * @param options - DAG manager options
   */
  initialize(tasks: DeployTask[], options?: Partial<DAGManagerOptions>): void;

  /**
   * Validate DAG structure (no cycles, valid dependencies)
   * @returns Validation result
   */
  validate(): DAGValidationResult;

  /**
   * Get all tasks in the DAG
   * @param filter - Optional filter criteria
   * @param sort - Optional sort options
   * @returns Array of tasks
   */
  getTasks(filter?: TaskFilter, sort?: TaskSortOptions): DeployTask[];

  /**
   * Get a single task by ID
   * @param taskId - Task identifier
   * @returns Task or undefined
   */
  getTask(taskId: string): DeployTask | undefined;

  /**
   * Get tasks that are ready for execution
   * (dependencies satisfied, not already running)
   * @param maxCount - Maximum tasks to return
   * @returns Array of ready tasks
   */
  getReadyTasks(maxCount?: number): DeployTask[];

  /**
   * Get tasks that are currently running
   * @returns Array of running tasks
   */
  getRunningTasks(): DeployTask[];

  /**
   * Get tasks blocked by dependencies
   * @returns Array of blocked tasks with blocking task IDs
   */
  getBlockedTasks(): Array<{ task: DeployTask; blockedBy: string[] }>;

  /**
   * Update task status
   * @param taskId - Task identifier
   * @param status - New status
   * @param result - Optional execution result
   */
  updateTaskStatus(taskId: string, status: TaskStatus, result?: TaskResult): void;

  /**
   * Get current deployment progress
   * @returns Progress information
   */
  getProgress(): DeploymentProgress;

  /**
   * Get phase summaries
   * @returns Array of phase summaries
   */
  getPhaseSummaries(): PhaseSummary[];

  /**
   * Get summary for a specific phase
   * @param phase - Deployment phase
   * @returns Phase summary
   */
  getPhaseSummary(phase: DeploymentPhase): PhaseSummary;

  /**
   * Get task statistics
   * @returns Task statistics
   */
  getStatistics(): TaskStatistics;

  /**
   * Get dependency edges for visualization
   * @returns Array of dependency edges
   */
  getDependencyEdges(): TaskDependencyEdge[];

  /**
   * Get DAG graph structure for visualization
   * @returns DAG graph
   */
  getGraph(): DAGGraph;

  /**
   * Get topological sort of tasks
   * @param options - Sort options
   * @returns Sort result with execution order
   */
  getTopologicalSort(options?: TopologicalSortOptions): TopologicalSortResult;

  /**
   * Get critical path (longest dependency chain)
   * @returns Array of task IDs on critical path
   */
  getCriticalPath(): string[];

  /**
   * Check if deployment is complete
   * @returns True if all tasks completed
   */
  isComplete(): boolean;

  /**
   * Check if deployment has failures
   * @returns True if any task failed
   */
  hasFailed(): boolean;

  /**
   * Check if a task can be executed
   * @param taskId - Task identifier
   * @returns True if task can run
   */
  canExecute(taskId: string): boolean;

  /**
   * Skip a task and update dependents
   * @param taskId - Task identifier
   * @param reason - Reason for skipping
   */
  skipTask(taskId: string, reason: string): void;

  /**
   * Retry a failed task
   * @param taskId - Task identifier
   * @returns True if retry was initiated
   */
  retryTask(taskId: string): boolean;

  /**
   * Cancel a task
   * @param taskId - Task identifier
   * @param cascade - Also cancel dependent tasks
   */
  cancelTask(taskId: string, cascade?: boolean): void;

  /**
   * Enable or disable a task
   * @param taskId - Task identifier
   * @param enabled - Whether task is enabled
   */
  setTaskEnabled(taskId: string, enabled: boolean): void;

  /**
   * Subscribe to DAG events
   * @param callback - Event callback
   * @returns Unsubscribe function
   */
  subscribe(callback: DAGEventCallback): () => void;

  /**
   * Reset DAG to initial state
   */
  reset(): void;

  /**
   * Export DAG state for persistence
   * @returns Serializable DAG state
   */
  exportState(): DAGState;

  /**
   * Import DAG state from persistence
   * @param state - Previously exported state
   */
  importState(state: DAGState): void;
}

/**
 * Serializable DAG state for persistence
 */
export interface DAGState {
  /** Version for migration support */
  version: string;
  /** Tasks with current state */
  tasks: DeployTask[];
  /** Manager options */
  options: DAGManagerOptions;
  /** Progress snapshot */
  progress: DeploymentProgress;
  /** State creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * DAG traversal visitor interface
 */
export interface DAGVisitor {
  /**
   * Called when entering a task node
   * @param task - Current task
   * @param depth - Current depth in traversal
   * @returns False to skip children
   */
  enterTask?(task: DeployTask, depth: number): boolean | void;

  /**
   * Called when leaving a task node
   * @param task - Current task
   * @param depth - Current depth in traversal
   */
  leaveTask?(task: DeployTask, depth: number): void;

  /**
   * Called when traversing an edge
   * @param from - Source task
   * @param to - Target task
   */
  visitEdge?(from: DeployTask, to: DeployTask): void;
}

/**
 * Options for DAG traversal
 */
export interface DAGTraversalOptions {
  /** Starting task IDs (default: entry points) */
  startFrom?: string[];
  /** Maximum depth to traverse */
  maxDepth?: number;
  /** Traversal direction */
  direction: 'forward' | 'backward';
  /** Include disabled tasks */
  includeDisabled?: boolean;
}
