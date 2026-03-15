/**
 * Task executor interfaces for deployment TUI
 *
 * This module defines interfaces for executing deployment tasks,
 * managing concurrent execution, and streaming task events.
 */

import { Observable } from 'rxjs';
import {
  DeployTask,
  TaskResult,
  LogLine,
  TaskType,
  AnsibleTaskConfig,
  HelmfileTaskConfig,
  KubectlTaskConfig,
  ShellTaskConfig,
  ValidationTaskConfig,
} from './task.interface';

/**
 * Events emitted during task execution
 */
export type TaskEvent =
  | { type: 'started'; taskId: string; timestamp: Date }
  | { type: 'log'; taskId: string; log: LogLine }
  | { type: 'progress'; taskId: string; percent: number; message: string; timestamp: Date }
  | { type: 'completed'; taskId: string; result: TaskResult; timestamp: Date }
  | { type: 'failed'; taskId: string; result: TaskResult; timestamp: Date }
  | { type: 'cancelled'; taskId: string; timestamp: Date }
  | { type: 'retrying'; taskId: string; attempt: number; reason: string; timestamp: Date };

/**
 * Options for task executor
 */
export interface ExecutorOptions {
  /** Maximum parallel task execution */
  maxParallel: number;
  /** Dry run mode (simulate execution) */
  dryRun: boolean;
  /** Path to Ansible installation */
  ansiblePath: string;
  /** Path to Kubernetes manifests */
  kubernetesPath: string;
  /** Ansible inventory file */
  inventoryFile: string;
  /** Ansible vault password file */
  vaultPasswordFile: string;
  /** Kubeconfig file path */
  kubeconfigPath?: string;
  /** Kubernetes context to use */
  kubeContext?: string;
  /** Helmfile working directory */
  helmfilePath: string;
  /** Default task timeout in milliseconds */
  defaultTimeout: number;
  /** Enable verbose logging */
  verbose: boolean;
  /** Capture stderr separately */
  captureStderr: boolean;
  /** Environment variables for all tasks */
  environment?: Record<string, string>;
}

/**
 * Default executor options
 */
export const DEFAULT_EXECUTOR_OPTIONS: ExecutorOptions = {
  maxParallel: 3,
  dryRun: false,
  ansiblePath: '/usr/local/bin/ansible-playbook',
  kubernetesPath: './kubernetes',
  inventoryFile: './ansible/inventory/hosts.ini',
  vaultPasswordFile: '~/.ansible_vault_password',
  helmfilePath: './kubernetes',
  defaultTimeout: 600000, // 10 minutes
  verbose: false,
  captureStderr: true,
};

/**
 * Task execution context
 */
export interface ExecutionContext {
  /** Task being executed */
  task: DeployTask;
  /** Executor options */
  options: ExecutorOptions;
  /** Working directory */
  workingDir: string;
  /** Environment variables */
  environment: Record<string, string>;
  /** Abort signal for cancellation */
  abortSignal: AbortSignal;
  /** Start time of execution */
  startedAt: Date;
  /** Log buffer for collecting logs */
  logs: LogLine[];
}

/**
 * Result of task execution
 */
export interface ExecutionResult {
  /** Task that was executed */
  task: DeployTask;
  /** Execution result */
  result: TaskResult;
  /** All logs from execution */
  logs: LogLine[];
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Whether task was cancelled */
  cancelled: boolean;
}

/**
 * Interface for task executor implementation
 */
export interface ITaskExecutor {
  /**
   * Execute a single task
   * @param task - Task to execute
   * @returns Observable of task events
   */
  execute(task: DeployTask): Observable<TaskEvent>;

  /**
   * Cancel a running task
   * @param taskId - ID of task to cancel
   * @returns True if task was cancelled
   */
  cancel(taskId: string): boolean;

  /**
   * Cancel all running tasks
   */
  cancelAll(): void;

  /**
   * Get number of currently running tasks
   * @returns Number of running tasks
   */
  getRunningCount(): number;

  /**
   * Check if executor can accept more tasks
   * @returns True if under parallel limit
   */
  canAcceptMore(): boolean;

  /**
   * Get list of running task IDs
   * @returns Array of task IDs
   */
  getRunningTaskIds(): string[];

