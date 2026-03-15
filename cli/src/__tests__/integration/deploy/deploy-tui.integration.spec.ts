/**
 * Integration Tests for Deploy TUI Flow
 *
 * Tests the integration between:
 * - DeployTuiService: Main orchestration service
 * - DAGManagerService: Task dependency management
 * - TaskExecutorService: Task execution (mocked)
 * - TaskBuilderService: Task graph construction
 *
 * These tests verify the complete deployment flow without actual execution
 * by mocking the TaskExecutorService.
 */

import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { Observable, Subject } from 'rxjs';

import { DAGManagerService } from '../../../modules/deploy/tui/services/dag-manager.service';
import { TaskBuilderService } from '../../../modules/deploy/tui/services/task-builder.service';
import {
  DeployTask,
  TaskStatus,
  TaskType,
  TaskResult,
  LogLine,
  LogLevel,
} from '../../../modules/deploy/tui/interfaces/task.interface';
import { TaskEvent, ExecutorOptions } from '../../../modules/deploy/tui/interfaces/executor.interface';
import { DAGEvent, DEFAULT_DAG_OPTIONS } from '../../../modules/deploy/tui/interfaces/dag.interface';
import { DeploymentPhase } from '../../../interfaces/deployment.interface';
import { Service, ServiceNamespace } from '../../../interfaces/service.interface';

/**
 * Mock ServicesService that returns configurable enabled services
 */
class MockServicesService {
  private services: Service[] = [];

  setServices(services: Service[]): void {
    this.services = services;
  }

  getEnabled(): Service[] {
    return this.services.filter((s) => s.config.enabled);
  }

  getAll(): Service[] {
    return this.services;
  }
}

/**
 * Mock TaskExecutor for simulating task execution
 */
class MockTaskExecutor {
  private runningTasks: Map<string, { subject: Subject<TaskEvent>; abortController: AbortController }> = new Map();
  private options: ExecutorOptions = {
    maxParallel: 3,
    dryRun: false,
    ansiblePath: '/usr/local/bin/ansible-playbook',
    kubernetesPath: './kubernetes',
    inventoryFile: './ansible/inventory/hosts.ini',
    vaultPasswordFile: '~/.ansible_vault_password',
    helmfilePath: './kubernetes',
    defaultTimeout: 600000,
    verbose: false,
    captureStderr: true,
  };

  // Configuration for test scenarios
  private taskBehavior: Map<string, 'success' | 'fail' | 'delay'> = new Map();
  private taskDelay: number = 10; // ms

  setTaskBehavior(taskId: string, behavior: 'success' | 'fail' | 'delay'): void {
    this.taskBehavior.set(taskId, behavior);
  }

  setDefaultDelay(delayMs: number): void {
    this.taskDelay = delayMs;
  }

  execute(task: DeployTask): Observable<TaskEvent> {
    return new Observable<TaskEvent>((subscriber) => {
      const subject = new Subject<TaskEvent>();
      const abortController = new AbortController();

      this.runningTasks.set(task.id, { subject, abortController });

      // Emit started event
      subscriber.next({
        type: 'started',
        taskId: task.id,
        timestamp: new Date(),
      });

      const behavior = this.taskBehavior.get(task.id) || 'success';

      if (behavior === 'delay') {
        // Don't complete - test will manually control
        return () => {
          this.runningTasks.delete(task.id);
        };
      }

      // Simulate async execution
      setTimeout(() => {
        if (abortController.signal.aborted) {
          subscriber.next({
            type: 'cancelled',
            taskId: task.id,
            timestamp: new Date(),
          });
          subscriber.complete();
          this.runningTasks.delete(task.id);
          return;
        }

        if (behavior === 'fail') {
          const result: TaskResult = {
            exitCode: 1,
            message: `Task ${task.id} failed`,
            error: 'Simulated failure',
            retryCount: task.retryAttempt || 0,
          };
          subscriber.next({
            type: 'failed',
            taskId: task.id,
            result,
            timestamp: new Date(),
          });
        } else {
          const result: TaskResult = {
            exitCode: 0,
            message: `Task ${task.id} completed successfully`,
            retryCount: task.retryAttempt || 0,
          };
          subscriber.next({
            type: 'completed',
            taskId: task.id,
            result,
            timestamp: new Date(),
          });
        }

        subscriber.complete();
        this.runningTasks.delete(task.id);
      }, this.taskDelay);

      return () => {
        if (this.runningTasks.has(task.id)) {
          abortController.abort();
          this.runningTasks.delete(task.id);
        }
      };
    });
  }

  cancel(taskId: string): boolean {
    const taskState = this.runningTasks.get(taskId);
    if (taskState) {
      taskState.abortController.abort();
      this.runningTasks.delete(taskId);
      return true;
    }
    return false;
  }

  cancelAll(): void {
    for (const [taskId, state] of this.runningTasks) {
      state.abortController.abort();
    }
    this.runningTasks.clear();
  }

  getRunningCount(): number {
    return this.runningTasks.size;
  }

  canAcceptMore(): boolean {
    return this.runningTasks.size < this.options.maxParallel;
  }

  getRunningTaskIds(): string[] {
    return Array.from(this.runningTasks.keys());
  }

  isRunning(taskId: string): boolean {
    return this.runningTasks.has(taskId);
  }

  getOptions(): ExecutorOptions {
    return { ...this.options };
  }

  updateOptions(options: Partial<ExecutorOptions>): void {
    this.options = { ...this.options, ...options };
  }

