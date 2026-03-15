/**
 * Task interfaces for TUI deployment with DAG dependencies
 *
 * This module defines the core task types used throughout the deployment
 * TUI system for representing individual deployment tasks, their status,
 * timing information, and execution results.
 */

import { DeploymentPhase } from '../../../../interfaces/deployment.interface';

/**
 * Status of a deployment task in the DAG
 */
export enum TaskStatus {
  /** Task has not been processed yet */
  PENDING = 'pending',
  /** Task is waiting for dependencies to complete */
  BLOCKED = 'blocked',
  /** Dependencies met, waiting for execution slot */
  QUEUED = 'queued',
  /** Task is currently executing */
  RUNNING = 'running',
  /** Task completed successfully */
  SUCCESS = 'success',
  /** Task failed with error */
  FAILED = 'failed',
  /** Task was skipped (optional or dependency failed) */
  SKIPPED = 'skipped',
  /** Task was cancelled by user or system */
  CANCELLED = 'cancelled',
}

/**
 * Type of task determining the executor strategy
 */
export enum TaskType {
  /** Execute Ansible playbook or role with tags */
  ANSIBLE = 'ansible',
  /** Execute Helmfile command (diff, apply, sync) */
  HELMFILE = 'helmfile',
  /** Execute kubectl commands directly */
  KUBECTL = 'kubectl',
  /** Execute arbitrary shell commands */
  SHELL = 'shell',
  /** Run validation checks (health, connectivity) */
  VALIDATION = 'validation',
  /** Composite task containing subtasks */
  COMPOSITE = 'composite',
}

/**
 * Log level for task output
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Single line of task output
 */
export interface LogLine {
  /** ISO timestamp of log entry */
  timestamp: Date;
  /** Log level/severity */
  level: LogLevel;
  /** Log message content */
  message: string;
  /** Source of log (stdout, stderr, system) */
  source: 'stdout' | 'stderr' | 'system';
  /** Task ID this log belongs to */
  taskId: string;
}

/**
 * Timing information for task execution
 */
export interface TaskTiming {
  /** When task was added to queue */
  queuedAt?: Date;
  /** When task started executing */
  startedAt?: Date;
  /** When task completed (success or failure) */
  completedAt?: Date;
  /** Total execution duration in milliseconds */
  durationMs?: number;
  /** Time spent waiting for dependencies in milliseconds */
  waitDurationMs?: number;
}

/**
 * Result of task execution
 */
export interface TaskResult {
  /** Exit code from command (0 = success) */
  exitCode: number;
  /** Human-readable status message */
  message: string;
  /** Detailed error information if failed */
  error?: string;
  /** Stack trace for debugging */
  stackTrace?: string;
  /** Number of retry attempts made */
  retryCount: number;
  /** Structured output data from task */
  output?: Record<string, unknown>;
  /** Changed resources (for Ansible/Helmfile) */
  changes?: TaskChange[];
}

/**
 * Resource change made by a task
 */
export interface TaskChange {
  /** Type of change (create, update, delete) */
  action: 'create' | 'update' | 'delete' | 'skip';
  /** Resource type (deployment, service, secret, etc.) */
  resourceType: string;
  /** Resource name */
  resourceName: string;
  /** Kubernetes namespace if applicable */
  namespace?: string;
  /** Diff of changes if available */
  diff?: string;
}

/**
 * Configuration for Ansible task execution
 */
export interface AnsibleTaskConfig {
  /** Ansible playbook file path */
  playbook: string;
  /** Tags to run */
  tags: string[];
  /** Skip tags */
  skipTags?: string[];
  /** Inventory file */
  inventory: string;
  /** Extra variables */
  extraVars?: Record<string, string | number | boolean>;
  /** Limit to specific hosts */
  limit?: string;
  /** Vault password file path */
  vaultPasswordFile?: string;
  /** Number of forks for parallel execution */
  forks?: number;
  /** Check mode (dry run) */
  check?: boolean;
  /** Diff mode (show changes) */
  diff?: boolean;
}

/**
 * Configuration for Helmfile task execution
 */
export interface HelmfileTaskConfig {
  /** Helmfile command (diff, apply, sync, destroy) */
  command: 'diff' | 'apply' | 'sync' | 'destroy' | 'template';
  /** Helmfile environment */
  environment: string;
  /** Selector for specific releases */
  selector?: string;
  /** Working directory for helmfile */
  workingDir: string;
  /** Additional helmfile args */
  args?: string[];
  /** Skip diff before apply */
  skipDiff?: boolean;
  /** Include chart tests */
  includeTests?: boolean;
}

/**
 * Configuration for kubectl task execution
 */
export interface KubectlTaskConfig {
  /** kubectl command (apply, delete, wait, exec) */
  command: string;
  /** Command arguments */
  args: string[];
  /** Namespace for operation */
  namespace?: string;
  /** Kubeconfig file path */
  kubeconfig?: string;
  /** Context to use */
  context?: string;
  /** Wait for condition */
  wait?: {
    /** Resource to wait for */
    resource: string;
    /** Condition to wait for */
    condition: string;
    /** Timeout in seconds */
    timeout: number;
  };
}

/**
 * Configuration for shell task execution
 */