  /**
   * Check if a specific task is running
   * @param taskId - Task ID to check
   * @returns True if task is running
   */
  isRunning(taskId: string): boolean;

  /**
   * Get current executor options
   * @returns Executor options
   */
  getOptions(): ExecutorOptions;

  /**
   * Update executor options
   * @param options - Partial options to update
   */
  updateOptions(options: Partial<ExecutorOptions>): void;

  /**
   * Wait for all running tasks to complete
   * @param timeout - Optional timeout in milliseconds
   * @returns Promise that resolves when all tasks complete
   */
  waitForAll(timeout?: number): Promise<ExecutionResult[]>;

  /**
   * Get execution statistics
   * @returns Execution statistics
   */
  getStatistics(): ExecutorStatistics;
}

/**
 * Executor statistics
 */
export interface ExecutorStatistics {
  /** Total tasks executed */
  totalExecuted: number;
  /** Successfully completed tasks */
  successCount: number;
  /** Failed tasks */
  failedCount: number;
  /** Cancelled tasks */
  cancelledCount: number;
  /** Currently running tasks */
  runningCount: number;
  /** Average execution time in milliseconds */
  averageExecutionTime: number;
  /** Longest task execution in milliseconds */
  longestExecutionTime: number;
  /** Executor uptime in milliseconds */
  uptimeMs: number;
  /** Tasks per type */
  byType: Record<TaskType, number>;
}

/**
 * Interface for type-specific task handler
 */
export interface ITaskHandler<TConfig = unknown> {
  /** Task type this handler supports */
  readonly taskType: TaskType;

  /**
   * Execute task with type-specific logic
   * @param context - Execution context
   * @param config - Type-specific configuration
   * @returns Observable of task events
   */
  execute(context: ExecutionContext, config: TConfig): Observable<TaskEvent>;

  /**
   * Validate task configuration
   * @param config - Configuration to validate
   * @returns Validation errors or empty array
   */
  validate(config: TConfig): string[];

  /**
   * Estimate execution duration
   * @param config - Task configuration
   * @returns Estimated duration in seconds
   */
  estimateDuration(config: TConfig): number;
}

/**
 * Ansible task handler interface
 */
export interface IAnsibleTaskHandler extends ITaskHandler<AnsibleTaskConfig> {
  /** Get available Ansible tags from playbook */
  getAvailableTags(playbook: string): Promise<string[]>;

  /** Get inventory hosts */
  getInventoryHosts(inventory: string): Promise<string[]>;

  /** Check Ansible installation */
  checkInstallation(): Promise<boolean>;
}

/**
 * Helmfile task handler interface
 */
export interface IHelmfileTaskHandler extends ITaskHandler<HelmfileTaskConfig> {
  /** Get available releases */
  getAvailableReleases(environment: string): Promise<string[]>;

  /** Get release status */
  getReleaseStatus(release: string, namespace: string): Promise<HelmReleaseStatus>;

  /** Check Helmfile installation */
  checkInstallation(): Promise<boolean>;
}

/**
 * Helm release status
 */
export interface HelmReleaseStatus {
  /** Release name */
  name: string;
  /** Namespace */
  namespace: string;
  /** Release status */
  status: 'deployed' | 'failed' | 'pending' | 'unknown';
  /** Current revision */
  revision: number;
  /** Last deployed timestamp */
  lastDeployed?: Date;
  /** Chart name */
  chart: string;
  /** Chart version */
  chartVersion: string;
  /** App version */
  appVersion?: string;
}

/**
 * Kubectl task handler interface
 */
export interface IKubectlTaskHandler extends ITaskHandler<KubectlTaskConfig> {
  /** Get available contexts */
  getAvailableContexts(): Promise<string[]>;

  /** Get current context */
  getCurrentContext(): Promise<string>;

  /** Check kubectl installation */
  checkInstallation(): Promise<boolean>;

  /** Check cluster connectivity */
  checkConnectivity(): Promise<boolean>;
}

/**
 * Shell task handler interface
 */
export interface IShellTaskHandler extends ITaskHandler<ShellTaskConfig> {
  /** Get available shells */
  getAvailableShells(): string[];