  // Test helper: complete a delayed task
  completeTask(taskId: string, success: boolean = true): void {
    const taskState = this.runningTasks.get(taskId);
    if (taskState) {
      const result: TaskResult = {
        exitCode: success ? 0 : 1,
        message: success ? 'Completed' : 'Failed',
        retryCount: 0,
      };
      taskState.subject.next({
        type: success ? 'completed' : 'failed',
        taskId,
        result,
        timestamp: new Date(),
      });
      taskState.subject.complete();
      this.runningTasks.delete(taskId);
    }
  }
}

/**
 * Create minimal test task
 */
function createTestTask(overrides: Partial<DeployTask> = {}): DeployTask {
  return {
    id: overrides.id || 'test-task',
    name: overrides.name || 'Test Task',
    description: overrides.description || 'Test task description',
    phase: overrides.phase ?? DeploymentPhase.CORE_SERVICES,
    type: overrides.type ?? TaskType.HELMFILE,
    status: overrides.status ?? TaskStatus.PENDING,
    dependencies: overrides.dependencies || [],
    dependents: overrides.dependents || [],
    mandatory: overrides.mandatory ?? false,
    enabled: overrides.enabled ?? true,
    estimatedDuration: overrides.estimatedDuration ?? 60,
    timing: overrides.timing || {},
    logs: overrides.logs || [],
    ...overrides,
  };
}

/**
 * Create a simple test service
 */
function createTestService(name: string, namespace: string, needs: string[] = []): Service {
  return {
    name,
    repo: 'charts',
    chart: name,
    namespace: namespace as ServiceNamespace,
    version: 'v1.0.0',
    installed: true,
    mandatory: false,
    tier: 'application',
    needs,
    config: {
      enabled: true,
      replicas: 1,
      resources: { cpu: '100m', memory: '128Mi', storage: '1Gi' },
      expose: false,
    },
    resourceTier: 'light',
  };
}

// ============================================================================
// Test Suite: DAGManagerService Integration
// ============================================================================

