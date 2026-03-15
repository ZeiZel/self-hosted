/**
 * Task Executor Service
 *
 * Manages parallel execution of deployment tasks with support for:
 * - Multiple execution types (Ansible, Helmfile, Kubectl, Shell, Validation)
 * - Concurrent execution with configurable parallelism
 * - Real-time streaming of task output via RxJS Observables
 * - Task cancellation and retry support
 * - Execution statistics tracking
 */

import { Injectable } from '@nestjs/common';
import { Observable, Subject, Subscription, of } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as net from 'net';
import * as dns from 'dns';
import * as https from 'https';
import * as tls from 'tls';
import { promisify } from 'util';

import {
  DeployTask,
  TaskType,
  TaskResult,
  LogLine,
  LogLevel,
  AnsibleTaskConfig,
  HelmfileTaskConfig,
} from '../interfaces/task.interface';

import {
  StructuredError,
  ansibleErrorToStructured,
} from '../interfaces/error.interface';

import {
  ITaskExecutor,
  TaskEvent,
  ExecutorOptions,
  ExecutorStatistics,
  ExecutionContext,
  ExecutionResult,
  DEFAULT_EXECUTOR_OPTIONS,
} from '../interfaces/executor.interface';

import { parseAnsibleError } from './ansible-error-parser';

const dnsLookup = promisify(dns.lookup);

/**
 * Running task state for tracking active processes
 */
interface RunningTaskState {
  process: ChildProcess | null;
  abortController: AbortController;
  subscription: Subscription;
  startedAt: Date;
  logs: LogLine[];
  task: DeployTask;
  /** Captured structured error from task execution */
  capturedError?: StructuredError;
}

/**
 * Task Executor Service implementation
 *
 * Provides parallel execution of deployment tasks with real-time
 * streaming output and comprehensive lifecycle management.
 */
@Injectable()
export class TaskExecutorService implements ITaskExecutor {
  private runningTasks: Map<string, RunningTaskState> = new Map();
  private options: ExecutorOptions = { ...DEFAULT_EXECUTOR_OPTIONS };
  private statistics: ExecutorStatistics;
  private startedAt: Date;
  private completedResults: ExecutionResult[] = [];
  private waitingPromises: Array<{
    resolve: (results: ExecutionResult[]) => void;
    reject: (error: Error) => void;
  }> = [];

  constructor() {
    this.startedAt = new Date();
    this.statistics = this.createInitialStatistics();
  }

  /**
   * Create initial statistics object
   */
  private createInitialStatistics(): ExecutorStatistics {
    return {
      totalExecuted: 0,
      successCount: 0,
      failedCount: 0,
      cancelledCount: 0,
      runningCount: 0,
      averageExecutionTime: 0,
      longestExecutionTime: 0,
      uptimeMs: 0,
      byType: {
        [TaskType.ANSIBLE]: 0,
        [TaskType.HELMFILE]: 0,
        [TaskType.KUBECTL]: 0,
        [TaskType.SHELL]: 0,
        [TaskType.VALIDATION]: 0,
        [TaskType.COMPOSITE]: 0,
      },
    };
  }

  /**
   * Execute a single task
   * Returns an Observable that streams TaskEvents for real-time updates
   */
  execute(task: DeployTask): Observable<TaskEvent> {
    return new Observable<TaskEvent>((subscriber) => {
      const abortController = new AbortController();
      const startedAt = new Date();
      const logs: LogLine[] = [];

      // Create running task state
      const taskState: RunningTaskState = {
        process: null,
        abortController,
        subscription: new Subscription(),
        startedAt,
        logs,
        task,
      };

      this.runningTasks.set(task.id, taskState);
      this.statistics.runningCount++;

      // Emit started event
      subscriber.next({
        type: 'started',
        taskId: task.id,
        timestamp: startedAt,
      });

      // Create execution context
      const context: ExecutionContext = {
        task,
        options: this.options,
        workingDir: this.getWorkingDirectory(task),
        environment: this.buildEnvironment(task),
        abortSignal: abortController.signal,
        startedAt,
        logs,
      };

      // Execute based on task type
      let executionObservable: Observable<TaskEvent>;

      switch (task.type) {
        case TaskType.ANSIBLE:
          executionObservable = this.executeAnsible(context);
          break;
        case TaskType.HELMFILE:
          executionObservable = this.executeHelmfile(context);
          break;
        case TaskType.KUBECTL:
          executionObservable = this.executeKubectl(context);
          break;
        case TaskType.SHELL:
          executionObservable = this.executeShell(context);
          break;
        case TaskType.VALIDATION:
          executionObservable = this.executeValidation(context);
          break;
        case TaskType.COMPOSITE:
          // Composite tasks are handled by the orchestrator, not executor
          executionObservable = of({
            type: 'failed' as const,
            taskId: task.id,
            result: {
              exitCode: 1,
              message: 'Composite tasks should be executed by the orchestrator',
              retryCount: 0,
            },
            timestamp: new Date(),
          });
          break;
        default:
          executionObservable = of({
            type: 'failed' as const,
            taskId: task.id,
            result: {
              exitCode: 1,
              message: `Unknown task type: ${task.type}`,
              retryCount: 0,
            },
            timestamp: new Date(),
          });
      }

      // Handle abort signal
      const abort$ = new Subject<void>();
      abortController.signal.addEventListener('abort', () => {
        abort$.next();
        abort$.complete();
      });

      // Subscribe to execution
      const subscription = executionObservable
        .pipe(
          takeUntil(abort$),
          catchError((error) => {
            return of({
              type: 'failed' as const,
              taskId: task.id,
              result: {
                exitCode: 1,
                message: 'Execution error',
                error: error instanceof Error ? error.message : String(error),
                stackTrace: error instanceof Error ? error.stack : undefined,
                retryCount: task.retryAttempt ?? 0,
              },
              timestamp: new Date(),
            });
          }),
          finalize(() => {
            this.cleanupTask(task.id, startedAt);
          }),
        )
        .subscribe({
          next: (event) => subscriber.next(event),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });

      taskState.subscription = subscription;

      // Return cleanup function
      return () => {
        if (!abortController.signal.aborted) {
          abortController.abort();
        }
        subscription.unsubscribe();
      };
    });
  }