export interface ShellTaskConfig {
  /** Shell command to execute */
  command: string;
  /** Working directory */
  workingDir?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Shell to use (bash, sh, zsh) */
  shell?: string;
  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * Configuration for validation task execution
 */
export interface ValidationTaskConfig {
  /** Type of validation */
  type: 'health' | 'connectivity' | 'dns' | 'certificate' | 'custom';
  /** Target to validate (URL, host:port, etc.) */
  target: string;
  /** Expected result */
  expected?: string | number | boolean;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Retry configuration */
  retry?: {
    /** Maximum number of retries */
    maxRetries: number;
    /** Delay between retries in milliseconds */
    delayMs: number;
    /** Exponential backoff multiplier */
    backoffMultiplier?: number;
  };
}

/**
 * Union type for task-specific configuration
 */
export type TaskConfig =
  | { type: TaskType.ANSIBLE; config: AnsibleTaskConfig }
  | { type: TaskType.HELMFILE; config: HelmfileTaskConfig }
  | { type: TaskType.KUBECTL; config: KubectlTaskConfig }
  | { type: TaskType.SHELL; config: ShellTaskConfig }
  | { type: TaskType.VALIDATION; config: ValidationTaskConfig }
  | { type: TaskType.COMPOSITE; config: CompositeTaskConfig };

/**
 * Configuration for composite task with subtasks
 */
export interface CompositeTaskConfig {
  /** Strategy for executing subtasks */
  strategy: 'sequential' | 'parallel' | 'race';
  /** Subtask IDs to execute */
  subtasks: string[];
  /** Continue on subtask failure */
  continueOnError?: boolean;
  /** Maximum parallel subtasks (for parallel strategy) */
  maxParallel?: number;
}

/**
 * Core deployment task definition
 */
export interface DeployTask {
  /** Unique task identifier */
  id: string;
  /** Human-readable task name */
  name: string;
  /** Detailed task description */
  description: string;
  /** Deployment phase this task belongs to */
  phase: DeploymentPhase;
  /** Type of task (determines executor) */
  type: TaskType;
  /** Current task status */
  status: TaskStatus;
  /** IDs of tasks this task depends on */
  dependencies: string[];
  /** IDs of tasks that depend on this task */
  dependents: string[];
  /** Service name if task is service-specific */
  service?: string;
  /** Kubernetes namespace if applicable */
  namespace?: string;
  /** Ansible tags for ANSIBLE type tasks */
  ansibleTags?: string[];
  /** Helmfile selector for HELMFILE type tasks */
  helmfileSelector?: string;
  /** Whether task is required for deployment to succeed */
  mandatory: boolean;
  /** Whether task is enabled for execution */
  enabled: boolean;
  /** Estimated duration in seconds */
  estimatedDuration: number;
  /** Execution timing information */
  timing: TaskTiming;
  /** Execution result after completion */
  result?: TaskResult;
  /** Task execution logs */
  logs: LogLine[];
  /** Task-specific configuration */
  taskConfig?: TaskConfig;
  /** User-defined metadata */
  metadata?: Record<string, unknown>;
  /** Task priority (lower = higher priority) */
  priority?: number;
  /** Maximum retry attempts on failure */
  maxRetries?: number;
  /** Current retry attempt number */
  retryAttempt?: number;
  /** Whether to allow concurrent execution with other tasks */
  allowConcurrent?: boolean;
}

/**
 * Task filter criteria for querying tasks
 */
export interface TaskFilter {
  /** Filter by status */
  status?: TaskStatus | TaskStatus[];
  /** Filter by type */
  type?: TaskType | TaskType[];
  /** Filter by phase */
  phase?: DeploymentPhase | DeploymentPhase[];
  /** Filter by service name */
  service?: string;
  /** Filter by namespace */
  namespace?: string;
  /** Filter by mandatory flag */
  mandatory?: boolean;
  /** Filter by enabled flag */
  enabled?: boolean;
}

/**
 * Task sorting options
 */
export interface TaskSortOptions {
  /** Field to sort by */
  field: 'name' | 'phase' | 'status' | 'priority' | 'startedAt' | 'duration';
  /** Sort direction */
  direction: 'asc' | 'desc';
}

/**
 * Batch of tasks for grouped operations
 */
export interface TaskBatch {
  /** Batch identifier */
  id: string;
  /** Tasks in this batch */
  tasks: DeployTask[];
  /** Batch execution strategy */
  strategy: 'sequential' | 'parallel';
  /** Maximum concurrent tasks in batch */
  maxConcurrent?: number;
}

/**
 * Task dependency edge for DAG visualization
 */
export interface TaskDependencyEdge {
  /** Source task ID (dependency) */
  from: string;
  /** Target task ID (dependent) */
  to: string;
  /** Whether dependency is satisfied */
  satisfied: boolean;
  /** Whether dependency is blocking execution */
  blocking: boolean;
}

/**
 * Statistics for a set of tasks
 */
export interface TaskStatistics {
  /** Total number of tasks */
  total: number;
  /** Tasks by status */
  byStatus: Record<TaskStatus, number>;
  /** Tasks by type */
  byType: Record<TaskType, number>;
  /** Tasks by phase */
  byPhase: Record<DeploymentPhase, number>;
  /** Total estimated duration in seconds */
  totalEstimatedDuration: number;
  /** Total actual duration in milliseconds */
  totalActualDuration: number;
  /** Average task duration in milliseconds */
  averageDuration: number;
  /** Number of failed tasks */
  failedCount: number;
  /** Number of tasks with retries */
  retriedCount: number;
}