  /** Check if command exists */
  commandExists(command: string): Promise<boolean>;
}

/**
 * Validation task handler interface
 */
export interface IValidationTaskHandler extends ITaskHandler<ValidationTaskConfig> {
  /** Run health check */
  runHealthCheck(target: string, timeout: number): Promise<boolean>;

  /** Run connectivity check */
  runConnectivityCheck(host: string, port: number, timeout: number): Promise<boolean>;

  /** Run DNS check */
  runDnsCheck(hostname: string, timeout: number): Promise<string | null>;

  /** Run certificate check */
  runCertificateCheck(url: string): Promise<CertificateInfo | null>;
}

/**
 * Certificate information from validation
 */
export interface CertificateInfo {
  /** Certificate subject */
  subject: string;
  /** Certificate issuer */
  issuer: string;
  /** Valid from date */
  validFrom: Date;
  /** Valid until date */
  validTo: Date;
  /** Days until expiration */
  daysUntilExpiry: number;
  /** Whether certificate is valid */
  isValid: boolean;
  /** Certificate chain depth */
  chainDepth: number;
}

/**
 * Task execution queue interface
 */
export interface ITaskQueue {
  /**
   * Add task to queue
   * @param task - Task to queue
   * @param priority - Priority (lower = higher priority)
   */
  enqueue(task: DeployTask, priority?: number): void;

  /**
   * Get next task from queue
   * @returns Next task or undefined if empty
   */
  dequeue(): DeployTask | undefined;

  /**
   * Peek at next task without removing
   * @returns Next task or undefined if empty
   */
  peek(): DeployTask | undefined;

  /**
   * Remove task from queue
   * @param taskId - Task ID to remove
   * @returns True if task was removed
   */
  remove(taskId: string): boolean;

  /**
   * Check if queue contains task
   * @param taskId - Task ID to check
   * @returns True if task is in queue
   */
  contains(taskId: string): boolean;

  /**
   * Get current queue size
   * @returns Number of tasks in queue
   */
  size(): number;

  /**
   * Check if queue is empty
   * @returns True if queue is empty
   */
  isEmpty(): boolean;

  /**
   * Clear all tasks from queue
   */
  clear(): void;

  /**
   * Get all tasks in queue
   * @returns Array of queued tasks
   */
  getAll(): DeployTask[];

  /**
   * Update task priority
   * @param taskId - Task ID
   * @param priority - New priority
   */
  updatePriority(taskId: string, priority: number): void;
}

/**
 * Process spawn options for task execution
 */
export interface SpawnOptions {
  /** Command to execute */
  command: string;
  /** Command arguments */
  args: string[];
  /** Working directory */
  cwd: string;
  /** Environment variables */
  env: Record<string, string>;
  /** Timeout in milliseconds */
  timeout: number;
  /** Shell to use */
  shell?: string | boolean;
  /** Abort signal */
  signal?: AbortSignal;
  /** Combine stdout and stderr */
  combinedOutput?: boolean;
}

/**
 * Process result from task execution
 */
export interface SpawnResult {
  /** Exit code */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Combined output (if combinedOutput was true) */
  combined?: string;
  /** Whether process was killed */
  killed: boolean;
  /** Signal that killed process */
  signal?: string;
  /** Execution duration in milliseconds */
  durationMs: number;
}

/**
 * Retry policy for task execution
 */
export interface RetryPolicy {
  /** Maximum retry attempts */
  maxRetries: number;
  /** Initial delay between retries in milliseconds */
  initialDelayMs: number;
  /** Maximum delay between retries in milliseconds */
  maxDelayMs: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
  /** Exit codes that should trigger retry */
  retryableExitCodes: number[];
  /** Error patterns that should trigger retry */
  retryableErrors: RegExp[];
  /** Whether to retry on timeout */
  retryOnTimeout: boolean;
}

/**
 * Default retry policy
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 2,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableExitCodes: [1, 2, 137], // Generic errors and OOM
  retryableErrors: [
    /connection refused/i,
    /timeout/i,
    /temporary failure/i,
    /resource temporarily unavailable/i,
  ],
  retryOnTimeout: true,
};