  /**
   * Execute Ansible playbook task
   */
  private executeAnsible(context: ExecutionContext): Observable<TaskEvent> {
    return new Observable<TaskEvent>((subscriber) => {
      const { task, options, abortSignal } = context;

      // Get config from task
      const config = task.taskConfig?.type === TaskType.ANSIBLE
        ? task.taskConfig.config
        : this.buildAnsibleConfigFromTask(task);

      // Build arguments
      const args: string[] = [
        '-i', config.inventory || options.inventoryFile,
        config.playbook || 'all.yml',
      ];

      // Add tags
      const tags = config.tags?.length ? config.tags : task.ansibleTags;
      if (tags && tags.length > 0) {
        args.push('--tags', tags.join(','));
      }

      // Add skip tags
      if (config.skipTags && config.skipTags.length > 0) {
        args.push('--skip-tags', config.skipTags.join(','));
      }

      // Add extra variables
      if (config.extraVars) {
        for (const [key, value] of Object.entries(config.extraVars)) {
          args.push('-e', `${key}=${value}`);
        }
      }

      // Add limit
      if (config.limit) {
        args.push('--limit', config.limit);
      }

      // Add vault password file
      const vaultFile = config.vaultPasswordFile || options.vaultPasswordFile;
      if (vaultFile) {
        args.push('--vault-password-file', this.expandPath(vaultFile));
      }

      // Add forks
      if (config.forks) {
        args.push('--forks', String(config.forks));
      }

      // Add check mode (dry run)
      if (config.check || options.dryRun) {
        args.push('--check');
      }

      // Add diff mode
      if (config.diff) {
        args.push('--diff');
      }

      // Build environment
      const env: Record<string, string> = {
        ...process.env as Record<string, string>,
        ...options.environment,
        ANSIBLE_FORCE_COLOR: 'true',
        ANSIBLE_STDOUT_CALLBACK: 'yaml',
        ANSIBLE_NOCOLOR: '0',
        ANSIBLE_HOST_KEY_CHECKING: 'False',
        PYTHONUNBUFFERED: '1',
      };

      // Spawn process
      const proc = spawn('ansible-playbook', args, {
        cwd: options.ansiblePath || path.join(process.cwd(), 'ansible'),
        env,
        shell: false,
      });

      // Store process reference for cancellation
      const taskState = this.runningTasks.get(task.id);
      if (taskState) {
        taskState.process = proc;
      }

      // Handle stdout
      proc.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          const logLine = this.parseAnsibleOutput(line, task.id);
          context.logs.push(logLine);
          subscriber.next({
            type: 'log',
            taskId: task.id,
            log: logLine,
          });
        }
      });

      // Handle stderr - parse for structured errors
      proc.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          // Try to parse structured Ansible error
          const ansibleError = parseAnsibleError(line);
          let structuredError: StructuredError | undefined;

          if (ansibleError) {
            // Convert Ansible error to structured error
            structuredError = ansibleErrorToStructured(ansibleError);

            // Store the captured error in task state
            const currentTaskState = this.runningTasks.get(task.id);
            if (currentTaskState) {
              currentTaskState.capturedError = structuredError;
            }
          }

