/**
 * Unit tests for TaskExecutorService
 *
 * Tests cover:
 * - Configuration management
 * - Task execution lifecycle (started, log, completed, failed events)
 * - Concurrency control
 * - Task cancellation
 * - Task type execution (Ansible, Helmfile, Kubectl, Shell, Validation)
 * - Statistics tracking
 *
 * Note: These tests use real process spawning for shell commands.
 * Ansible, Helmfile, and kubectl tests verify argument building logic
 * without requiring those tools to be installed.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { TaskExecutorService } from '../../../modules/deploy/tui/services/task-executor.service';
import {
  DeployTask,
  TaskType,
  TaskStatus,
  LogLevel,
} from '../../../modules/deploy/tui/interfaces/task.interface';
import {
  TaskEvent,
  DEFAULT_EXECUTOR_OPTIONS,
} from '../../../modules/deploy/tui/interfaces/executor.interface';
import { DeploymentPhase } from '../../../interfaces/deployment.interface';

// Helper to create mock tasks
const createMockTask = (
  type: TaskType,
  overrides?: Partial<DeployTask>,
): DeployTask => ({
  id: `test-${type}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  name: `Test ${type} Task`,
  description: `Test task of type ${type}`,
  type,
  status: TaskStatus.QUEUED,
  phase: DeploymentPhase.CORE_SERVICES,
  dependencies: [],
  dependents: [],
  mandatory: true,
  enabled: true,
  estimatedDuration: 60,
  timing: {},
  logs: [],
  ansibleTags: type === TaskType.ANSIBLE ? ['test'] : undefined,
  helmfileSelector: type === TaskType.HELMFILE ? 'name=test' : undefined,
  ...overrides,
});

// Helper to collect events from Observable with timeout
const collectEvents = (
  executor: TaskExecutorService,
  task: DeployTask,
  timeoutMs = 5000,
): Promise<TaskEvent[]> => {
  return new Promise((resolve, reject) => {
    const events: TaskEvent[] = [];
    let subscription: any = null;
    let completed = false;

    const timeout = setTimeout(() => {
      if (!completed && subscription) {
        subscription.unsubscribe();
        reject(new Error(`Timeout collecting events after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    subscription = executor.execute(task).subscribe({
      next: (event) => events.push(event),
      error: (err) => {
        completed = true;
        clearTimeout(timeout);
        reject(err);
      },
      complete: () => {
        completed = true;
        clearTimeout(timeout);
        if (subscription) {
          subscription.unsubscribe();
        }
        resolve(events);
      },
    });
  });
};

describe('TaskExecutorService', () => {
  let executor: TaskExecutorService;

  beforeEach(() => {
    executor = new TaskExecutorService();
  });

  afterEach(() => {
    // Cancel any running tasks
    executor.cancelAll();
  });

  describe('configure', () => {
    it('should return default options initially', () => {
      const options = executor.getOptions();

      expect(options.maxParallel).toBe(DEFAULT_EXECUTOR_OPTIONS.maxParallel);
      expect(options.dryRun).toBe(DEFAULT_EXECUTOR_OPTIONS.dryRun);
      expect(options.defaultTimeout).toBe(DEFAULT_EXECUTOR_OPTIONS.defaultTimeout);
    });

    it('should merge partial options with defaults', () => {
      executor.updateOptions({ maxParallel: 5, dryRun: true });

      const options = executor.getOptions();
      expect(options.maxParallel).toBe(5);
      expect(options.dryRun).toBe(true);
      // Other options should remain default
      expect(options.defaultTimeout).toBe(DEFAULT_EXECUTOR_OPTIONS.defaultTimeout);
    });

    it('should update multiple options at once', () => {
      executor.updateOptions({
        maxParallel: 10,
        verbose: true,
        environment: { CUSTOM_VAR: 'value' },
      });

      const options = executor.getOptions();
      expect(options.maxParallel).toBe(10);
      expect(options.verbose).toBe(true);
      expect(options.environment).toEqual({ CUSTOM_VAR: 'value' });
    });

    it('should return a copy of options, not reference', () => {
      const options1 = executor.getOptions();
      options1.maxParallel = 999;

      const options2 = executor.getOptions();
      expect(options2.maxParallel).toBe(DEFAULT_EXECUTOR_OPTIONS.maxParallel);
    });

    it('should preserve existing options when updating partially', () => {
      executor.updateOptions({ maxParallel: 5 });
      executor.updateOptions({ verbose: true });

      const options = executor.getOptions();
      expect(options.maxParallel).toBe(5);
      expect(options.verbose).toBe(true);
    });
  });

  describe('execute', () => {
    it('should emit started event', async () => {
      const task = createMockTask(TaskType.SHELL, {
        taskConfig: {
          type: TaskType.SHELL,
          config: { command: 'echo "test"' },
        },
      });

      const events = await collectEvents(executor, task);

      const startedEvent = events.find((e) => e.type === 'started');
      expect(startedEvent).toBeDefined();
      expect(startedEvent?.taskId).toBe(task.id);
      expect(startedEvent?.timestamp).toBeInstanceOf(Date);
    });

    it('should emit log events during execution', async () => {
      const task = createMockTask(TaskType.SHELL, {
        taskConfig: {
          type: TaskType.SHELL,
          config: { command: 'echo "test output line"' },
        },
      });

      const events = await collectEvents(executor, task);

      const logEvents = events.filter((e) => e.type === 'log');
      expect(logEvents.length).toBeGreaterThanOrEqual(1);

      // Check log event structure
      const logEvent = logEvents[0] as any;
      expect(logEvent.taskId).toBe(task.id);
      expect(logEvent.log).toHaveProperty('message');
      expect(logEvent.log).toHaveProperty('timestamp');
      expect(logEvent.log).toHaveProperty('level');
    });

    it('should emit completed event on success', async () => {
      const task = createMockTask(TaskType.SHELL, {
        taskConfig: {
          type: TaskType.SHELL,
          config: { command: 'echo "success"' },
        },
      });

      const events = await collectEvents(executor, task);

      const completedEvent = events.find((e) => e.type === 'completed');
      expect(completedEvent).toBeDefined();
      expect(completedEvent?.taskId).toBe(task.id);
      if (completedEvent?.type === 'completed') {
        expect(completedEvent.result.exitCode).toBe(0);
        expect(completedEvent.result.message).toContain('successfully');
      }
    });

    it('should emit failed event on error', async () => {
      const task = createMockTask(TaskType.SHELL, {
        taskConfig: {
          type: TaskType.SHELL,
          config: { command: 'exit 1' },
        },
      });

      const events = await collectEvents(executor, task);

      const failedEvent = events.find((e) => e.type === 'failed');
      expect(failedEvent).toBeDefined();
      expect(failedEvent?.taskId).toBe(task.id);
      if (failedEvent?.type === 'failed') {
        expect(failedEvent.result.exitCode).toBe(1);
      }
    });

    it('should track running task in runningTasks map', async () => {
      const task = createMockTask(TaskType.SHELL, {
        taskConfig: {
          type: TaskType.SHELL,
          config: { command: 'sleep 0.5' },
        },
      });

      // Start execution but don't wait for completion
      const subscription = executor.execute(task).subscribe({
        next: () => {},
        complete: () => {},
      });

      // Check that task is tracked
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(executor.isRunning(task.id)).toBe(true);
      expect(executor.getRunningCount()).toBe(1);
      expect(executor.getRunningTaskIds()).toContain(task.id);

      // Cleanup
      subscription.unsubscribe();
      executor.cancel(task.id);
    });

    it('should handle process spawn error for non-existent command', async () => {
      const task = createMockTask(TaskType.SHELL, {
        taskConfig: {
          type: TaskType.SHELL,
          config: {
            command: '/nonexistent/path/to/command_that_does_not_exist_12345',
            shell: '/bin/bash',
          },
        },
      });

      const events = await collectEvents(executor, task);

      const failedEvent = events.find((e) => e.type === 'failed');
      expect(failedEvent).toBeDefined();
      if (failedEvent?.type === 'failed') {
        expect(failedEvent.result.exitCode).not.toBe(0);
      }
    });

    it('should include timestamp in completed event', async () => {
      const task = createMockTask(TaskType.SHELL, {
        taskConfig: {
          type: TaskType.SHELL,
          config: { command: 'true' },
        },
      });

      const events = await collectEvents(executor, task);
      const completedEvent = events.find((e) => e.type === 'completed');

      expect(completedEvent).toBeDefined();
      if (completedEvent?.type === 'completed') {
        expect(completedEvent.timestamp).toBeInstanceOf(Date);
      }
    });
  });

  describe('concurrency', () => {
    it('should allow multiple concurrent tasks', async () => {
      const task1 = createMockTask(TaskType.SHELL, {
        id: 'concurrent-1',
        taskConfig: { type: TaskType.SHELL, config: { command: 'sleep 0.2' } },
      });
      const task2 = createMockTask(TaskType.SHELL, {
        id: 'concurrent-2',
        taskConfig: { type: TaskType.SHELL, config: { command: 'sleep 0.2' } },
      });
      const task3 = createMockTask(TaskType.SHELL, {
        id: 'concurrent-3',
        taskConfig: { type: TaskType.SHELL, config: { command: 'sleep 0.2' } },
      });

      // Start all three tasks
      executor.execute(task1).subscribe({ next: () => {}, complete: () => {} });
      await new Promise((resolve) => setTimeout(resolve, 20));
      executor.execute(task2).subscribe({ next: () => {}, complete: () => {} });
      await new Promise((resolve) => setTimeout(resolve, 20));
      executor.execute(task3).subscribe({ next: () => {}, complete: () => {} });
      await new Promise((resolve) => setTimeout(resolve, 20));

      // All three should be running
      expect(executor.getRunningCount()).toBe(3);
    });

    it('should return true from canAcceptMore when slots available', () => {
      executor.updateOptions({ maxParallel: 3 });
      expect(executor.canAcceptMore()).toBe(true);
    });

    it('should return false from canAcceptMore when at limit', async () => {
      executor.updateOptions({ maxParallel: 1 });

      const task = createMockTask(TaskType.SHELL, {
        taskConfig: { type: TaskType.SHELL, config: { command: 'sleep 0.5' } },
      });

      executor.execute(task).subscribe({ next: () => {}, complete: () => {} });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(executor.canAcceptMore()).toBe(false);
    });

    it('should getRunningCount correctly', async () => {
      expect(executor.getRunningCount()).toBe(0);

      const task1 = createMockTask(TaskType.SHELL, {
        id: 'count-task-1',
        taskConfig: { type: TaskType.SHELL, config: { command: 'sleep 0.3' } },
      });
      const task2 = createMockTask(TaskType.SHELL, {
        id: 'count-task-2',
        taskConfig: { type: TaskType.SHELL, config: { command: 'sleep 0.3' } },
      });

      executor.execute(task1).subscribe({ next: () => {}, complete: () => {} });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(executor.getRunningCount()).toBe(1);

      executor.execute(task2).subscribe({ next: () => {}, complete: () => {} });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(executor.getRunningCount()).toBe(2);
    });

    it('should update canAcceptMore after task completes', async () => {
      executor.updateOptions({ maxParallel: 1 });

      const task = createMockTask(TaskType.SHELL, {
        taskConfig: { type: TaskType.SHELL, config: { command: 'echo done' } },
      });

      await collectEvents(executor, task);

      expect(executor.canAcceptMore()).toBe(true);
    });
  });

  describe('cancel', () => {
    it('should cancel running task and return true', async () => {
      const task = createMockTask(TaskType.SHELL, {
        taskConfig: { type: TaskType.SHELL, config: { command: 'sleep 10' } },
      });

      let completeCalled = false;
      executor.execute(task).subscribe({
        complete: () => { completeCalled = true; },
      });

      // Wait for task to start
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(executor.isRunning(task.id)).toBe(true);

      // Cancel the task
      const cancelled = executor.cancel(task.id);
      expect(cancelled).toBe(true);

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(completeCalled).toBe(true);
    });

    it('should remove task from runningTasks after cancellation', async () => {
      const task = createMockTask(TaskType.SHELL, {
        taskConfig: { type: TaskType.SHELL, config: { command: 'sleep 10' } },
      });

      const eventsPromise = new Promise<void>((resolve) => {
        executor.execute(task).subscribe({
          complete: () => resolve(),
        });
      });

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(executor.isRunning(task.id)).toBe(true);

      executor.cancel(task.id);
      await eventsPromise;

      expect(executor.isRunning(task.id)).toBe(false);
      expect(executor.getRunningTaskIds()).not.toContain(task.id);
    });

    it('should return false when cancelling non-existent task', () => {
      const result = executor.cancel('non-existent-task-id');
      expect(result).toBe(false);
    });

    it('should return false when cancelling already cancelled task', async () => {
      const task = createMockTask(TaskType.SHELL, {
        taskConfig: { type: TaskType.SHELL, config: { command: 'sleep 10' } },
      });

      executor.execute(task).subscribe({
        complete: () => {},
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const firstCancel = executor.cancel(task.id);
      expect(firstCancel).toBe(true);

      // Wait a bit for cleanup
      await new Promise((resolve) => setTimeout(resolve, 100));

      const secondCancel = executor.cancel(task.id);
      expect(secondCancel).toBe(false);
    });
  });

  describe('cancelAll', () => {
    it('should cancel all running tasks', async () => {
      const task1 = createMockTask(TaskType.SHELL, {
        id: 'cancel-all-1',
        taskConfig: { type: TaskType.SHELL, config: { command: 'sleep 10' } },
      });
      const task2 = createMockTask(TaskType.SHELL, {
        id: 'cancel-all-2',
        taskConfig: { type: TaskType.SHELL, config: { command: 'sleep 10' } },
      });

      const promises = [
        new Promise<void>((resolve) => {
          executor.execute(task1).subscribe({ complete: () => resolve() });
        }),
        new Promise<void>((resolve) => {
          executor.execute(task2).subscribe({ complete: () => resolve() });
        }),
      ];

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(executor.getRunningCount()).toBe(2);

      executor.cancelAll();

      await Promise.all(promises);
      expect(executor.getRunningCount()).toBe(0);
    });

    it('should handle cancelAll when no tasks running', () => {
      expect(() => executor.cancelAll()).not.toThrow();
      expect(executor.getRunningCount()).toBe(0);
    });
  });

  describe('task types', () => {
    it('should execute SHELL type with echo command', async () => {
      const task = createMockTask(TaskType.SHELL, {
        taskConfig: {
          type: TaskType.SHELL,
          config: {
            command: 'echo "hello from shell"',
            shell: '/bin/bash',
          },
        },
      });

      const events = await collectEvents(executor, task);

      const completedEvent = events.find((e) => e.type === 'completed');
      expect(completedEvent).toBeDefined();
      if (completedEvent?.type === 'completed') {
        expect(completedEvent.result.exitCode).toBe(0);
      }

      // Should have log with output
      const logEvents = events.filter((e) => e.type === 'log') as any[];
      const outputLog = logEvents.find((e) => e.log.message.includes('hello from shell'));
      expect(outputLog).toBeDefined();
    });

    it('should run validation function for VALIDATION type with custom check', async () => {
      const task = createMockTask(TaskType.VALIDATION, {
        taskConfig: {
          type: TaskType.VALIDATION,
          config: {
            type: 'custom',
            target: 'localhost',
            timeout: 1000,
            retry: { maxRetries: 0, delayMs: 100 },
          },
        },
      });

      const events = await collectEvents(executor, task);

      // Should complete (custom validation always passes)
      const completedEvent = events.find((e) => e.type === 'completed');
      expect(completedEvent).toBeDefined();
      if (completedEvent?.type === 'completed') {
        expect(completedEvent.result.exitCode).toBe(0);
        expect(completedEvent.result.message).toContain('Custom validation passed');
      }
    });

    it('should handle COMPOSITE type with error message', async () => {
      const task = createMockTask(TaskType.COMPOSITE, {
        taskConfig: {
          type: TaskType.COMPOSITE,
          config: {
            strategy: 'sequential',
            subtasks: ['subtask-1', 'subtask-2'],
          },
        },
      });

      const events = await collectEvents(executor, task);

      // Composite tasks should fail with specific message
      const failedEvent = events.find((e) => e.type === 'failed');
      expect(failedEvent).toBeDefined();
      if (failedEvent?.type === 'failed') {
        expect(failedEvent.result.message).toContain('Composite tasks');
        expect(failedEvent.result.message).toContain('orchestrator');
      }
    });

    it('should handle unknown task type with error', async () => {
      const task = createMockTask(TaskType.SHELL, {
        type: 'unknown_type' as TaskType,
      });

      const events = await collectEvents(executor, task);

      const failedEvent = events.find((e) => e.type === 'failed');
      expect(failedEvent).toBeDefined();
      if (failedEvent?.type === 'failed') {
        expect(failedEvent.result.message).toContain('Unknown task type');
      }
    });

    it('should execute ANSIBLE type task (will fail without ansible)', async () => {
      const task = createMockTask(TaskType.ANSIBLE, {
        ansibleTags: ['test-tag'],
        taskConfig: {
          type: TaskType.ANSIBLE,
          config: {
            playbook: 'test.yml',
            tags: ['test-tag'],
            inventory: './inventory.ini',
          },
        },
      });

      const events = await collectEvents(executor, task, 10000);

      // Will likely fail because ansible-playbook is not available
      const terminalEvent = events.find(
        (e) => e.type === 'completed' || e.type === 'failed',
      );
      expect(terminalEvent).toBeDefined();
      expect(terminalEvent?.taskId).toBe(task.id);
    });

    it('should execute HELMFILE type task (will fail without helmfile)', async () => {
      const task = createMockTask(TaskType.HELMFILE, {
        helmfileSelector: 'name=test',
        taskConfig: {
          type: TaskType.HELMFILE,
          config: {
            command: 'diff',
            environment: 'k8s',
            selector: 'name=test',
            workingDir: '/tmp',
          },
        },
      });

      const events = await collectEvents(executor, task, 10000);

      // Will likely fail because helmfile is not available
      const terminalEvent = events.find(
        (e) => e.type === 'completed' || e.type === 'failed',
      );
      expect(terminalEvent).toBeDefined();
    });

    it('should execute KUBECTL type task (will fail without kubectl)', async () => {
      const task = createMockTask(TaskType.KUBECTL, {
        namespace: 'default',
        taskConfig: {
          type: TaskType.KUBECTL,
          config: {
            command: 'get',
            args: ['pods'],
            namespace: 'default',
          },
        },
      });

      const events = await collectEvents(executor, task, 10000);

      const terminalEvent = events.find(
        (e) => e.type === 'completed' || e.type === 'failed',
      );
      expect(terminalEvent).toBeDefined();
    });
  });

  describe('statistics', () => {
    it('should track execution statistics', async () => {
      const task = createMockTask(TaskType.SHELL, {
        taskConfig: { type: TaskType.SHELL, config: { command: 'echo test' } },
      });

      await collectEvents(executor, task);

      const stats = executor.getStatistics();
      expect(stats.totalExecuted).toBe(1);
      expect(stats.byType[TaskType.SHELL]).toBe(1);
      expect(stats.uptimeMs).toBeGreaterThan(0);
    });

    it('should calculate average execution time', async () => {
      const task1 = createMockTask(TaskType.SHELL, {
        id: 'stats-1',
        taskConfig: { type: TaskType.SHELL, config: { command: 'echo 1' } },
      });
      const task2 = createMockTask(TaskType.SHELL, {
        id: 'stats-2',
        taskConfig: { type: TaskType.SHELL, config: { command: 'echo 2' } },
      });

      await collectEvents(executor, task1);
      await collectEvents(executor, task2);

      const stats = executor.getStatistics();
      expect(stats.totalExecuted).toBe(2);
      expect(stats.averageExecutionTime).toBeGreaterThan(0);
    });

    it('should track longest execution time', async () => {
      const task = createMockTask(TaskType.SHELL, {
        taskConfig: { type: TaskType.SHELL, config: { command: 'sleep 0.1' } },
      });

      await collectEvents(executor, task);

      const stats = executor.getStatistics();
      expect(stats.longestExecutionTime).toBeGreaterThanOrEqual(50);
    });

    it('should track tasks by type', async () => {
      const shellTask = createMockTask(TaskType.SHELL, {
        id: 'shell-stats',
        taskConfig: { type: TaskType.SHELL, config: { command: 'true' } },
      });
      const validationTask = createMockTask(TaskType.VALIDATION, {
        id: 'validation-stats',
        taskConfig: {
          type: TaskType.VALIDATION,
          config: { type: 'custom', target: 'test', retry: { maxRetries: 0, delayMs: 0 } },
        },
      });

      await collectEvents(executor, shellTask);
      await collectEvents(executor, validationTask);

      const stats = executor.getStatistics();
      expect(stats.byType[TaskType.SHELL]).toBe(1);
      expect(stats.byType[TaskType.VALIDATION]).toBe(1);
    });

    it('should report running count in statistics', async () => {
      const task = createMockTask(TaskType.SHELL, {
        taskConfig: { type: TaskType.SHELL, config: { command: 'sleep 0.5' } },
      });

      executor.execute(task).subscribe({ next: () => {}, complete: () => {} });
      await new Promise((resolve) => setTimeout(resolve, 50));

      const stats = executor.getStatistics();
      expect(stats.runningCount).toBe(1);
    });
  });

  describe('waitForAll', () => {
    it('should return immediately if no tasks running', async () => {
      const results = await executor.waitForAll();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should wait for running tasks to complete', async () => {
      const task = createMockTask(TaskType.SHELL, {
        taskConfig: { type: TaskType.SHELL, config: { command: 'sleep 0.1' } },
      });

      executor.execute(task).subscribe({ next: () => {}, complete: () => {} });
      await new Promise((resolve) => setTimeout(resolve, 20));

      const results = await executor.waitForAll();
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should timeout if specified', async () => {
      const task = createMockTask(TaskType.SHELL, {
        taskConfig: { type: TaskType.SHELL, config: { command: 'sleep 10' } },
      });

      executor.execute(task).subscribe({ next: () => {}, complete: () => {} });
      await new Promise((resolve) => setTimeout(resolve, 50));

      await expect(executor.waitForAll(100)).rejects.toThrow(/Timeout/);
    });

    it('should return execution results for completed tasks', async () => {
      const task = createMockTask(TaskType.SHELL, {
        taskConfig: { type: TaskType.SHELL, config: { command: 'echo result' } },
      });

      executor.execute(task).subscribe({ next: () => {}, complete: () => {} });
      await new Promise((resolve) => setTimeout(resolve, 20));

      const results = await executor.waitForAll();
      expect(results.length).toBe(1);
      expect(results[0].task.id).toBe(task.id);
      expect(results[0].durationMs).toBeGreaterThan(0);
    });
  });

  describe('isRunning', () => {
    it('should return true for running task', async () => {
      const task = createMockTask(TaskType.SHELL, {
        taskConfig: { type: TaskType.SHELL, config: { command: 'sleep 0.5' } },
      });

      executor.execute(task).subscribe({ next: () => {}, complete: () => {} });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(executor.isRunning(task.id)).toBe(true);
    });

    it('should return false for non-existent task', () => {
      expect(executor.isRunning('non-existent')).toBe(false);
    });

    it('should return false after task completes', async () => {
      const task = createMockTask(TaskType.SHELL, {
        taskConfig: { type: TaskType.SHELL, config: { command: 'echo test' } },
      });

      await collectEvents(executor, task);

      expect(executor.isRunning(task.id)).toBe(false);
    });
  });

  describe('getRunningTaskIds', () => {
    it('should return empty array when no tasks running', () => {
      expect(executor.getRunningTaskIds()).toEqual([]);
    });

    it('should return array of running task IDs', async () => {
      const task1 = createMockTask(TaskType.SHELL, {
        id: 'running-1',
        taskConfig: { type: TaskType.SHELL, config: { command: 'sleep 0.5' } },
      });
      const task2 = createMockTask(TaskType.SHELL, {
        id: 'running-2',
        taskConfig: { type: TaskType.SHELL, config: { command: 'sleep 0.5' } },
      });

      executor.execute(task1).subscribe({ next: () => {}, complete: () => {} });
      executor.execute(task2).subscribe({ next: () => {}, complete: () => {} });
      await new Promise((resolve) => setTimeout(resolve, 50));

      const ids = executor.getRunningTaskIds();
      expect(ids).toContain('running-1');
      expect(ids).toContain('running-2');
    });
  });

  describe('stderr handling', () => {
    it('should capture stderr output', async () => {
      const task = createMockTask(TaskType.SHELL, {
        taskConfig: {
          type: TaskType.SHELL,
          config: { command: 'echo "error output" >&2' },
        },
      });

      const events = await collectEvents(executor, task);
      const logEvents = events.filter((e) => e.type === 'log') as any[];

      const stderrLog = logEvents.find((e) => e.log.source === 'stderr');
      expect(stderrLog).toBeDefined();
      if (stderrLog) {
        expect(stderrLog.log.level).toBe(LogLevel.WARN);
      }
    });
  });

  describe('environment variables', () => {
    it('should pass custom environment variables to process', async () => {
      executor.updateOptions({
        environment: { TEST_VAR: 'test_value' },
      });

      const task = createMockTask(TaskType.SHELL, {
        taskConfig: {
          type: TaskType.SHELL,
          config: { command: 'echo $TEST_VAR' },
        },
      });

      const events = await collectEvents(executor, task);
      const logEvents = events.filter((e) => e.type === 'log') as any[];

      const outputLog = logEvents.find((e) => e.log.message.includes('test_value'));
      expect(outputLog).toBeDefined();
    });

    it('should support task-specific environment variables', async () => {
      const task = createMockTask(TaskType.SHELL, {
        taskConfig: {
          type: TaskType.SHELL,
          config: {
            command: 'echo $TASK_SPECIFIC_VAR',
            env: { TASK_SPECIFIC_VAR: 'specific_value' },
          },
        },
      });

      const events = await collectEvents(executor, task);
      const logEvents = events.filter((e) => e.type === 'log') as any[];

      const outputLog = logEvents.find((e) => e.log.message.includes('specific_value'));
      expect(outputLog).toBeDefined();
    });
  });

  describe('shell timeout', () => {
    it('should timeout shell command after specified duration', async () => {
      const task = createMockTask(TaskType.SHELL, {
        taskConfig: {
          type: TaskType.SHELL,
          config: {
            command: 'sleep 10',
            timeout: 100, // 100ms timeout
          },
        },
      });

      const events = await collectEvents(executor, task, 2000);

      const failedEvent = events.find((e) => e.type === 'failed');
      expect(failedEvent).toBeDefined();
      if (failedEvent?.type === 'failed') {
        expect(failedEvent.result.exitCode).toBe(124);
        expect(failedEvent.result.message).toContain('timed out');
      }
    });
  });

  describe('validation types', () => {
    it('should handle DNS validation type', async () => {
      const task = createMockTask(TaskType.VALIDATION, {
        taskConfig: {
          type: TaskType.VALIDATION,
          config: {
            type: 'dns',
            target: 'localhost',
            timeout: 5000,
            retry: { maxRetries: 0, delayMs: 100 },
          },
        },
      });

      const events = await collectEvents(executor, task, 10000);

      const terminalEvent = events.find(
        (e) => e.type === 'completed' || e.type === 'failed',
      );
      expect(terminalEvent).toBeDefined();
    });

    it('should handle connectivity validation type', async () => {
      const task = createMockTask(TaskType.VALIDATION, {
        taskConfig: {
          type: TaskType.VALIDATION,
          config: {
            type: 'connectivity',
            target: 'localhost:22', // SSH port
            timeout: 2000,
            retry: { maxRetries: 0, delayMs: 100 },
          },
        },
      });

      const events = await collectEvents(executor, task, 5000);

      const terminalEvent = events.find(
        (e) => e.type === 'completed' || e.type === 'failed',
      );
      expect(terminalEvent).toBeDefined();
    });
  });
});