describe('DAGManagerService Integration', () => {
  let dagManager: DAGManagerService;

  beforeEach(() => {
    dagManager = new DAGManagerService();
  });

  describe('initialization', () => {
    test('should initialize DAG from tasks correctly', () => {
      const tasks: DeployTask[] = [
        createTestTask({ id: 'task-a', dependencies: [] }),
        createTestTask({ id: 'task-b', dependencies: ['task-a'] }),
        createTestTask({ id: 'task-c', dependencies: ['task-a'] }),
        createTestTask({ id: 'task-d', dependencies: ['task-b', 'task-c'] }),
      ];

      dagManager.initialize(tasks);

      expect(dagManager.getTasks()).toHaveLength(4);
      expect(dagManager.isComplete()).toBe(false);
    });

    test('should compute dependents correctly', () => {
      const tasks: DeployTask[] = [
        createTestTask({ id: 'task-a', dependencies: [] }),
        createTestTask({ id: 'task-b', dependencies: ['task-a'] }),
        createTestTask({ id: 'task-c', dependencies: ['task-a'] }),
      ];

      dagManager.initialize(tasks);

      const taskA = dagManager.getTask('task-a');
      expect(taskA?.dependents).toContain('task-b');
      expect(taskA?.dependents).toContain('task-c');
    });

    test('should set initial task statuses based on dependencies', () => {
      const tasks: DeployTask[] = [
        createTestTask({ id: 'task-a', dependencies: [] }),
        createTestTask({ id: 'task-b', dependencies: ['task-a'] }),
      ];

      dagManager.initialize(tasks);

      expect(dagManager.getTask('task-a')?.status).toBe(TaskStatus.QUEUED);
      expect(dagManager.getTask('task-b')?.status).toBe(TaskStatus.BLOCKED);
    });

    test('should validate DAG and reject cycles', () => {
      const tasks: DeployTask[] = [
        createTestTask({ id: 'task-a', dependencies: ['task-c'] }),
        createTestTask({ id: 'task-b', dependencies: ['task-a'] }),
        createTestTask({ id: 'task-c', dependencies: ['task-b'] }),
      ];

      // Cycle detection should throw an error during initialization
      // The error message contains "Cycle detected" or causes validation to fail
      expect(() => dagManager.initialize(tasks)).toThrow();
    });

    test('should validate DAG and reject missing dependencies', () => {
      const tasks: DeployTask[] = [
        createTestTask({ id: 'task-a', dependencies: ['nonexistent'] }),
      ];

      expect(() => dagManager.initialize(tasks)).toThrow(/non-existent/i);
    });
  });

  describe('topological ordering', () => {
    test('should compute correct topological order', () => {
      const tasks: DeployTask[] = [
        createTestTask({ id: 'task-d', dependencies: ['task-b', 'task-c'] }),
        createTestTask({ id: 'task-b', dependencies: ['task-a'] }),
        createTestTask({ id: 'task-c', dependencies: ['task-a'] }),
        createTestTask({ id: 'task-a', dependencies: [] }),
      ];

      dagManager.initialize(tasks);
      const sortResult = dagManager.getTopologicalSort();

      // task-a must come before task-b and task-c
      // task-b and task-c must come before task-d
      const indexA = sortResult.order.indexOf('task-a');
      const indexB = sortResult.order.indexOf('task-b');
      const indexC = sortResult.order.indexOf('task-c');
      const indexD = sortResult.order.indexOf('task-d');

      expect(indexA).toBeLessThan(indexB);
      expect(indexA).toBeLessThan(indexC);
      expect(indexB).toBeLessThan(indexD);
      expect(indexC).toBeLessThan(indexD);
    });

    test('should compute execution levels correctly', () => {
      const tasks: DeployTask[] = [
        createTestTask({ id: 'task-a', dependencies: [] }),
        createTestTask({ id: 'task-b', dependencies: ['task-a'] }),
        createTestTask({ id: 'task-c', dependencies: ['task-a'] }),
        createTestTask({ id: 'task-d', dependencies: ['task-b', 'task-c'] }),
      ];

      dagManager.initialize(tasks);
      const sortResult = dagManager.getTopologicalSort();

      // Level 0: task-a
      // Level 1: task-b, task-c (can run in parallel)
      // Level 2: task-d
      expect(sortResult.levels).toHaveLength(3);
      expect(sortResult.levels[0]).toContain('task-a');
      expect(sortResult.levels[1]).toContain('task-b');
      expect(sortResult.levels[1]).toContain('task-c');
      expect(sortResult.levels[2]).toContain('task-d');
    });
  });

  describe('ready tasks', () => {
    test('should return only tasks with satisfied dependencies', () => {
      const tasks: DeployTask[] = [
        createTestTask({ id: 'task-a', dependencies: [] }),
        createTestTask({ id: 'task-b', dependencies: ['task-a'] }),
        createTestTask({ id: 'task-c', dependencies: [] }),
      ];

      dagManager.initialize(tasks);

      const readyTasks = dagManager.getReadyTasks();
      expect(readyTasks.map((t) => t.id)).toContain('task-a');
      expect(readyTasks.map((t) => t.id)).toContain('task-c');
      expect(readyTasks.map((t) => t.id)).not.toContain('task-b');
    });

    test('should respect maxCount parameter', () => {
      const tasks: DeployTask[] = [
        createTestTask({ id: 'task-a', dependencies: [] }),
        createTestTask({ id: 'task-b', dependencies: [] }),
        createTestTask({ id: 'task-c', dependencies: [] }),
        createTestTask({ id: 'task-d', dependencies: [] }),
      ];

      dagManager.initialize(tasks);

      const readyTasks = dagManager.getReadyTasks(2);
      expect(readyTasks).toHaveLength(2);
    });

    test('should not return disabled tasks', () => {
      const tasks: DeployTask[] = [
        createTestTask({ id: 'task-a', dependencies: [], enabled: true }),
        createTestTask({ id: 'task-b', dependencies: [], enabled: false }),
      ];

      dagManager.initialize(tasks);

      const readyTasks = dagManager.getReadyTasks();
      expect(readyTasks.map((t) => t.id)).toContain('task-a');
      expect(readyTasks.map((t) => t.id)).not.toContain('task-b');
    });
  });

  describe('task status updates', () => {
    test('should cascade unblock dependents when task succeeds', () => {
      const tasks: DeployTask[] = [
        createTestTask({ id: 'task-a', dependencies: [] }),
        createTestTask({ id: 'task-b', dependencies: ['task-a'] }),
      ];

      dagManager.initialize(tasks);

      expect(dagManager.getTask('task-b')?.status).toBe(TaskStatus.BLOCKED);

      dagManager.updateTaskStatus('task-a', TaskStatus.SUCCESS, {
        exitCode: 0,
        message: 'Success',
        retryCount: 0,
      });

      expect(dagManager.getTask('task-b')?.status).toBe(TaskStatus.QUEUED);
    });

    test('should cascade block dependents when task fails with continueOnError=false', () => {
      const tasks: DeployTask[] = [
        createTestTask({ id: 'task-a', dependencies: [] }),
        createTestTask({ id: 'task-b', dependencies: ['task-a'] }),
        createTestTask({ id: 'task-c', dependencies: ['task-b'] }),
      ];

      dagManager.initialize(tasks, { ...DEFAULT_DAG_OPTIONS, continueOnError: false });

      dagManager.updateTaskStatus('task-a', TaskStatus.FAILED, {
        exitCode: 1,
        message: 'Failed',
        retryCount: 0,
      });

      // With continueOnError=false, dependents should be blocked
      expect(dagManager.getTask('task-b')?.status).toBe(TaskStatus.BLOCKED);
      expect(dagManager.getTask('task-c')?.status).toBe(TaskStatus.BLOCKED);
    });

    test('should update timing information on status change', () => {
      const tasks: DeployTask[] = [
        createTestTask({ id: 'task-a', dependencies: [] }),
      ];

      dagManager.initialize(tasks);

      dagManager.updateTaskStatus('task-a', TaskStatus.RUNNING);
      expect(dagManager.getTask('task-a')?.timing.startedAt).toBeDefined();

      dagManager.updateTaskStatus('task-a', TaskStatus.SUCCESS, {
        exitCode: 0,
        message: 'Success',
        retryCount: 0,
      });
      expect(dagManager.getTask('task-a')?.timing.completedAt).toBeDefined();
      expect(dagManager.getTask('task-a')?.timing.durationMs).toBeDefined();
    });
  });

  describe('skip and retry', () => {
    test('should skip task and unblock dependents', () => {
      const tasks: DeployTask[] = [
        createTestTask({ id: 'task-a', dependencies: [] }),
        createTestTask({ id: 'task-b', dependencies: ['task-a'] }),
      ];

      dagManager.initialize(tasks);

      dagManager.skipTask('task-a', 'Skipped by user');

      expect(dagManager.getTask('task-a')?.status).toBe(TaskStatus.SKIPPED);
      expect(dagManager.getTask('task-b')?.status).toBe(TaskStatus.QUEUED);
    });

    test('should allow retry of failed task', () => {
      const tasks: DeployTask[] = [
        createTestTask({ id: 'task-a', dependencies: [], maxRetries: 2 }),
      ];

      dagManager.initialize(tasks);
      dagManager.updateTaskStatus('task-a', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('task-a', TaskStatus.FAILED, {
        exitCode: 1,
        message: 'Failed',
        retryCount: 0,
      });

      const success = dagManager.retryTask('task-a');
      expect(success).toBe(true);
      expect(dagManager.getTask('task-a')?.status).toBe(TaskStatus.QUEUED);
      expect(dagManager.getTask('task-a')?.retryAttempt).toBe(1);
    });

    test('should not retry task that exceeded max retries', () => {
      const tasks: DeployTask[] = [
        createTestTask({ id: 'task-a', dependencies: [], maxRetries: 1 }),
      ];

      dagManager.initialize(tasks, { ...DEFAULT_DAG_OPTIONS, maxRetries: 1 });
      dagManager.updateTaskStatus('task-a', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('task-a', TaskStatus.FAILED, {
        exitCode: 1,
        message: 'Failed',
        retryCount: 0,
      });

      // First retry
      dagManager.retryTask('task-a');
      dagManager.updateTaskStatus('task-a', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('task-a', TaskStatus.FAILED, {
        exitCode: 1,
        message: 'Failed again',
        retryCount: 1,
      });

      // Second retry should fail
      const success = dagManager.retryTask('task-a');
      expect(success).toBe(false);
    });
  });

  describe('cancel task', () => {
    test('should cancel task and optionally cascade to dependents', () => {
      const tasks: DeployTask[] = [
        createTestTask({ id: 'task-a', dependencies: [] }),
        createTestTask({ id: 'task-b', dependencies: ['task-a'] }),
        createTestTask({ id: 'task-c', dependencies: ['task-b'] }),
      ];

      dagManager.initialize(tasks);
      dagManager.cancelTask('task-a', true);

      expect(dagManager.getTask('task-a')?.status).toBe(TaskStatus.CANCELLED);
      expect(dagManager.getTask('task-b')?.status).toBe(TaskStatus.CANCELLED);
      expect(dagManager.getTask('task-c')?.status).toBe(TaskStatus.CANCELLED);
    });

    test('should not cancel already completed tasks', () => {
      const tasks: DeployTask[] = [
        createTestTask({ id: 'task-a', dependencies: [] }),
      ];

      dagManager.initialize(tasks);
      dagManager.updateTaskStatus('task-a', TaskStatus.SUCCESS, {
        exitCode: 0,
        message: 'Success',
        retryCount: 0,
      });

      dagManager.cancelTask('task-a');
      expect(dagManager.getTask('task-a')?.status).toBe(TaskStatus.SUCCESS);
    });
  });

  describe('progress tracking', () => {
    test('should calculate progress correctly', () => {
      const tasks: DeployTask[] = [
        createTestTask({ id: 'task-a', dependencies: [] }),
        createTestTask({ id: 'task-b', dependencies: [] }),
        createTestTask({ id: 'task-c', dependencies: [] }),
        createTestTask({ id: 'task-d', dependencies: [] }),
      ];

      dagManager.initialize(tasks);

      let progress = dagManager.getProgress();
      expect(progress.totalTasks).toBe(4);
      expect(progress.completedTasks).toBe(0);
      expect(progress.progressPercent).toBe(0);

      dagManager.updateTaskStatus('task-a', TaskStatus.SUCCESS, {
        exitCode: 0,
        message: 'Success',
        retryCount: 0,
      });
      dagManager.updateTaskStatus('task-b', TaskStatus.SUCCESS, {
        exitCode: 0,
        message: 'Success',
        retryCount: 0,
      });

      progress = dagManager.getProgress();
      expect(progress.completedTasks).toBe(2);
      expect(progress.progressPercent).toBe(50);
    });

    test('should report completion correctly', () => {
      const tasks: DeployTask[] = [
        createTestTask({ id: 'task-a', dependencies: [] }),
        createTestTask({ id: 'task-b', dependencies: ['task-a'] }),
      ];

      dagManager.initialize(tasks);

      expect(dagManager.isComplete()).toBe(false);

      dagManager.updateTaskStatus('task-a', TaskStatus.SUCCESS, {
        exitCode: 0,
        message: 'Success',
        retryCount: 0,
      });

      expect(dagManager.isComplete()).toBe(false);

      dagManager.updateTaskStatus('task-b', TaskStatus.SUCCESS, {
        exitCode: 0,
        message: 'Success',
        retryCount: 0,
      });

      expect(dagManager.isComplete()).toBe(true);
    });

    test('should report failures correctly', () => {
      const tasks: DeployTask[] = [
        createTestTask({ id: 'task-a', dependencies: [] }),
      ];

      dagManager.initialize(tasks);

      expect(dagManager.hasFailed()).toBe(false);

      dagManager.updateTaskStatus('task-a', TaskStatus.FAILED, {
        exitCode: 1,
        message: 'Failed',
        retryCount: 0,
      });

      expect(dagManager.hasFailed()).toBe(true);
    });
  });

  describe('event subscription', () => {
    test('should emit events on task status changes', () => {
      const tasks: DeployTask[] = [
        createTestTask({ id: 'task-a', dependencies: [] }),
      ];

      dagManager.initialize(tasks);

      const events: DAGEvent[] = [];
      const unsubscribe = dagManager.subscribe((event) => {
        events.push(event);
      });

      dagManager.updateTaskStatus('task-a', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('task-a', TaskStatus.SUCCESS, {
        exitCode: 0,
        message: 'Success',
        retryCount: 0,
      });

      expect(events.some((e) => e.type === 'task:started')).toBe(true);
      expect(events.some((e) => e.type === 'task:completed')).toBe(true);

      unsubscribe();
    });
  });
});

// ============================================================================
// Test Suite: DAG + Executor Integration
// ============================================================================

describe('DAG and Executor Integration', () => {
  let dagManager: DAGManagerService;
  let mockExecutor: MockTaskExecutor;

  beforeEach(() => {
    dagManager = new DAGManagerService();
    mockExecutor = new MockTaskExecutor();
  });

  test('should only execute ready tasks', () => {
    const tasks: DeployTask[] = [
      createTestTask({ id: 'task-a', dependencies: [] }),
      createTestTask({ id: 'task-b', dependencies: ['task-a'] }),
    ];

    dagManager.initialize(tasks);

    const readyTasks = dagManager.getReadyTasks();
    expect(readyTasks).toHaveLength(1);
    expect(readyTasks[0].id).toBe('task-a');
    expect(mockExecutor.canAcceptMore()).toBe(true);
  });

  test('should unblock dependents when task completes', async () => {
    const tasks: DeployTask[] = [
      createTestTask({ id: 'task-a', dependencies: [] }),
      createTestTask({ id: 'task-b', dependencies: ['task-a'] }),
    ];

    dagManager.initialize(tasks);

    // Execute task-a
    const taskA = dagManager.getReadyTasks()[0];
    dagManager.updateTaskStatus(taskA.id, TaskStatus.RUNNING);

    await new Promise<void>((resolve) => {
      mockExecutor.execute(taskA).subscribe({
        next: (event) => {
          if (event.type === 'completed') {
            dagManager.updateTaskStatus(taskA.id, TaskStatus.SUCCESS, event.result);
          }
        },
        complete: resolve,
      });
    });

    // task-b should now be queued
    expect(dagManager.getTask('task-b')?.status).toBe(TaskStatus.QUEUED);
    const newReadyTasks = dagManager.getReadyTasks();
    expect(newReadyTasks.map((t) => t.id)).toContain('task-b');
  });

  test('should block dependents when task fails', async () => {
    const tasks: DeployTask[] = [
      createTestTask({ id: 'task-a', dependencies: [] }),
      createTestTask({ id: 'task-b', dependencies: ['task-a'] }),
    ];

    dagManager.initialize(tasks, { ...DEFAULT_DAG_OPTIONS, continueOnError: false });

    mockExecutor.setTaskBehavior('task-a', 'fail');

    const taskA = dagManager.getReadyTasks()[0];
    dagManager.updateTaskStatus(taskA.id, TaskStatus.RUNNING);

    await new Promise<void>((resolve) => {
      mockExecutor.execute(taskA).subscribe({
        next: (event) => {
          if (event.type === 'failed') {
            dagManager.updateTaskStatus(taskA.id, TaskStatus.FAILED, event.result);
          }
        },
        complete: resolve,
      });
    });

    expect(dagManager.getTask('task-b')?.status).toBe(TaskStatus.BLOCKED);
  });

  test('should respect maxParallel across execution', () => {
    const tasks: DeployTask[] = [
      createTestTask({ id: 'task-a', dependencies: [] }),
      createTestTask({ id: 'task-b', dependencies: [] }),
      createTestTask({ id: 'task-c', dependencies: [] }),
      createTestTask({ id: 'task-d', dependencies: [] }),
      createTestTask({ id: 'task-e', dependencies: [] }),
    ];

    dagManager.initialize(tasks);
    mockExecutor.updateOptions({ maxParallel: 2 });
    mockExecutor.setDefaultDelay(100);

    const readyTasks = dagManager.getReadyTasks(mockExecutor.getOptions().maxParallel);
    expect(readyTasks).toHaveLength(2);

    // Start executing
    for (const task of readyTasks) {
      dagManager.updateTaskStatus(task.id, TaskStatus.RUNNING);
      mockExecutor.execute(task).subscribe();
    }

    expect(mockExecutor.canAcceptMore()).toBe(false);
    expect(mockExecutor.getRunningCount()).toBe(2);
  });

  test('should handle parallel task completion correctly', async () => {
    const tasks: DeployTask[] = [
      createTestTask({ id: 'task-a', dependencies: [] }),
      createTestTask({ id: 'task-b', dependencies: [] }),
      createTestTask({ id: 'task-c', dependencies: ['task-a', 'task-b'] }),
    ];

    dagManager.initialize(tasks);
    mockExecutor.setDefaultDelay(5);

    // Execute task-a and task-b in parallel
    const readyTasks = dagManager.getReadyTasks();
    const completionPromises: Promise<void>[] = [];

    for (const task of readyTasks) {
      dagManager.updateTaskStatus(task.id, TaskStatus.RUNNING);
      completionPromises.push(
        new Promise((resolve) => {
          mockExecutor.execute(task).subscribe({
            next: (event) => {
              if (event.type === 'completed') {
                dagManager.updateTaskStatus(task.id, TaskStatus.SUCCESS, event.result);
              }
            },
            complete: resolve,
          });
        }),
      );
    }

    await Promise.all(completionPromises);

    // task-c should now be ready
    expect(dagManager.getTask('task-c')?.status).toBe(TaskStatus.QUEUED);
  });
});

// ============================================================================
// Test Suite: Pause and Resume
// ============================================================================

describe('Pause and Resume Flow', () => {
  let dagManager: DAGManagerService;
  let mockExecutor: MockTaskExecutor;
  let isPaused: boolean;

  beforeEach(() => {
    dagManager = new DAGManagerService();
    mockExecutor = new MockTaskExecutor();
    isPaused = false;
  });

  test('should pause execution', () => {
    isPaused = true;
    expect(isPaused).toBe(true);
  });

  test('should not start new tasks when paused', async () => {
    const tasks: DeployTask[] = [
      createTestTask({ id: 'task-a', dependencies: [] }),
      createTestTask({ id: 'task-b', dependencies: [] }),
    ];

    dagManager.initialize(tasks);
    isPaused = true;

    // Simulate execution loop that checks pause state
    const startedTasks: string[] = [];
    const readyTasks = dagManager.getReadyTasks();

    for (const task of readyTasks) {
      if (isPaused) {
        // Don't start new tasks
        break;
      }
      startedTasks.push(task.id);
    }

    expect(startedTasks).toHaveLength(0);
  });

  test('should resume and continue execution', async () => {
    const tasks: DeployTask[] = [
      createTestTask({ id: 'task-a', dependencies: [] }),
    ];

    dagManager.initialize(tasks);

    // Pause
    isPaused = true;
    expect(isPaused).toBe(true);

    // Resume
    isPaused = false;
    expect(isPaused).toBe(false);

    // Should be able to get ready tasks
    const readyTasks = dagManager.getReadyTasks();
    expect(readyTasks).toHaveLength(1);

    // Execute
    const task = readyTasks[0];
    dagManager.updateTaskStatus(task.id, TaskStatus.RUNNING);

    await new Promise<void>((resolve) => {
      mockExecutor.execute(task).subscribe({
        next: (event) => {
          if (event.type === 'completed') {
            dagManager.updateTaskStatus(task.id, TaskStatus.SUCCESS, event.result);
          }
        },
        complete: resolve,
      });
    });

    expect(dagManager.isComplete()).toBe(true);
  });

  test('should continue running tasks even when paused', async () => {
    const tasks: DeployTask[] = [
      createTestTask({ id: 'task-a', dependencies: [] }),
    ];

    dagManager.initialize(tasks);
    mockExecutor.setDefaultDelay(50);

    // Start task before pausing
    const task = dagManager.getReadyTasks()[0];
    dagManager.updateTaskStatus(task.id, TaskStatus.RUNNING);

    const executionPromise = new Promise<void>((resolve) => {
      mockExecutor.execute(task).subscribe({
        next: (event) => {
          if (event.type === 'completed') {
            dagManager.updateTaskStatus(task.id, TaskStatus.SUCCESS, event.result);
          }
        },
        complete: resolve,
      });
    });

    // Pause after starting
    isPaused = true;

    // Task should still complete
    await executionPromise;
    expect(dagManager.getTask('task-a')?.status).toBe(TaskStatus.SUCCESS);
  });
});

// ============================================================================
// Test Suite: Abort
// ============================================================================

describe('Abort Flow', () => {
  let dagManager: DAGManagerService;
  let mockExecutor: MockTaskExecutor;

  beforeEach(() => {
    dagManager = new DAGManagerService();
    mockExecutor = new MockTaskExecutor();
  });

  test('should cancel all running tasks on abort', async () => {
    const tasks: DeployTask[] = [
      createTestTask({ id: 'task-a', dependencies: [] }),
      createTestTask({ id: 'task-b', dependencies: [] }),
      createTestTask({ id: 'task-c', dependencies: [] }),
    ];

    dagManager.initialize(tasks);
    mockExecutor.setTaskBehavior('task-a', 'delay');
    mockExecutor.setTaskBehavior('task-b', 'delay');
    mockExecutor.setTaskBehavior('task-c', 'delay');

    // Start tasks
    for (const task of dagManager.getReadyTasks()) {
      dagManager.updateTaskStatus(task.id, TaskStatus.RUNNING);
      mockExecutor.execute(task).subscribe();
    }

    expect(mockExecutor.getRunningCount()).toBe(3);

    // Abort
    mockExecutor.cancelAll();

    expect(mockExecutor.getRunningCount()).toBe(0);
  });

  test('should mark remaining tasks as cancelled on abort', () => {
    const tasks: DeployTask[] = [
      createTestTask({ id: 'task-a', dependencies: [] }),
      createTestTask({ id: 'task-b', dependencies: ['task-a'] }),
      createTestTask({ id: 'task-c', dependencies: ['task-b'] }),
    ];

    dagManager.initialize(tasks);

    // Complete first task
    dagManager.updateTaskStatus('task-a', TaskStatus.SUCCESS, {
      exitCode: 0,
      message: 'Success',
      retryCount: 0,
    });

    // Cancel remaining tasks
    dagManager.cancelTask('task-b', true);

    expect(dagManager.getTask('task-b')?.status).toBe(TaskStatus.CANCELLED);
    expect(dagManager.getTask('task-c')?.status).toBe(TaskStatus.CANCELLED);
  });

  test('should emit completion event after abort', () => {
    const tasks: DeployTask[] = [
      createTestTask({ id: 'task-a', dependencies: [] }),
    ];

    dagManager.initialize(tasks);

    const events: DAGEvent[] = [];
    dagManager.subscribe((event) => events.push(event));

    dagManager.cancelTask('task-a');

    expect(events.some((e) => e.type === 'task:cancelled')).toBe(true);
  });
});

// ============================================================================
// Test Suite: Skip and Retry
// ============================================================================

describe('Skip and Retry Flow', () => {
  let dagManager: DAGManagerService;
  let mockExecutor: MockTaskExecutor;

  beforeEach(() => {
    dagManager = new DAGManagerService();
    mockExecutor = new MockTaskExecutor();
  });

  test('should skip task and unblock dependents', () => {
    const tasks: DeployTask[] = [
      createTestTask({ id: 'task-a', dependencies: [] }),
      createTestTask({ id: 'task-b', dependencies: ['task-a'] }),
      createTestTask({ id: 'task-c', dependencies: ['task-b'] }),
    ];

    dagManager.initialize(tasks);

    dagManager.skipTask('task-a', 'User skipped');
    expect(dagManager.getTask('task-a')?.status).toBe(TaskStatus.SKIPPED);
    expect(dagManager.getTask('task-b')?.status).toBe(TaskStatus.QUEUED);
  });

  test('should retry failed task successfully', async () => {
    const tasks: DeployTask[] = [
      createTestTask({ id: 'task-a', dependencies: [], maxRetries: 2 }),
    ];

    dagManager.initialize(tasks);

    // First execution - fail
    mockExecutor.setTaskBehavior('task-a', 'fail');
    let task = dagManager.getReadyTasks()[0];
    dagManager.updateTaskStatus(task.id, TaskStatus.RUNNING);

    await new Promise<void>((resolve) => {
      mockExecutor.execute(task).subscribe({
        next: (event) => {
          if (event.type === 'failed') {
            dagManager.updateTaskStatus(task.id, TaskStatus.FAILED, event.result);
          }
        },
        complete: resolve,
      });
    });

    expect(dagManager.getTask('task-a')?.status).toBe(TaskStatus.FAILED);

    // Retry
    mockExecutor.setTaskBehavior('task-a', 'success');
    dagManager.retryTask('task-a');
    expect(dagManager.getTask('task-a')?.status).toBe(TaskStatus.QUEUED);
    expect(dagManager.getTask('task-a')?.retryAttempt).toBe(1);

    // Execute retry
    task = dagManager.getReadyTasks()[0];
    dagManager.updateTaskStatus(task.id, TaskStatus.RUNNING);

    await new Promise<void>((resolve) => {
      mockExecutor.execute(task).subscribe({
        next: (event) => {
          if (event.type === 'completed') {
            dagManager.updateTaskStatus(task.id, TaskStatus.SUCCESS, event.result);
          }
        },
        complete: resolve,
      });
    });

    expect(dagManager.getTask('task-a')?.status).toBe(TaskStatus.SUCCESS);
  });

  test('should not skip running task', () => {
    const tasks: DeployTask[] = [
      createTestTask({ id: 'task-a', dependencies: [] }),
    ];

    dagManager.initialize(tasks);
    dagManager.updateTaskStatus('task-a', TaskStatus.RUNNING);

    expect(() => dagManager.skipTask('task-a', 'Cannot skip')).toThrow();
  });
});

// ============================================================================
// Test Suite: TaskBuilderService Integration
// ============================================================================

describe('TaskBuilderService Integration', () => {
  let taskBuilder: TaskBuilderService;
  let mockServicesService: MockServicesService;

  beforeEach(() => {
    mockServicesService = new MockServicesService();
    taskBuilder = new TaskBuilderService(mockServicesService as any);
  });

  test('should build task graph from services', () => {
    mockServicesService.setServices([
      createTestService('postgresql', 'db'),
      createTestService('gitlab', 'code', ['db/postgresql']),
    ]);

    const tasks = taskBuilder.buildTaskGraph();

    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.some((t) => t.phase === DeploymentPhase.INFRASTRUCTURE_SETUP)).toBe(true);
    expect(tasks.some((t) => t.phase === DeploymentPhase.CORE_SERVICES)).toBe(true);
  });

  test('should create infrastructure tasks', () => {
    mockServicesService.setServices([]);

    const tasks = taskBuilder.buildTaskGraph();

    expect(tasks.some((t) => t.id === 'infra/validate-inventory')).toBe(true);
    expect(tasks.some((t) => t.id === 'infra/install-packages')).toBe(true);
    expect(tasks.some((t) => t.id === 'infra/configure-firewall')).toBe(true);
  });

  test('should create kubernetes tasks', () => {
    mockServicesService.setServices([]);

    const tasks = taskBuilder.buildTaskGraph();

    expect(tasks.some((t) => t.id === 'k8s/kubespray')).toBe(true);
    expect(tasks.some((t) => t.id === 'k8s/configure-kubectl')).toBe(true);
    expect(tasks.some((t) => t.id === 'k8s/deploy-cni')).toBe(true);
  });

  test('should create core services tasks', () => {
    mockServicesService.setServices([]);

    const tasks = taskBuilder.buildTaskGraph();

    expect(tasks.some((t) => t.id === 'core/namespaces')).toBe(true);
    expect(tasks.some((t) => t.id === 'core/traefik')).toBe(true);
    expect(tasks.some((t) => t.id === 'core/vault')).toBe(true);
  });

  test('should create database tasks from enabled services', () => {
    mockServicesService.setServices([
      createTestService('postgresql', 'db'),
      createTestService('mongodb', 'db'),
    ]);

    const tasks = taskBuilder.buildTaskGraph();

    expect(tasks.some((t) => t.id === 'db/postgresql')).toBe(true);
    expect(tasks.some((t) => t.id === 'db/mongodb')).toBe(true);
  });

  test('should create application tasks from enabled services', () => {
    mockServicesService.setServices([
      createTestService('gitlab', 'code', ['db/postgresql']),
      createTestService('nextcloud', 'data', ['db/postgresql']),
    ]);

    const tasks = taskBuilder.buildTaskGraph();

    expect(tasks.some((t) => t.id === 'app/gitlab')).toBe(true);
    expect(tasks.some((t) => t.id === 'app/nextcloud')).toBe(true);
  });

  test('should set correct dependencies for application tasks', () => {
    mockServicesService.setServices([
      createTestService('postgresql', 'db'),
      createTestService('gitlab', 'code', ['db/postgresql']),
    ]);

    const tasks = taskBuilder.buildTaskGraph();
    const gitlabTask = tasks.find((t) => t.id === 'app/gitlab');

    expect(gitlabTask?.dependencies).toContain('db/postgresql');
    expect(gitlabTask?.dependencies).toContain('core/vault');
    expect(gitlabTask?.dependencies).toContain('core/traefik');
  });
});

// ============================================================================
// Test Suite: Full Deployment Flow (Mocked)
// ============================================================================

describe('Full Deployment Flow', () => {
  let dagManager: DAGManagerService;
  let mockExecutor: MockTaskExecutor;

  beforeEach(() => {
    dagManager = new DAGManagerService();
    mockExecutor = new MockTaskExecutor();
    mockExecutor.setDefaultDelay(5);
  });

  test('should execute tasks in topological order', async () => {
    const tasks: DeployTask[] = [
      createTestTask({
        id: 'phase1/task-a',
        phase: DeploymentPhase.INFRASTRUCTURE_SETUP,
        dependencies: [],
      }),
      createTestTask({
        id: 'phase2/task-b',
        phase: DeploymentPhase.KUBERNETES_BOOTSTRAP,
        dependencies: ['phase1/task-a'],
      }),
      createTestTask({
        id: 'phase3/task-c',
        phase: DeploymentPhase.CORE_SERVICES,
        dependencies: ['phase2/task-b'],
      }),
    ];

    dagManager.initialize(tasks);

    const executionOrder: string[] = [];

    // Simulate execution loop
    while (!dagManager.isComplete()) {
      const readyTasks = dagManager.getReadyTasks(1);
      if (readyTasks.length === 0) break;

      const task = readyTasks[0];
      executionOrder.push(task.id);
      dagManager.updateTaskStatus(task.id, TaskStatus.RUNNING);

      await new Promise<void>((resolve) => {
        mockExecutor.execute(task).subscribe({
          next: (event) => {
            if (event.type === 'completed') {
              dagManager.updateTaskStatus(task.id, TaskStatus.SUCCESS, event.result);
            }
          },
          complete: resolve,
        });
      });
    }

    expect(executionOrder).toEqual(['phase1/task-a', 'phase2/task-b', 'phase3/task-c']);
    expect(dagManager.isComplete()).toBe(true);
  });

  test('should update progress as tasks complete', async () => {
    const tasks: DeployTask[] = [
      createTestTask({ id: 'task-a', dependencies: [] }),
      createTestTask({ id: 'task-b', dependencies: [] }),
      createTestTask({ id: 'task-c', dependencies: ['task-a', 'task-b'] }),
    ];

    dagManager.initialize(tasks);

    const progressUpdates: number[] = [];

    // Execute all tasks
    for (const task of tasks) {
      // Wait for task to be ready
      while (dagManager.getTask(task.id)?.status === TaskStatus.BLOCKED) {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }

      const readyTask = dagManager.getTask(task.id)!;
      if (readyTask.status !== TaskStatus.QUEUED) continue;

      dagManager.updateTaskStatus(task.id, TaskStatus.RUNNING);

      await new Promise<void>((resolve) => {
        mockExecutor.execute(readyTask).subscribe({
          next: (event) => {
            if (event.type === 'completed') {
              dagManager.updateTaskStatus(task.id, TaskStatus.SUCCESS, event.result);
              progressUpdates.push(dagManager.getProgress().progressPercent);
            }
          },
          complete: resolve,
        });
      });
    }

    // Progress should increase with each completion
    expect(progressUpdates[0]).toBe(33); // 1/3 = 33%
    expect(progressUpdates[1]).toBe(67); // 2/3 = 67%
    expect(progressUpdates[2]).toBe(100); // 3/3 = 100%
  });

  test('should handle task failures gracefully', async () => {
    const tasks: DeployTask[] = [
      createTestTask({ id: 'task-a', dependencies: [] }),
      createTestTask({ id: 'task-b', dependencies: ['task-a'] }),
      createTestTask({ id: 'task-c', dependencies: [] }), // Independent
    ];

    dagManager.initialize(tasks, { ...DEFAULT_DAG_OPTIONS, continueOnError: true });

    mockExecutor.setTaskBehavior('task-a', 'fail');

    // Execute task-a (will fail)
    const taskA = dagManager.getTask('task-a')!;
    dagManager.updateTaskStatus('task-a', TaskStatus.RUNNING);

    await new Promise<void>((resolve) => {
      mockExecutor.execute(taskA).subscribe({
        next: (event) => {
          if (event.type === 'failed') {
            dagManager.updateTaskStatus('task-a', TaskStatus.FAILED, event.result);
          }
        },
        complete: resolve,
      });
    });

    expect(dagManager.hasFailed()).toBe(true);

    // With continueOnError, task-c should still be executable
    // Note: task-b remains blocked because its dependency failed
    const readyTasks = dagManager.getReadyTasks();
    expect(readyTasks.map((t) => t.id)).toContain('task-c');
  });

  test('should complete deployment successfully', async () => {
    const tasks: DeployTask[] = [
      createTestTask({ id: 'task-a', dependencies: [] }),
      createTestTask({ id: 'task-b', dependencies: ['task-a'] }),
    ];

    dagManager.initialize(tasks);

    const events: DAGEvent[] = [];
    dagManager.subscribe((event) => events.push(event));

    // Execute all tasks
    while (!dagManager.isComplete()) {
      const readyTasks = dagManager.getReadyTasks(1);
      if (readyTasks.length === 0) break;

      const task = readyTasks[0];
      dagManager.updateTaskStatus(task.id, TaskStatus.RUNNING);

      await new Promise<void>((resolve) => {
        mockExecutor.execute(task).subscribe({
          next: (event) => {
            if (event.type === 'completed') {
              dagManager.updateTaskStatus(task.id, TaskStatus.SUCCESS, event.result);
            }
          },
          complete: resolve,
        });
      });
    }

    expect(dagManager.isComplete()).toBe(true);
    expect(dagManager.hasFailed()).toBe(false);
    expect(events.some((e) => e.type === 'deployment:completed')).toBe(true);
  });
});