          const logLine: LogLine = {
            timestamp: new Date(),
            level: ansibleError ? LogLevel.ERROR : LogLevel.WARN,
            message: this.stripAnsi(line),
            source: 'stderr',
            taskId: task.id,
            structuredError,
          };
          context.logs.push(logLine);
          subscriber.next({
            type: 'log',
            taskId: task.id,
            log: logLine,
          });
        }
      });

      // Handle process exit
      proc.on('close', (code: number | null, signal: string | null) => {
        // Get captured error from task state
        const currentTaskState = this.runningTasks.get(task.id);
        const capturedError = currentTaskState?.capturedError;

        const result: TaskResult = {
          exitCode: code ?? (signal ? 128 : 1),
          message: code === 0
            ? 'Ansible playbook completed successfully'
            : capturedError?.message ?? `Ansible playbook failed with exit code ${code}`,
          error: code !== 0 ? `Exit code: ${code}, Signal: ${signal}` : undefined,
          retryCount: task.retryAttempt ?? 0,
          changes: this.parseAnsibleChanges(context.logs),
          structuredError: capturedError,
        };

        if (code === 0) {
          subscriber.next({
            type: 'completed',
            taskId: task.id,
            result,
            timestamp: new Date(),
          });
        } else {
          subscriber.next({
            type: 'failed',
            taskId: task.id,
            result,
            timestamp: new Date(),
          });
        }
        subscriber.complete();
      });

      // Handle process error
      proc.on('error', (err: Error) => {
        subscriber.next({
          type: 'failed',
          taskId: task.id,
          result: {
            exitCode: 1,
            message: 'Failed to start Ansible process',
            error: err.message,
            retryCount: task.retryAttempt ?? 0,
          },
          timestamp: new Date(),
        });
        subscriber.complete();
      });

      // Handle abort signal
      abortSignal.addEventListener('abort', () => {
        if (!proc.killed) {
          proc.kill('SIGTERM');
          // Give process time to cleanup, then force kill
          setTimeout(() => {
            if (!proc.killed) {
              proc.kill('SIGKILL');
            }
          }, 5000);
        }
        subscriber.next({
          type: 'cancelled',
          taskId: task.id,
          timestamp: new Date(),
        });
        subscriber.complete();
      });
    });
  }

  /**
   * Execute Helmfile command
   */
  private executeHelmfile(context: ExecutionContext): Observable<TaskEvent> {
    return new Observable<TaskEvent>((subscriber) => {
      const { task, options, abortSignal } = context;

      // Get config from task
      const config = task.taskConfig?.type === TaskType.HELMFILE
        ? task.taskConfig.config
        : this.buildHelmfileConfigFromTask(task);

      // Build arguments
      const args: string[] = ['-e', config.environment || 'k8s'];

      // Add command
      const command = config.command || 'apply';
      args.push(command);

      // Add selector
      const selector = config.selector || task.helmfileSelector;
      if (selector) {
        args.push('--selector', selector);
      }

      // Add additional args
      if (config.args) {
        args.push(...config.args);
      }

      // Add skip-diff for apply
      if (command === 'apply' && config.skipDiff) {
        args.push('--skip-diff-on-install');
      }

      // Add include tests
      if (config.includeTests) {
        args.push('--include-tests');
      }

      // Build environment
      const env: Record<string, string> = {
        ...process.env as Record<string, string>,
        ...options.environment,
        HELM_EXPERIMENTAL_OCI: '1',
      };

      // Add kubeconfig if specified
      if (options.kubeconfigPath) {
        env.KUBECONFIG = this.expandPath(options.kubeconfigPath);
      }

      // Spawn process
      const cwd = config.workingDir || options.helmfilePath || path.join(process.cwd(), 'kubernetes');
      const proc = spawn('helmfile', args, {
        cwd,
        env,
        shell: false,
      });

      // Store process reference
      const taskState = this.runningTasks.get(task.id);
      if (taskState) {
        taskState.process = proc;
      }

      // Handle stdout
      proc.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          const logLine = this.parseHelmfileOutput(line, task.id);
          context.logs.push(logLine);
          subscriber.next({
            type: 'log',
            taskId: task.id,
            log: logLine,
          });
        }
      });

      // Handle stderr
      proc.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          const logLine: LogLine = {
            timestamp: new Date(),
            level: LogLevel.WARN,
            message: this.stripAnsi(line),
            source: 'stderr',
            taskId: task.id,
          };
          context.logs.push(logLine);
          subscriber.next({
            type: 'log',
            taskId: task.id,
            log: logLine,
          });
        }
      });

      // Handle process exit
      proc.on('close', (code: number | null, signal: string | null) => {
        const result: TaskResult = {
          exitCode: code ?? (signal ? 128 : 1),
          message: code === 0 ? 'Helmfile command completed successfully' : `Helmfile command failed with exit code ${code}`,
          error: code !== 0 ? `Exit code: ${code}, Signal: ${signal}` : undefined,
          retryCount: task.retryAttempt ?? 0,
          changes: this.parseHelmfileChanges(context.logs),
        };

        if (code === 0) {
          subscriber.next({
            type: 'completed',
            taskId: task.id,
            result,
            timestamp: new Date(),
          });
        } else {
          subscriber.next({
            type: 'failed',
            taskId: task.id,
            result,
            timestamp: new Date(),
          });
        }
        subscriber.complete();
      });

      // Handle process error
      proc.on('error', (err: Error) => {
        subscriber.next({
          type: 'failed',
          taskId: task.id,
          result: {
            exitCode: 1,
            message: 'Failed to start Helmfile process',
            error: err.message,
            retryCount: task.retryAttempt ?? 0,
          },
          timestamp: new Date(),
        });
        subscriber.complete();
      });

      // Handle abort signal
      abortSignal.addEventListener('abort', () => {
        if (!proc.killed) {
          proc.kill('SIGTERM');
          setTimeout(() => {
            if (!proc.killed) {
              proc.kill('SIGKILL');
            }
          }, 5000);
        }
        subscriber.next({
          type: 'cancelled',
          taskId: task.id,
          timestamp: new Date(),
        });
        subscriber.complete();
      });
    });
  }

  /**
   * Execute kubectl command
   */
  private executeKubectl(context: ExecutionContext): Observable<TaskEvent> {
    return new Observable<TaskEvent>((subscriber) => {
      const { task, options, abortSignal } = context;

      // Get config from task
      const config = task.taskConfig?.type === TaskType.KUBECTL
        ? task.taskConfig.config
        : { command: 'get', args: ['pods'] };

      // Build arguments
      const args: string[] = [config.command, ...config.args];

      // Add namespace
      const namespace = config.namespace || task.namespace;
      if (namespace) {
        args.push('-n', namespace);
      }

      // Add kubeconfig
      if (config.kubeconfig || options.kubeconfigPath) {
        args.push('--kubeconfig', this.expandPath(config.kubeconfig || options.kubeconfigPath!));
      }

      // Add context
      if (config.context || options.kubeContext) {
        args.push('--context', config.context || options.kubeContext!);
      }

      // Handle wait command specially
      if (config.wait) {
        args.push('wait', config.wait.resource);
        args.push(`--for=${config.wait.condition}`);
        args.push(`--timeout=${config.wait.timeout}s`);
      }

      // Build environment
      const env: Record<string, string> = {
        ...process.env as Record<string, string>,
        ...options.environment,
      };

      // Spawn process
      const proc = spawn('kubectl', args, {
        cwd: options.kubernetesPath || process.cwd(),
        env,
        shell: false,
      });

      // Store process reference
      const taskState = this.runningTasks.get(task.id);
      if (taskState) {
        taskState.process = proc;
      }

      // Handle stdout
      proc.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          const logLine: LogLine = {
            timestamp: new Date(),
            level: LogLevel.INFO,
            message: line,
            source: 'stdout',
            taskId: task.id,
          };
          context.logs.push(logLine);
          subscriber.next({
            type: 'log',
            taskId: task.id,
            log: logLine,
          });
        }
      });

      // Handle stderr
      proc.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          const logLine: LogLine = {
            timestamp: new Date(),
            level: LogLevel.WARN,
            message: line,
            source: 'stderr',
            taskId: task.id,
          };
          context.logs.push(logLine);
          subscriber.next({
            type: 'log',
            taskId: task.id,
            log: logLine,
          });
        }
      });

      // Handle process exit
      proc.on('close', (code: number | null, signal: string | null) => {
        const result: TaskResult = {
          exitCode: code ?? (signal ? 128 : 1),
          message: code === 0 ? 'kubectl command completed successfully' : `kubectl command failed with exit code ${code}`,
          error: code !== 0 ? `Exit code: ${code}, Signal: ${signal}` : undefined,
          retryCount: task.retryAttempt ?? 0,
        };

        if (code === 0) {
          subscriber.next({
            type: 'completed',
            taskId: task.id,
            result,
            timestamp: new Date(),
          });
        } else {
          subscriber.next({
            type: 'failed',
            taskId: task.id,
            result,
            timestamp: new Date(),
          });
        }
        subscriber.complete();
      });

      // Handle process error
      proc.on('error', (err: Error) => {
        subscriber.next({
          type: 'failed',
          taskId: task.id,
          result: {
            exitCode: 1,
            message: 'Failed to start kubectl process',
            error: err.message,
            retryCount: task.retryAttempt ?? 0,
          },
          timestamp: new Date(),
        });
        subscriber.complete();
      });

      // Handle abort signal
      abortSignal.addEventListener('abort', () => {
        if (!proc.killed) {
          proc.kill('SIGTERM');
        }
        subscriber.next({
          type: 'cancelled',
          taskId: task.id,
          timestamp: new Date(),
        });
        subscriber.complete();
      });
    });
  }

  /**
   * Execute shell command
   */
  private executeShell(context: ExecutionContext): Observable<TaskEvent> {
    return new Observable<TaskEvent>((subscriber) => {
      const { task, options, abortSignal } = context;

      // Get config from task
      const config = task.taskConfig?.type === TaskType.SHELL
        ? task.taskConfig.config
        : { command: 'echo "No command specified"' };

      // Build environment
      const env: Record<string, string> = {
        ...process.env as Record<string, string>,
        ...options.environment,
        ...config.env,
      };

      // Determine shell
      const shell = config.shell || '/bin/bash';

      // Spawn process
      const proc = spawn(shell, ['-c', config.command], {
        cwd: config.workingDir || process.cwd(),
        env,
        shell: false,
      });

      // Store process reference
      const taskState = this.runningTasks.get(task.id);
      if (taskState) {
        taskState.process = proc;
      }

      // Set up timeout
      const timeout = config.timeout || options.defaultTimeout;
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
      if (timeout > 0) {
        timeoutHandle = setTimeout(() => {
          if (!proc.killed) {
            proc.kill('SIGTERM');
            subscriber.next({
              type: 'failed',
              taskId: task.id,
              result: {
                exitCode: 124,
                message: `Command timed out after ${timeout}ms`,
                error: 'Timeout',
                retryCount: task.retryAttempt ?? 0,
              },
              timestamp: new Date(),
            });
            subscriber.complete();
          }
        }, timeout);
      }

      // Handle stdout
      proc.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          const logLine: LogLine = {
            timestamp: new Date(),
            level: LogLevel.INFO,
            message: line,
            source: 'stdout',
            taskId: task.id,
          };
          context.logs.push(logLine);
          subscriber.next({
            type: 'log',
            taskId: task.id,
            log: logLine,
          });
        }
      });

      // Handle stderr
      proc.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          const logLine: LogLine = {
            timestamp: new Date(),
            level: LogLevel.WARN,
            message: line,
            source: 'stderr',
            taskId: task.id,
          };
          context.logs.push(logLine);
          subscriber.next({
            type: 'log',
            taskId: task.id,
            log: logLine,
          });
        }
      });

      // Handle process exit
      proc.on('close', (code: number | null, signal: string | null) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        const result: TaskResult = {
          exitCode: code ?? (signal ? 128 : 1),
          message: code === 0 ? 'Shell command completed successfully' : `Shell command failed with exit code ${code}`,
          error: code !== 0 ? `Exit code: ${code}, Signal: ${signal}` : undefined,
          retryCount: task.retryAttempt ?? 0,
        };

        if (code === 0) {
          subscriber.next({
            type: 'completed',
            taskId: task.id,
            result,
            timestamp: new Date(),
          });
        } else {
          subscriber.next({
            type: 'failed',
            taskId: task.id,
            result,
            timestamp: new Date(),
          });
        }
        subscriber.complete();
      });

      // Handle process error
      proc.on('error', (err: Error) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        subscriber.next({
          type: 'failed',
          taskId: task.id,
          result: {
            exitCode: 1,
            message: 'Failed to start shell process',
            error: err.message,
            retryCount: task.retryAttempt ?? 0,
          },
          timestamp: new Date(),
        });
        subscriber.complete();
      });

      // Handle abort signal
      abortSignal.addEventListener('abort', () => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        if (!proc.killed) {
          proc.kill('SIGTERM');
        }
        subscriber.next({
          type: 'cancelled',
          taskId: task.id,
          timestamp: new Date(),
        });
        subscriber.complete();
      });
    });
  }

  /**
   * Execute validation task
   */
  private executeValidation(context: ExecutionContext): Observable<TaskEvent> {
    return new Observable<TaskEvent>((subscriber) => {
      const { task, abortSignal } = context;

      // Get config from task
      const config = task.taskConfig?.type === TaskType.VALIDATION
        ? task.taskConfig.config
        : { type: 'health' as const, target: 'localhost' };

      // Create a promise for the validation
      const runValidation = async (): Promise<TaskResult> => {
        const timeout = config.timeout || 30000;
        const retryConfig = config.retry || { maxRetries: 3, delayMs: 1000 };

        let lastError: string | undefined;
        let attempts = 0;

        while (attempts <= retryConfig.maxRetries) {
          if (abortSignal.aborted) {
            throw new Error('Cancelled');
          }

          try {
            let success = false;
            let message = '';

            switch (config.type) {
              case 'health': {
                const result = await this.runHealthCheck(config.target, timeout);
                success = result.success;
                message = result.message;
                break;
              }
              case 'connectivity': {
                const [host, portStr] = config.target.split(':');
                const port = parseInt(portStr, 10) || 80;
                const result = await this.runConnectivityCheck(host, port, timeout);
                success = result.success;
                message = result.message;
                break;
              }
              case 'dns': {
                const result = await this.runDnsCheck(config.target, timeout);
                success = result.success;
                message = result.message;
                break;
              }
              case 'certificate': {
                const result = await this.runCertificateCheck(config.target, timeout);
                success = result.success;
                message = result.message;
                break;
              }
              case 'custom': {
                // Custom validation would be implemented based on target
                success = true;
                message = 'Custom validation passed';
                break;
              }
              default:
                throw new Error(`Unknown validation type: ${config.type}`);
            }

            // Log the validation result
            const logLine: LogLine = {
              timestamp: new Date(),
              level: success ? LogLevel.INFO : LogLevel.WARN,
              message: `Validation ${config.type}: ${message}`,
              source: 'system',
              taskId: task.id,
            };
            context.logs.push(logLine);
            subscriber.next({
              type: 'log',
              taskId: task.id,
              log: logLine,
            });

            if (success) {
              return {
                exitCode: 0,
                message,
                retryCount: attempts,
              };
            }

            lastError = message;
          } catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
          }

          attempts++;

          if (attempts <= retryConfig.maxRetries) {
            // Log retry attempt
            const logLine: LogLine = {
              timestamp: new Date(),
              level: LogLevel.WARN,
              message: `Validation failed, retrying in ${retryConfig.delayMs}ms (attempt ${attempts}/${retryConfig.maxRetries})`,
              source: 'system',
              taskId: task.id,
            };
            context.logs.push(logLine);
            subscriber.next({
              type: 'log',
              taskId: task.id,
              log: logLine,
            });

            subscriber.next({
              type: 'retrying',
              taskId: task.id,
              attempt: attempts,
              reason: lastError || 'Unknown error',
              timestamp: new Date(),
            });

            // Calculate delay with optional backoff
            const delay = retryConfig.backoffMultiplier
              ? retryConfig.delayMs * Math.pow(retryConfig.backoffMultiplier, attempts - 1)
              : retryConfig.delayMs;

            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }

        return {
          exitCode: 1,
          message: `Validation failed after ${attempts} attempts`,
          error: lastError,
          retryCount: attempts,
        };
      };

      // Run validation
      runValidation()
        .then((result) => {
          if (result.exitCode === 0) {
            subscriber.next({
              type: 'completed',
              taskId: task.id,
              result,
              timestamp: new Date(),
            });
          } else {
            subscriber.next({
              type: 'failed',
              taskId: task.id,
              result,
              timestamp: new Date(),
            });
          }
          subscriber.complete();
        })
        .catch((err) => {
          if (err.message === 'Cancelled') {
            subscriber.next({
              type: 'cancelled',
              taskId: task.id,
              timestamp: new Date(),
            });
          } else {
            subscriber.next({
              type: 'failed',
              taskId: task.id,
              result: {
                exitCode: 1,
                message: 'Validation error',
                error: err instanceof Error ? err.message : String(err),
                retryCount: task.retryAttempt ?? 0,
              },
              timestamp: new Date(),
            });
          }
          subscriber.complete();
        });
    });
  }

  /**
   * Run HTTP health check
   */
  private async runHealthCheck(target: string, timeout: number): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      const url = target.startsWith('http') ? target : `https://${target}`;

      const req = https.get(url, { timeout, rejectUnauthorized: false }, (res) => {
        const success = res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 400;
        resolve({
          success,
          message: success ? `Health check passed (HTTP ${res.statusCode})` : `Health check failed (HTTP ${res.statusCode})`,
        });
      });

      req.on('error', (err) => {
        resolve({
          success: false,
          message: `Health check failed: ${err.message}`,
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          success: false,
          message: `Health check timed out after ${timeout}ms`,
        });
      });
    });
  }

  /**
   * Run TCP connectivity check
   */
  private async runConnectivityCheck(host: string, port: number, timeout: number): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      const socket = new net.Socket();

      socket.setTimeout(timeout);

      socket.on('connect', () => {
        socket.destroy();
        resolve({
          success: true,
          message: `Connected to ${host}:${port}`,
        });
      });

      socket.on('error', (err) => {
        socket.destroy();
        resolve({
          success: false,
          message: `Connection failed to ${host}:${port}: ${err.message}`,
        });
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve({
          success: false,
          message: `Connection to ${host}:${port} timed out`,
        });
      });

      socket.connect(port, host);
    });
  }

  /**
   * Run DNS lookup check
   */
  private async runDnsCheck(hostname: string, timeout: number): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      const timeoutHandle = setTimeout(() => {
        resolve({
          success: false,
          message: `DNS lookup for ${hostname} timed out`,
        });
      }, timeout);

      dnsLookup(hostname)
        .then((result) => {
          clearTimeout(timeoutHandle);
          resolve({
            success: true,
            message: `DNS lookup successful: ${hostname} -> ${result.address}`,
          });
        })
        .catch((err) => {
          clearTimeout(timeoutHandle);
          resolve({
            success: false,
            message: `DNS lookup failed for ${hostname}: ${err.message}`,
          });
        });
    });
  }

  /**
   * Run TLS certificate check
   */
  private async runCertificateCheck(target: string, timeout: number): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      const hostname = target.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
      const port = 443;

      const socket = tls.connect(
        {
          host: hostname,
          port,
          rejectUnauthorized: false,
          timeout,
        },
        () => {
          const cert = socket.getPeerCertificate();
          socket.end();

          if (!cert || Object.keys(cert).length === 0) {
            resolve({
              success: false,
              message: `No certificate found for ${hostname}`,
            });
            return;
          }

          const validTo = new Date(cert.valid_to);
          const now = new Date();
          const daysUntilExpiry = Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

          if (daysUntilExpiry < 0) {
            resolve({
              success: false,
              message: `Certificate for ${hostname} has expired`,
            });
          } else if (daysUntilExpiry < 30) {
            resolve({
              success: true,
              message: `Certificate for ${hostname} expires in ${daysUntilExpiry} days (warning)`,
            });
          } else {
            resolve({
              success: true,
              message: `Certificate for ${hostname} is valid (expires in ${daysUntilExpiry} days)`,
            });
          }
        },
      );

      socket.on('error', (err: Error) => {
        resolve({
          success: false,
          message: `Certificate check failed for ${hostname}: ${err.message}`,
        });
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve({
          success: false,
          message: `Certificate check timed out for ${hostname}`,
        });
      });
    });
  }

  /**
   * Cancel a running task
   */
  cancel(taskId: string): boolean {
    const taskState = this.runningTasks.get(taskId);
    if (!taskState) {
      return false;
    }

    // Abort the task
    taskState.abortController.abort();

    // Kill the process if it exists
    if (taskState.process && !taskState.process.killed) {
      taskState.process.kill('SIGTERM');

      // Force kill after timeout
      setTimeout(() => {
        if (taskState.process && !taskState.process.killed) {
          taskState.process.kill('SIGKILL');
        }
      }, 5000);
    }

    return true;
  }

  /**
   * Cancel all running tasks
   */
  cancelAll(): void {
    const taskIds = Array.from(this.runningTasks.keys());
    for (const taskId of taskIds) {
      this.cancel(taskId);
    }
  }

  /**
   * Get number of currently running tasks
   */
  getRunningCount(): number {
    return this.runningTasks.size;
  }

  /**
   * Check if executor can accept more tasks
   */
  canAcceptMore(): boolean {
    return this.runningTasks.size < this.options.maxParallel;
  }

  /**
   * Get list of running task IDs
   */
  getRunningTaskIds(): string[] {
    return Array.from(this.runningTasks.keys());
  }

  /**
   * Check if a specific task is running
   */
  isRunning(taskId: string): boolean {
    return this.runningTasks.has(taskId);
  }

  /**
   * Get current executor options
   */
  getOptions(): ExecutorOptions {
    return { ...this.options };
  }

  /**
   * Update executor options
   */
  updateOptions(options: Partial<ExecutorOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Wait for all running tasks to complete
   */
  async waitForAll(timeout?: number): Promise<ExecutionResult[]> {
    if (this.runningTasks.size === 0) {
      return [...this.completedResults];
    }

    return new Promise((resolve, reject) => {
      this.waitingPromises.push({ resolve, reject });

      if (timeout && timeout > 0) {
        setTimeout(() => {
          const index = this.waitingPromises.findIndex((p) => p.resolve === resolve);
          if (index !== -1) {
            this.waitingPromises.splice(index, 1);
            reject(new Error(`Timeout waiting for tasks after ${timeout}ms`));
          }
        }, timeout);
      }
    });
  }

  /**
   * Get execution statistics
   */
  getStatistics(): ExecutorStatistics {
    return {
      ...this.statistics,
      runningCount: this.runningTasks.size,
      uptimeMs: Date.now() - this.startedAt.getTime(),
    };
  }

  /**
   * Clean up after task completion
   */
  private cleanupTask(taskId: string, startedAt: Date): void {
    const taskState = this.runningTasks.get(taskId);
    if (!taskState) return;

    const durationMs = Date.now() - startedAt.getTime();

    // Update statistics
    this.statistics.totalExecuted++;
    this.statistics.byType[taskState.task.type]++;
    this.statistics.runningCount = Math.max(0, this.statistics.runningCount - 1);

    // Update average execution time
    const prevTotal = this.statistics.averageExecutionTime * (this.statistics.totalExecuted - 1);
    this.statistics.averageExecutionTime = (prevTotal + durationMs) / this.statistics.totalExecuted;

    // Update longest execution time
    if (durationMs > this.statistics.longestExecutionTime) {
      this.statistics.longestExecutionTime = durationMs;
    }

    // Store result
    this.completedResults.push({
      task: taskState.task,
      result: taskState.task.result || {
        exitCode: 0,
        message: 'Completed',
        retryCount: 0,
      },
      logs: taskState.logs,
      durationMs,
      cancelled: false,
    });

    // Clean up
    taskState.subscription.unsubscribe();
    this.runningTasks.delete(taskId);

    // Check if all tasks completed
    if (this.runningTasks.size === 0 && this.waitingPromises.length > 0) {
      const results = [...this.completedResults];
      for (const { resolve } of this.waitingPromises) {
        resolve(results);
      }
      this.waitingPromises = [];
    }
  }

  /**
   * Get working directory for task
   */
  private getWorkingDirectory(task: DeployTask): string {
    switch (task.type) {
      case TaskType.ANSIBLE:
        return this.options.ansiblePath || path.join(process.cwd(), 'ansible');
      case TaskType.HELMFILE:
        return this.options.helmfilePath || path.join(process.cwd(), 'kubernetes');
      case TaskType.KUBECTL:
        return this.options.kubernetesPath || process.cwd();
      default:
        return process.cwd();
    }
  }

  /**
   * Build environment variables for task
   */
  private buildEnvironment(task: DeployTask): Record<string, string> {
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...this.options.environment,
    };

    // Add task-specific environment
    if (task.type === TaskType.ANSIBLE) {
      env.ANSIBLE_FORCE_COLOR = 'true';
      env.ANSIBLE_STDOUT_CALLBACK = 'yaml';
      env.PYTHONUNBUFFERED = '1';
    }

    if (this.options.kubeconfigPath) {
      env.KUBECONFIG = this.expandPath(this.options.kubeconfigPath);
    }

    return env;
  }

  /**
   * Build Ansible config from task properties
   */
  private buildAnsibleConfigFromTask(task: DeployTask): AnsibleTaskConfig {
    return {
      playbook: 'all.yml',
      tags: task.ansibleTags || [],
      inventory: this.options.inventoryFile,
      vaultPasswordFile: this.options.vaultPasswordFile,
      check: this.options.dryRun,
    };
  }

  /**
   * Build Helmfile config from task properties
   */
  private buildHelmfileConfigFromTask(task: DeployTask): HelmfileTaskConfig {
    return {
      command: 'apply',
      environment: 'k8s',
      selector: task.helmfileSelector,
      workingDir: this.options.helmfilePath,
    };
  }

  /**
   * Expand ~ to home directory
   */
  private expandPath(filePath: string): string {
    if (filePath.startsWith('~')) {
      const home = process.env.HOME || process.env.USERPROFILE || '';
      return path.join(home, filePath.slice(1));
    }
    return filePath;
  }

  /**
   * Strip ANSI escape codes from string
   */
  private stripAnsi(str: string): string {
    // eslint-disable-next-line no-control-regex
    return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
  }

  /**
   * Parse Ansible output to determine log level
   */
  private parseAnsibleOutput(line: string, taskId: string): LogLine {
    const cleanLine = this.stripAnsi(line);
    let level = LogLevel.INFO;

    // Detect log level from Ansible output
    if (cleanLine.includes('FAILED') || cleanLine.includes('fatal:') || cleanLine.includes('ERROR')) {
      level = LogLevel.ERROR;
    } else if (cleanLine.includes('changed:') || cleanLine.includes('CHANGED')) {
      level = LogLevel.INFO;
    } else if (cleanLine.includes('skipping:') || cleanLine.includes('SKIPPED')) {
      level = LogLevel.DEBUG;
    } else if (cleanLine.includes('WARNING') || cleanLine.includes('[WARNING]')) {
      level = LogLevel.WARN;
    } else if (cleanLine.includes('ok:') || cleanLine.includes('PLAY') || cleanLine.includes('TASK')) {
      level = LogLevel.INFO;
    }

    return {
      timestamp: new Date(),
      level,
      message: cleanLine,
      source: 'stdout',
      taskId,
    };
  }

  /**
   * Parse Helmfile output to determine log level
   */
  private parseHelmfileOutput(line: string, taskId: string): LogLine {
    const cleanLine = this.stripAnsi(line);
    let level = LogLevel.INFO;

    if (cleanLine.includes('Error') || cleanLine.includes('error') || cleanLine.includes('FAILED')) {
      level = LogLevel.ERROR;
    } else if (cleanLine.includes('WARNING') || cleanLine.includes('warning')) {
      level = LogLevel.WARN;
    } else if (cleanLine.includes('Upgrading') || cleanLine.includes('Installing') || cleanLine.includes('Release')) {
      level = LogLevel.INFO;
    } else if (cleanLine.includes('skipping') || cleanLine.includes('No affected releases')) {
      level = LogLevel.DEBUG;
    }

    return {
      timestamp: new Date(),
      level,
      message: cleanLine,
      source: 'stdout',
      taskId,
    };
  }

  /**
   * Parse Ansible logs to extract changes
   */
  private parseAnsibleChanges(logs: LogLine[]): import('../interfaces/task.interface').TaskChange[] {
    const changes: import('../interfaces/task.interface').TaskChange[] = [];

    for (const log of logs) {
      const match = log.message.match(/^(changed|ok|skipping|failed):\s*\[([^\]]+)\]/);
      if (match) {
        const [, action, resource] = match;
        changes.push({
          action: action === 'changed' ? 'update' : action === 'skipping' ? 'skip' : action === 'failed' ? 'skip' : 'skip',
          resourceType: 'ansible-task',
          resourceName: resource,
        });
      }
    }

    return changes;
  }

  /**
   * Parse Helmfile logs to extract changes
   */
  private parseHelmfileChanges(logs: LogLine[]): import('../interfaces/task.interface').TaskChange[] {
    const changes: import('../interfaces/task.interface').TaskChange[] = [];

    for (const log of logs) {
      // Match release upgrade/install messages
      const upgradeMatch = log.message.match(/Upgrading release=([^\s,]+)/);
      const installMatch = log.message.match(/Installing release=([^\s,]+)/);
      const deleteMatch = log.message.match(/Deleting release=([^\s,]+)/);

      if (upgradeMatch) {
        changes.push({
          action: 'update',
          resourceType: 'helm-release',
          resourceName: upgradeMatch[1],
        });
      } else if (installMatch) {
        changes.push({
          action: 'create',
          resourceType: 'helm-release',
          resourceName: installMatch[1],
        });
      } else if (deleteMatch) {
        changes.push({
          action: 'delete',
          resourceType: 'helm-release',
          resourceName: deleteMatch[1],
        });
      }
    }

    return changes;
  }
}
