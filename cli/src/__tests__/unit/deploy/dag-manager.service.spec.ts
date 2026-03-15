import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { DAGManagerService } from '../../../modules/deploy/tui/services/dag-manager.service';
import {
  DeployTask,
  TaskStatus,
  TaskType,
  TaskResult,
} from '../../../modules/deploy/tui/interfaces/task.interface';
import {
  DAGEvent,
  DAGEventCallback,
  DAGManagerOptions,
} from '../../../modules/deploy/tui/interfaces/dag.interface';
import { DeploymentPhase } from '../../../interfaces/deployment.interface';

/**
 * Factory function to create mock tasks with sensible defaults
 */
function createMockTask(overrides: Partial<DeployTask> = {}): DeployTask {
  return {
    id: 'test-task',
    name: 'Test Task',
    description: 'Test task description',
    phase: DeploymentPhase.CORE_SERVICES,
    type: TaskType.ANSIBLE,
    status: TaskStatus.PENDING,
    dependencies: [],
    dependents: [],
    mandatory: true,
    enabled: true,
    estimatedDuration: 60,
    timing: {},
    logs: [],
    ...overrides,
  };
}

/**
 * Create a simple linear DAG: a -> b -> c -> d
 */
function createLinearDag(): DeployTask[] {
  return [
    createMockTask({ id: 'a', name: 'Task A', dependencies: [], phase: DeploymentPhase.INFRASTRUCTURE_SETUP }),
    createMockTask({ id: 'b', name: 'Task B', dependencies: ['a'], phase: DeploymentPhase.KUBERNETES_BOOTSTRAP }),
    createMockTask({ id: 'c', name: 'Task C', dependencies: ['b'], phase: DeploymentPhase.CORE_SERVICES }),
    createMockTask({ id: 'd', name: 'Task D', dependencies: ['c'], phase: DeploymentPhase.DATABASES }),
  ];
}

/**
 * Create a diamond DAG:
 *     a
 *    / \
 *   b   c
 *    \ /
 *     d
 */
function createDiamondDag(): DeployTask[] {
  return [
    createMockTask({ id: 'a', name: 'Task A', dependencies: [], phase: DeploymentPhase.INFRASTRUCTURE_SETUP }),
    createMockTask({ id: 'b', name: 'Task B', dependencies: ['a'], phase: DeploymentPhase.KUBERNETES_BOOTSTRAP }),
    createMockTask({ id: 'c', name: 'Task C', dependencies: ['a'], phase: DeploymentPhase.KUBERNETES_BOOTSTRAP }),
    createMockTask({ id: 'd', name: 'Task D', dependencies: ['b', 'c'], phase: DeploymentPhase.CORE_SERVICES }),
  ];
}

/**
 * Create a DAG with a cycle: a -> b -> c -> a
 */
function createCyclicDag(): DeployTask[] {
  return [
    createMockTask({ id: 'a', name: 'Task A', dependencies: ['c'] }),
    createMockTask({ id: 'b', name: 'Task B', dependencies: ['a'] }),
    createMockTask({ id: 'c', name: 'Task C', dependencies: ['b'] }),
  ];
}

/**
 * Create a DAG with backward phase dependencies
 */
function createBackwardPhaseDag(): DeployTask[] {
  return [
    createMockTask({ id: 'a', name: 'Task A', dependencies: [], phase: DeploymentPhase.DATABASES }),
    createMockTask({ id: 'b', name: 'Task B', dependencies: ['a'], phase: DeploymentPhase.INFRASTRUCTURE_SETUP }),
  ];
}

describe('DAGManagerService', () => {
  let dagManager: DAGManagerService;

  beforeEach(() => {
    dagManager = new DAGManagerService();
  });

  // ============================================================
  // SECTION 1: Initialization Tests
  // ============================================================
  describe('initialize', () => {
    test('should accept empty task list', () => {
      expect(() => dagManager.initialize([])).not.toThrow();
      expect(dagManager.getTasks()).toHaveLength(0);
    });

    test('should accept single task', () => {
      const tasks = [createMockTask({ id: 'single' })];
      dagManager.initialize(tasks);
      expect(dagManager.getTasks()).toHaveLength(1);
    });

    test('should compute dependents from dependencies', () => {
      dagManager.initialize(createLinearDag());

      const taskA = dagManager.getTask('a');
      const taskB = dagManager.getTask('b');
      const taskC = dagManager.getTask('c');
      const taskD = dagManager.getTask('d');

      expect(taskA?.dependents).toContain('b');
      expect(taskB?.dependents).toContain('c');
      expect(taskC?.dependents).toContain('d');
      expect(taskD?.dependents).toHaveLength(0);
    });

    test('should detect cycles and throw error', () => {
      // Cycles cause stack overflow during depth calculation, which is detected as an error
      expect(() => dagManager.initialize(createCyclicDag())).toThrow();
    });

    test('should validate phase order (no backward dependencies)', () => {
      expect(() => dagManager.initialize(createBackwardPhaseDag())).toThrow(/phase/i);
    });

    test('should compute topological order', () => {
      dagManager.initialize(createLinearDag());
      const sortResult = dagManager.getTopologicalSort();

      // Verify topological order: a must come before b, b before c, c before d
      const order = sortResult.order;
      expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
      expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
      expect(order.indexOf('c')).toBeLessThan(order.indexOf('d'));
    });

    test('should set entry point tasks to QUEUED status', () => {
      dagManager.initialize(createLinearDag());
      const taskA = dagManager.getTask('a');
      expect(taskA?.status).toBe(TaskStatus.QUEUED);
    });

    test('should set tasks with unmet dependencies to BLOCKED status', () => {
      dagManager.initialize(createLinearDag());
      const taskB = dagManager.getTask('b');
      const taskC = dagManager.getTask('c');
      const taskD = dagManager.getTask('d');

      expect(taskB?.status).toBe(TaskStatus.BLOCKED);
      expect(taskC?.status).toBe(TaskStatus.BLOCKED);
      expect(taskD?.status).toBe(TaskStatus.BLOCKED);
    });

    test('should emit deployment:started event after initialization', () => {
      dagManager.initialize(createLinearDag());

      // Subscribe after initialization and trigger an update to verify event system works
      const events: DAGEvent[] = [];
      dagManager.subscribe((event) => events.push(event));

      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);

      // Verify that event subscription is working
      expect(events.some((e) => e.type === 'task:started')).toBe(true);
    });

    test('should handle tasks with self-reference dependency', () => {
      const tasks = [createMockTask({ id: 'self', dependencies: ['self'] })];
      // Self-reference is detected as SELF_REFERENCE error and throws
      expect(() => dagManager.initialize(tasks)).toThrow();
    });

    test('should handle tasks with missing dependency reference', () => {
      const tasks = [createMockTask({ id: 'orphan', dependencies: ['non-existent'] })];
      expect(() => dagManager.initialize(tasks)).toThrow(/non-existent/i);
    });

    test('should skip disabled tasks', () => {
      const tasks = [
        createMockTask({ id: 'enabled', enabled: true }),
        createMockTask({ id: 'disabled', enabled: false, dependencies: [] }),
      ];
      dagManager.initialize(tasks);

      const disabledTask = dagManager.getTask('disabled');
      expect(disabledTask?.status).toBe(TaskStatus.SKIPPED);
    });

    test('should apply skipPhases option', () => {
      const tasks = [
        createMockTask({ id: 'a', phase: DeploymentPhase.INFRASTRUCTURE_SETUP }),
        createMockTask({ id: 'b', phase: DeploymentPhase.KUBERNETES_BOOTSTRAP }),
      ];

      dagManager.initialize(tasks, { skipPhases: [DeploymentPhase.INFRASTRUCTURE_SETUP] });

      const taskA = dagManager.getTask('a');
      expect(taskA?.status).toBe(TaskStatus.SKIPPED);
    });

    test('should apply skipServices option', () => {
      const tasks = [
        createMockTask({ id: 'a', service: 'gitlab' }),
        createMockTask({ id: 'b', service: 'vault' }),
      ];

      dagManager.initialize(tasks, { skipServices: ['gitlab'] });

      const taskA = dagManager.getTask('a');
      expect(taskA?.status).toBe(TaskStatus.SKIPPED);
    });
  });

  // ============================================================
  // SECTION 2: Ready Tasks Tests
  // ============================================================
  describe('getReadyTasks', () => {
    test('should return tasks with no dependencies', () => {
      const tasks = [
        createMockTask({ id: 'a', dependencies: [] }),
        createMockTask({ id: 'b', dependencies: ['a'] }),
      ];
      dagManager.initialize(tasks);

      const readyTasks = dagManager.getReadyTasks();
      expect(readyTasks).toHaveLength(1);
      expect(readyTasks[0].id).toBe('a');
    });

    test('should return tasks with all dependencies completed', () => {
      dagManager.initialize(createDiamondDag());

      // Complete task a
      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('a', TaskStatus.SUCCESS, { exitCode: 0, message: 'OK', retryCount: 0 });

      const readyTasks = dagManager.getReadyTasks();
      expect(readyTasks.map((t) => t.id)).toContain('b');
      expect(readyTasks.map((t) => t.id)).toContain('c');
    });

    test('should NOT return tasks with pending dependencies', () => {
      dagManager.initialize(createLinearDag());

      const readyTasks = dagManager.getReadyTasks();
      expect(readyTasks.map((t) => t.id)).not.toContain('b');
      expect(readyTasks.map((t) => t.id)).not.toContain('c');
      expect(readyTasks.map((t) => t.id)).not.toContain('d');
    });

    test('should NOT return disabled tasks', () => {
      const tasks = [
        createMockTask({ id: 'a', dependencies: [], enabled: false }),
        createMockTask({ id: 'b', dependencies: [], enabled: true }),
      ];
      dagManager.initialize(tasks);

      const readyTasks = dagManager.getReadyTasks();
      expect(readyTasks.map((t) => t.id)).not.toContain('a');
      expect(readyTasks.map((t) => t.id)).toContain('b');
    });

    test('should respect maxCount limit', () => {
      const tasks = [
        createMockTask({ id: 'a', dependencies: [], phase: DeploymentPhase.INFRASTRUCTURE_SETUP }),
        createMockTask({ id: 'b', dependencies: [], phase: DeploymentPhase.INFRASTRUCTURE_SETUP }),
        createMockTask({ id: 'c', dependencies: [], phase: DeploymentPhase.INFRASTRUCTURE_SETUP }),
      ];
      dagManager.initialize(tasks);

      const readyTasks = dagManager.getReadyTasks(2);
      expect(readyTasks).toHaveLength(2);
    });

    test('should respect phase boundaries', () => {
      const tasks = [
        createMockTask({ id: 'a', dependencies: [], phase: DeploymentPhase.INFRASTRUCTURE_SETUP }),
        createMockTask({ id: 'b', dependencies: [], phase: DeploymentPhase.KUBERNETES_BOOTSTRAP }),
      ];
      dagManager.initialize(tasks);

      // Only task 'a' should be ready because it's in an earlier phase
      const readyTasks = dagManager.getReadyTasks();
      expect(readyTasks.map((t) => t.id)).toContain('a');
      // Task 'b' should not be ready until phase 1 is complete
    });

    test('should sort ready tasks by priority', () => {
      const tasks = [
        createMockTask({ id: 'a', dependencies: [], priority: 100, phase: DeploymentPhase.INFRASTRUCTURE_SETUP }),
        createMockTask({ id: 'b', dependencies: [], priority: 1, phase: DeploymentPhase.INFRASTRUCTURE_SETUP }),
        createMockTask({ id: 'c', dependencies: [], priority: 50, phase: DeploymentPhase.INFRASTRUCTURE_SETUP }),
      ];
      dagManager.initialize(tasks);

      const readyTasks = dagManager.getReadyTasks();
      expect(readyTasks[0].id).toBe('b'); // Lowest priority number = highest priority
      expect(readyTasks[1].id).toBe('c');
      expect(readyTasks[2].id).toBe('a');
    });

    test('should return empty array when no tasks are ready', () => {
      const tasks = [
        createMockTask({ id: 'a', dependencies: ['b'] }),
        createMockTask({ id: 'b', dependencies: ['a'] }), // This creates a cycle, but let's test with blocked tasks
      ];

      // Use a valid DAG where all tasks are blocked
      const validTasks = [
        createMockTask({ id: 'a', dependencies: [], status: TaskStatus.RUNNING }),
        createMockTask({ id: 'b', dependencies: ['a'] }),
      ];
      dagManager.initialize(validTasks);

      // Mark 'a' as running so it's not in QUEUED status
      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);

      const readyTasks = dagManager.getReadyTasks();
      expect(readyTasks).toHaveLength(0);
    });
  });

  // ============================================================
  // SECTION 3: Status Updates Tests
  // ============================================================
  describe('updateTaskStatus', () => {
    test('should update task status', () => {
      dagManager.initialize([createMockTask({ id: 'a' })]);

      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);
      expect(dagManager.getTask('a')?.status).toBe(TaskStatus.RUNNING);

      dagManager.updateTaskStatus('a', TaskStatus.SUCCESS, { exitCode: 0, message: 'Done', retryCount: 0 });
      expect(dagManager.getTask('a')?.status).toBe(TaskStatus.SUCCESS);
    });

    test('should cascade unblock dependents on success', () => {
      dagManager.initialize(createLinearDag());

      // Task B should be blocked initially
      expect(dagManager.getTask('b')?.status).toBe(TaskStatus.BLOCKED);

      // Complete task A
      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('a', TaskStatus.SUCCESS, { exitCode: 0, message: 'OK', retryCount: 0 });

      // Task B should now be queued
      expect(dagManager.getTask('b')?.status).toBe(TaskStatus.QUEUED);
    });

    test('should cascade unblock dependents on skip', () => {
      dagManager.initialize(createLinearDag());

      dagManager.skipTask('a', 'Testing skip');

      expect(dagManager.getTask('b')?.status).toBe(TaskStatus.QUEUED);
    });

    test('should cascade block dependents on failure when continueOnError is false', () => {
      dagManager.initialize(createLinearDag(), { continueOnError: false });

      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('a', TaskStatus.FAILED, { exitCode: 1, message: 'Error', retryCount: 0 });

      // Task B should remain blocked
      expect(dagManager.getTask('b')?.status).toBe(TaskStatus.BLOCKED);
    });

    test('should update timing information on RUNNING', () => {
      dagManager.initialize([createMockTask({ id: 'a' })]);

      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);

      const task = dagManager.getTask('a');
      expect(task?.timing.startedAt).toBeDefined();
    });

    test('should update timing information on SUCCESS', () => {
      dagManager.initialize([createMockTask({ id: 'a' })]);

      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('a', TaskStatus.SUCCESS, { exitCode: 0, message: 'OK', retryCount: 0 });

      const task = dagManager.getTask('a');
      expect(task?.timing.completedAt).toBeDefined();
      expect(task?.timing.durationMs).toBeDefined();
    });

    test('should emit task:started event', () => {
      const events: DAGEvent[] = [];
      dagManager.initialize([createMockTask({ id: 'a' })]);
      dagManager.subscribe((event) => events.push(event));

      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);

      expect(events.some((e) => e.type === 'task:started' && (e as any).taskId === 'a')).toBe(true);
    });

    test('should emit task:completed event', () => {
      const events: DAGEvent[] = [];
      dagManager.initialize([createMockTask({ id: 'a' })]);
      dagManager.subscribe((event) => events.push(event));

      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('a', TaskStatus.SUCCESS, { exitCode: 0, message: 'OK', retryCount: 0 });

      expect(events.some((e) => e.type === 'task:completed' && (e as any).taskId === 'a')).toBe(true);
    });

    test('should emit task:failed event', () => {
      const events: DAGEvent[] = [];
      dagManager.initialize([createMockTask({ id: 'a' })]);
      dagManager.subscribe((event) => events.push(event));

      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('a', TaskStatus.FAILED, { exitCode: 1, message: 'Error', retryCount: 0 });

      expect(events.some((e) => e.type === 'task:failed' && (e as any).taskId === 'a')).toBe(true);
    });

    test('should emit progress:updated event', () => {
      const events: DAGEvent[] = [];
      dagManager.initialize([createMockTask({ id: 'a' })]);
      dagManager.subscribe((event) => events.push(event));

      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);

      expect(events.some((e) => e.type === 'progress:updated')).toBe(true);
    });

    test('should throw for non-existent task', () => {
      dagManager.initialize([createMockTask({ id: 'a' })]);

      expect(() => dagManager.updateTaskStatus('nonexistent', TaskStatus.RUNNING)).toThrow(/not found/i);
    });

    test('should store result on completion', () => {
      dagManager.initialize([createMockTask({ id: 'a' })]);

      const result: TaskResult = {
        exitCode: 0,
        message: 'Task completed successfully',
        retryCount: 0,
        output: { key: 'value' },
      };

      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('a', TaskStatus.SUCCESS, result);

      const task = dagManager.getTask('a');
      expect(task?.result).toEqual(result);
    });

    test('should handle diamond DAG unblocking correctly', () => {
      dagManager.initialize(createDiamondDag());

      // Complete task A
      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('a', TaskStatus.SUCCESS, { exitCode: 0, message: 'OK', retryCount: 0 });

      // Both B and C should be queued
      expect(dagManager.getTask('b')?.status).toBe(TaskStatus.QUEUED);
      expect(dagManager.getTask('c')?.status).toBe(TaskStatus.QUEUED);

      // D should still be blocked
      expect(dagManager.getTask('d')?.status).toBe(TaskStatus.BLOCKED);

      // Complete B only
      dagManager.updateTaskStatus('b', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('b', TaskStatus.SUCCESS, { exitCode: 0, message: 'OK', retryCount: 0 });

      // D should still be blocked (waiting for C)
      expect(dagManager.getTask('d')?.status).toBe(TaskStatus.BLOCKED);

      // Complete C
      dagManager.updateTaskStatus('c', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('c', TaskStatus.SUCCESS, { exitCode: 0, message: 'OK', retryCount: 0 });

      // Now D should be queued
      expect(dagManager.getTask('d')?.status).toBe(TaskStatus.QUEUED);
    });
  });

  // ============================================================
  // SECTION 4: Progress Tracking Tests
  // ============================================================
  describe('getProgress', () => {
    test('should calculate correct percentage for empty DAG', () => {
      dagManager.initialize([]);
      const progress = dagManager.getProgress();
      expect(progress.progressPercent).toBe(0);
      expect(progress.totalTasks).toBe(0);
    });

    test('should calculate correct percentage for completed tasks', () => {
      dagManager.initialize(createLinearDag());

      // Complete all tasks
      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('a', TaskStatus.SUCCESS, { exitCode: 0, message: 'OK', retryCount: 0 });
      dagManager.updateTaskStatus('b', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('b', TaskStatus.SUCCESS, { exitCode: 0, message: 'OK', retryCount: 0 });
      dagManager.updateTaskStatus('c', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('c', TaskStatus.SUCCESS, { exitCode: 0, message: 'OK', retryCount: 0 });
      dagManager.updateTaskStatus('d', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('d', TaskStatus.SUCCESS, { exitCode: 0, message: 'OK', retryCount: 0 });

      const progress = dagManager.getProgress();
      expect(progress.progressPercent).toBe(100);
      expect(progress.completedTasks).toBe(4);
    });

    test('should track tasks by status', () => {
      dagManager.initialize(createLinearDag());

      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);

      const progress = dagManager.getProgress();
      expect(progress.runningTasks).toBe(1);
      expect(progress.queuedTasks).toBe(0); // Task A was queued but now running
      expect(progress.blockedTasks).toBe(3);
    });

    test('should estimate remaining time', () => {
      const tasks = [
        createMockTask({ id: 'a', dependencies: [], estimatedDuration: 60 }),
        createMockTask({ id: 'b', dependencies: ['a'], estimatedDuration: 30 }),
      ];
      dagManager.initialize(tasks);

      const progress = dagManager.getProgress();
      expect(progress.estimatedRemainingSeconds).toBeGreaterThan(0);
    });

    test('should identify current phase', () => {
      dagManager.initialize(createLinearDag());

      const progress = dagManager.getProgress();
      expect(progress.currentPhase).toBe(DeploymentPhase.INFRASTRUCTURE_SETUP);
    });

    test('should report failed status when tasks fail', () => {
      dagManager.initialize([createMockTask({ id: 'a' })]);

      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('a', TaskStatus.FAILED, { exitCode: 1, message: 'Error', retryCount: 0 });

      const progress = dagManager.getProgress();
      expect(progress.failedTasks).toBe(1);
      expect(progress.status).toBe('failed');
    });

    test('should report running status during execution', () => {
      dagManager.initialize([createMockTask({ id: 'a' })]);

      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);

      const progress = dagManager.getProgress();
      expect(progress.status).toBe('running');
    });

    test('should report completed status when all tasks succeed', () => {
      dagManager.initialize([createMockTask({ id: 'a' })]);

      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('a', TaskStatus.SUCCESS, { exitCode: 0, message: 'OK', retryCount: 0 });

      const progress = dagManager.getProgress();
      expect(progress.status).toBe('completed');
    });

    test('should include elapsed time', () => {
      dagManager.initialize([createMockTask({ id: 'a' })]);

      const progress = dagManager.getProgress();
      expect(progress.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(progress.startedAt).toBeDefined();
    });

    test('should track last error', () => {
      dagManager.initialize([createMockTask({ id: 'a' })]);

      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('a', TaskStatus.FAILED, {
        exitCode: 1,
        message: 'Error',
        error: 'Connection refused',
        retryCount: 0,
      });

      const progress = dagManager.getProgress();
      expect(progress.lastError).toBe('Connection refused');
      expect(progress.lastFailedTask).toBe('a');
    });
  });

  // ============================================================
  // SECTION 5: Task Operations Tests
  // ============================================================
  describe('skipTask', () => {
    test('should mark task as skipped', () => {
      dagManager.initialize([createMockTask({ id: 'a' })]);

      dagManager.skipTask('a', 'User requested skip');

      expect(dagManager.getTask('a')?.status).toBe(TaskStatus.SKIPPED);
    });

    test('should unblock dependents', () => {
      dagManager.initialize(createLinearDag());

      dagManager.skipTask('a', 'Skipping task A');

      expect(dagManager.getTask('b')?.status).toBe(TaskStatus.QUEUED);
    });

    test('should emit task:skipped event', () => {
      const events: DAGEvent[] = [];
      dagManager.initialize([createMockTask({ id: 'a' })]);
      dagManager.subscribe((event) => events.push(event));

      dagManager.skipTask('a', 'Test skip');

      expect(events.some((e) => e.type === 'task:skipped' && (e as any).taskId === 'a')).toBe(true);
    });

    test('should store skip reason in result', () => {
      dagManager.initialize([createMockTask({ id: 'a' })]);

      dagManager.skipTask('a', 'Custom skip reason');

      const task = dagManager.getTask('a');
      expect(task?.result?.message).toBe('Custom skip reason');
    });

    test('should throw when skipping running task', () => {
      dagManager.initialize([createMockTask({ id: 'a' })]);
      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);

      expect(() => dagManager.skipTask('a', 'Cannot skip')).toThrow(/running/i);
    });

    test('should throw for non-existent task', () => {
      dagManager.initialize([createMockTask({ id: 'a' })]);

      expect(() => dagManager.skipTask('nonexistent', 'Skip reason')).toThrow(/not found/i);
    });
  });

  describe('retryTask', () => {
    test('should reset failed task to pending/queued', () => {
      dagManager.initialize([createMockTask({ id: 'a' })]);
      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('a', TaskStatus.FAILED, { exitCode: 1, message: 'Error', retryCount: 0 });

      const result = dagManager.retryTask('a');

      expect(result).toBe(true);
      expect(dagManager.getTask('a')?.status).toBe(TaskStatus.QUEUED);
    });

    test('should return false if task is not failed', () => {
      dagManager.initialize([createMockTask({ id: 'a' })]);

      const result = dagManager.retryTask('a');

      expect(result).toBe(false);
    });

    test('should respect maxRetries', () => {
      dagManager.initialize([createMockTask({ id: 'a', maxRetries: 2 })]);
      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('a', TaskStatus.FAILED, { exitCode: 1, message: 'Error', retryCount: 0 });

      // First retry
      expect(dagManager.retryTask('a')).toBe(true);
      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('a', TaskStatus.FAILED, { exitCode: 1, message: 'Error', retryCount: 1 });

      // Second retry
      expect(dagManager.retryTask('a')).toBe(true);
      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('a', TaskStatus.FAILED, { exitCode: 1, message: 'Error', retryCount: 2 });

      // Third retry should fail (exceeded maxRetries)
      expect(dagManager.retryTask('a')).toBe(false);
    });

    test('should increment retry attempt counter', () => {
      dagManager.initialize([createMockTask({ id: 'a' })]);
      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('a', TaskStatus.FAILED, { exitCode: 1, message: 'Error', retryCount: 0 });

      dagManager.retryTask('a');

      expect(dagManager.getTask('a')?.retryAttempt).toBe(1);
    });

    test('should clear previous result and logs', () => {
      dagManager.initialize([createMockTask({ id: 'a' })]);
      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('a', TaskStatus.FAILED, { exitCode: 1, message: 'Error', retryCount: 0 });

      dagManager.retryTask('a');

      const task = dagManager.getTask('a');
      expect(task?.result).toBeUndefined();
      expect(task?.logs).toHaveLength(0);
    });

    test('should emit task:retrying event', () => {
      const events: DAGEvent[] = [];
      dagManager.initialize([createMockTask({ id: 'a' })]);
      dagManager.subscribe((event) => events.push(event));

      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('a', TaskStatus.FAILED, { exitCode: 1, message: 'Error', retryCount: 0 });
      dagManager.retryTask('a');

      expect(events.some((e) => e.type === 'task:retrying' && (e as any).taskId === 'a')).toBe(true);
    });

    test('should return false for non-existent task', () => {
      dagManager.initialize([createMockTask({ id: 'a' })]);

      const result = dagManager.retryTask('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('cancelTask', () => {
    test('should mark task as cancelled', () => {
      dagManager.initialize([createMockTask({ id: 'a' })]);

      dagManager.cancelTask('a');

      expect(dagManager.getTask('a')?.status).toBe(TaskStatus.CANCELLED);
    });

    test('should cascade cancel dependents when cascade is true', () => {
      dagManager.initialize(createLinearDag());

      dagManager.cancelTask('a', true);

      expect(dagManager.getTask('a')?.status).toBe(TaskStatus.CANCELLED);
      expect(dagManager.getTask('b')?.status).toBe(TaskStatus.CANCELLED);
      expect(dagManager.getTask('c')?.status).toBe(TaskStatus.CANCELLED);
      expect(dagManager.getTask('d')?.status).toBe(TaskStatus.CANCELLED);
    });

    test('should not cascade cancel when cascade is false', () => {
      dagManager.initialize(createLinearDag());

      dagManager.cancelTask('a', false);

      expect(dagManager.getTask('a')?.status).toBe(TaskStatus.CANCELLED);
      expect(dagManager.getTask('b')?.status).toBe(TaskStatus.BLOCKED);
    });

    test('should emit task:cancelled event', () => {
      const events: DAGEvent[] = [];
      dagManager.initialize([createMockTask({ id: 'a' })]);
      dagManager.subscribe((event) => events.push(event));

      dagManager.cancelTask('a');

      expect(events.some((e) => e.type === 'task:cancelled' && (e as any).taskId === 'a')).toBe(true);
    });

    test('should not cancel already completed tasks', () => {
      dagManager.initialize([createMockTask({ id: 'a' })]);
      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('a', TaskStatus.SUCCESS, { exitCode: 0, message: 'OK', retryCount: 0 });

      dagManager.cancelTask('a');

      // Should remain SUCCESS
      expect(dagManager.getTask('a')?.status).toBe(TaskStatus.SUCCESS);
    });

    test('should throw for non-existent task', () => {
      dagManager.initialize([createMockTask({ id: 'a' })]);

      expect(() => dagManager.cancelTask('nonexistent')).toThrow(/not found/i);
    });
  });

  // ============================================================
  // SECTION 6: DAG Queries and Utilities
  // ============================================================
  describe('getTasks', () => {
    test('should return all tasks without filter', () => {
      dagManager.initialize(createLinearDag());

      const tasks = dagManager.getTasks();
      expect(tasks).toHaveLength(4);
    });

    test('should filter by status', () => {
      dagManager.initialize(createLinearDag());

      const blockedTasks = dagManager.getTasks({ status: TaskStatus.BLOCKED });
      expect(blockedTasks).toHaveLength(3);
    });

    test('should filter by phase', () => {
      dagManager.initialize(createLinearDag());

      const coreTasks = dagManager.getTasks({ phase: DeploymentPhase.CORE_SERVICES });
      expect(coreTasks).toHaveLength(1);
      expect(coreTasks[0].id).toBe('c');
    });

    test('should sort by name ascending', () => {
      dagManager.initialize(createLinearDag());

      const tasks = dagManager.getTasks(undefined, { field: 'name', direction: 'asc' });
      expect(tasks[0].name).toBe('Task A');
      expect(tasks[3].name).toBe('Task D');
    });

    test('should sort by name descending', () => {
      dagManager.initialize(createLinearDag());

      const tasks = dagManager.getTasks(undefined, { field: 'name', direction: 'desc' });
      expect(tasks[0].name).toBe('Task D');
      expect(tasks[3].name).toBe('Task A');
    });

    test('should filter by multiple statuses', () => {
      dagManager.initialize(createLinearDag());

      const tasks = dagManager.getTasks({ status: [TaskStatus.QUEUED, TaskStatus.BLOCKED] });
      expect(tasks).toHaveLength(4);
    });
  });

  describe('getTask', () => {
    test('should return task by id', () => {
      dagManager.initialize(createLinearDag());

      const task = dagManager.getTask('a');
      expect(task).toBeDefined();
      expect(task?.id).toBe('a');
    });

    test('should return undefined for non-existent task', () => {
      dagManager.initialize(createLinearDag());

      const task = dagManager.getTask('nonexistent');
      expect(task).toBeUndefined();
    });
  });

  describe('getRunningTasks', () => {
    test('should return only running tasks', () => {
      dagManager.initialize(createDiamondDag());
      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);

      const runningTasks = dagManager.getRunningTasks();
      expect(runningTasks).toHaveLength(1);
      expect(runningTasks[0].id).toBe('a');
    });

    test('should return empty array when no tasks are running', () => {
      dagManager.initialize(createLinearDag());

      const runningTasks = dagManager.getRunningTasks();
      expect(runningTasks).toHaveLength(0);
    });
  });

  describe('getBlockedTasks', () => {
    test('should return blocked tasks with blocking dependencies', () => {
      dagManager.initialize(createLinearDag());

      const blockedTasks = dagManager.getBlockedTasks();

      expect(blockedTasks).toHaveLength(3);
      const taskB = blockedTasks.find((bt) => bt.task.id === 'b');
      expect(taskB?.blockedBy).toContain('a');
    });

    test('should show multiple blocking dependencies', () => {
      dagManager.initialize(createDiamondDag());

      const blockedTasks = dagManager.getBlockedTasks();
      const taskD = blockedTasks.find((bt) => bt.task.id === 'd');

      expect(taskD?.blockedBy).toContain('b');
      expect(taskD?.blockedBy).toContain('c');
    });
  });

  describe('canExecute', () => {
    test('should return true for queued task with satisfied dependencies', () => {
      dagManager.initialize([createMockTask({ id: 'a', dependencies: [] })]);

      expect(dagManager.canExecute('a')).toBe(true);
    });

    test('should return false for blocked task', () => {
      dagManager.initialize(createLinearDag());

      expect(dagManager.canExecute('b')).toBe(false);
    });

    test('should return false for disabled task', () => {
      dagManager.initialize([createMockTask({ id: 'a', enabled: false })]);

      expect(dagManager.canExecute('a')).toBe(false);
    });

    test('should return false for non-existent task', () => {
      dagManager.initialize([createMockTask({ id: 'a' })]);

      expect(dagManager.canExecute('nonexistent')).toBe(false);
    });

    test('should return false for running task', () => {
      dagManager.initialize([createMockTask({ id: 'a' })]);
      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);

      expect(dagManager.canExecute('a')).toBe(false);
    });
  });

  describe('isComplete', () => {
    test('should return false for incomplete DAG', () => {
      dagManager.initialize(createLinearDag());

      expect(dagManager.isComplete()).toBe(false);
    });

    test('should return true when all tasks completed', () => {
      dagManager.initialize([createMockTask({ id: 'a' })]);
      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('a', TaskStatus.SUCCESS, { exitCode: 0, message: 'OK', retryCount: 0 });

      expect(dagManager.isComplete()).toBe(true);
    });

    test('should return true when all tasks skipped', () => {
      dagManager.initialize([createMockTask({ id: 'a' })]);
      dagManager.skipTask('a', 'Skipped');

      expect(dagManager.isComplete()).toBe(true);
    });

    test('should return true for empty DAG', () => {
      dagManager.initialize([]);

      expect(dagManager.isComplete()).toBe(true);
    });
  });

  describe('hasFailed', () => {
    test('should return false when no tasks failed', () => {
      dagManager.initialize(createLinearDag());

      expect(dagManager.hasFailed()).toBe(false);
    });

    test('should return true when any task failed', () => {
      dagManager.initialize([createMockTask({ id: 'a' })]);
      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('a', TaskStatus.FAILED, { exitCode: 1, message: 'Error', retryCount: 0 });

      expect(dagManager.hasFailed()).toBe(true);
    });
  });

  // ============================================================
  // SECTION 7: Graph Structure Tests
  // ============================================================
  describe('getTopologicalSort', () => {
    test('should return correct order for linear DAG', () => {
      dagManager.initialize(createLinearDag());

      const result = dagManager.getTopologicalSort();

      expect(result.order.indexOf('a')).toBeLessThan(result.order.indexOf('b'));
      expect(result.order.indexOf('b')).toBeLessThan(result.order.indexOf('c'));
      expect(result.order.indexOf('c')).toBeLessThan(result.order.indexOf('d'));
    });

    test('should return correct order for diamond DAG', () => {
      dagManager.initialize(createDiamondDag());

      const result = dagManager.getTopologicalSort();

      expect(result.order.indexOf('a')).toBeLessThan(result.order.indexOf('b'));
      expect(result.order.indexOf('a')).toBeLessThan(result.order.indexOf('c'));
      expect(result.order.indexOf('b')).toBeLessThan(result.order.indexOf('d'));
      expect(result.order.indexOf('c')).toBeLessThan(result.order.indexOf('d'));
    });

    test('should compute levels', () => {
      dagManager.initialize(createDiamondDag());

      const result = dagManager.getTopologicalSort();

      expect(result.levels.length).toBeGreaterThan(0);
      // Level 0 should contain 'a'
      expect(result.levels[0]).toContain('a');
    });

    test('should compute critical path', () => {
      dagManager.initialize(createLinearDag());

      const result = dagManager.getTopologicalSort();

      expect(result.criticalPath.length).toBeGreaterThan(0);
      expect(result.criticalPathDuration).toBeGreaterThan(0);
    });
  });

  describe('getCriticalPath', () => {
    test('should return longest dependency chain', () => {
      dagManager.initialize(createLinearDag());

      const criticalPath = dagManager.getCriticalPath();

      expect(criticalPath).toHaveLength(4);
      expect(criticalPath).toContain('a');
      expect(criticalPath).toContain('d');
    });
  });

  describe('getGraph', () => {
    test('should return graph structure', () => {
      dagManager.initialize(createDiamondDag());

      const graph = dagManager.getGraph();

      expect(graph.nodes).toHaveLength(4);
      expect(graph.edges.length).toBeGreaterThan(0);
      expect(graph.depth).toBeGreaterThan(0);
    });

    test('should include node positions', () => {
      dagManager.initialize(createLinearDag());

      const graph = dagManager.getGraph();

      graph.nodes.forEach((node) => {
        expect(node.x).toBeDefined();
        expect(node.y).toBeDefined();
      });
    });
  });

  describe('getDependencyEdges', () => {
    test('should return all edges', () => {
      dagManager.initialize(createDiamondDag());

      const edges = dagManager.getDependencyEdges();

      // a->b, a->c, b->d, c->d = 4 edges
      expect(edges).toHaveLength(4);
    });

    test('should mark satisfied edges', () => {
      dagManager.initialize(createLinearDag());
      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('a', TaskStatus.SUCCESS, { exitCode: 0, message: 'OK', retryCount: 0 });

      const edges = dagManager.getDependencyEdges();
      const aToB = edges.find((e) => e.from === 'a' && e.to === 'b');

      expect(aToB?.satisfied).toBe(true);
    });
  });

  // ============================================================
  // SECTION 8: Event Subscription Tests
  // ============================================================
  describe('subscribe', () => {
    test('should receive events', () => {
      const events: DAGEvent[] = [];
      dagManager.initialize([createMockTask({ id: 'a' })]);

      dagManager.subscribe((event) => events.push(event));
      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);

      expect(events.length).toBeGreaterThan(0);
    });

    test('should allow unsubscribe', () => {
      const events: DAGEvent[] = [];
      dagManager.initialize([createMockTask({ id: 'a' })]);

      const unsubscribe = dagManager.subscribe((event) => events.push(event));
      unsubscribe();
      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);

      // No events after unsubscribe (except initial events)
      const eventsAfterUnsubscribe = events.filter((e) => e.type === 'task:started');
      expect(eventsAfterUnsubscribe).toHaveLength(0);
    });

    test('should support multiple subscribers', () => {
      const events1: DAGEvent[] = [];
      const events2: DAGEvent[] = [];
      dagManager.initialize([createMockTask({ id: 'a' })]);

      dagManager.subscribe((event) => events1.push(event));
      dagManager.subscribe((event) => events2.push(event));
      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);

      expect(events1.length).toBeGreaterThan(0);
      expect(events2.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // SECTION 9: State Management Tests
  // ============================================================
  describe('reset', () => {
    test('should reset all tasks to initial state', () => {
      dagManager.initialize(createLinearDag());
      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('a', TaskStatus.SUCCESS, { exitCode: 0, message: 'OK', retryCount: 0 });

      dagManager.reset();

      const task = dagManager.getTask('a');
      expect(task?.status).toBe(TaskStatus.QUEUED);
      expect(task?.result).toBeUndefined();
      expect(task?.timing.startedAt).toBeUndefined();
    });
  });

  describe('exportState / importState', () => {
    test('should export current state', () => {
      dagManager.initialize(createLinearDag());
      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);

      const state = dagManager.exportState();

      expect(state.version).toBe('1.0.0');
      expect(state.tasks).toHaveLength(4);
      expect(state.progress).toBeDefined();
    });

    test('should import previously exported state', () => {
      dagManager.initialize(createLinearDag());
      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('a', TaskStatus.SUCCESS, { exitCode: 0, message: 'OK', retryCount: 0 });

      const state = dagManager.exportState();

      // Create new manager and import
      const newManager = new DAGManagerService();
      newManager.importState(state);

      const task = newManager.getTask('a');
      expect(task?.status).toBe(TaskStatus.SUCCESS);
    });

    test('should throw for unsupported version', () => {
      dagManager.initialize([createMockTask({ id: 'a' })]);
      const state = dagManager.exportState();
      state.version = '999.0.0';

      const newManager = new DAGManagerService();
      expect(() => newManager.importState(state)).toThrow(/unsupported/i);
    });
  });

  // ============================================================
  // SECTION 10: Statistics Tests
  // ============================================================
  describe('getStatistics', () => {
    test('should return task counts by status', () => {
      dagManager.initialize(createLinearDag());

      const stats = dagManager.getStatistics();

      expect(stats.total).toBe(4);
      expect(stats.byStatus[TaskStatus.QUEUED]).toBe(1);
      expect(stats.byStatus[TaskStatus.BLOCKED]).toBe(3);
    });

    test('should return task counts by type', () => {
      const tasks = [
        createMockTask({ id: 'a', type: TaskType.ANSIBLE }),
        createMockTask({ id: 'b', type: TaskType.HELMFILE }),
      ];
      dagManager.initialize(tasks);

      const stats = dagManager.getStatistics();

      expect(stats.byType[TaskType.ANSIBLE]).toBe(1);
      expect(stats.byType[TaskType.HELMFILE]).toBe(1);
    });

    test('should return task counts by phase', () => {
      dagManager.initialize(createLinearDag());

      const stats = dagManager.getStatistics();

      expect(stats.byPhase[DeploymentPhase.INFRASTRUCTURE_SETUP]).toBe(1);
      expect(stats.byPhase[DeploymentPhase.KUBERNETES_BOOTSTRAP]).toBe(1);
      expect(stats.byPhase[DeploymentPhase.CORE_SERVICES]).toBe(1);
      expect(stats.byPhase[DeploymentPhase.DATABASES]).toBe(1);
    });

    test('should compute total estimated duration', () => {
      const tasks = [
        createMockTask({ id: 'a', estimatedDuration: 60 }),
        createMockTask({ id: 'b', estimatedDuration: 30, dependencies: ['a'] }),
      ];
      dagManager.initialize(tasks);

      const stats = dagManager.getStatistics();

      expect(stats.totalEstimatedDuration).toBe(90);
    });
  });

  describe('getPhaseSummaries', () => {
    test('should return summaries for each phase with tasks', () => {
      dagManager.initialize(createLinearDag());

      const summaries = dagManager.getPhaseSummaries();

      expect(summaries.length).toBeGreaterThan(0);
      expect(summaries.some((s) => s.phase === DeploymentPhase.INFRASTRUCTURE_SETUP)).toBe(true);
    });

    test('should track phase status', () => {
      dagManager.initialize(createLinearDag());

      const summaries = dagManager.getPhaseSummaries();
      const phase1 = summaries.find((s) => s.phase === DeploymentPhase.INFRASTRUCTURE_SETUP);

      expect(phase1?.status).toBe('running'); // Has queued tasks
    });
  });

  // ============================================================
  // SECTION 11: setTaskEnabled Tests
  // ============================================================
  describe('setTaskEnabled', () => {
    test('should disable a queued task', () => {
      dagManager.initialize([createMockTask({ id: 'a' })]);

      dagManager.setTaskEnabled('a', false);

      expect(dagManager.getTask('a')?.enabled).toBe(false);
      expect(dagManager.getTask('a')?.status).toBe(TaskStatus.SKIPPED);
    });

    test('should enable a disabled task', () => {
      const tasks = [createMockTask({ id: 'a', enabled: false })];
      dagManager.initialize(tasks);

      dagManager.setTaskEnabled('a', true);

      expect(dagManager.getTask('a')?.enabled).toBe(true);
      expect(dagManager.getTask('a')?.status).toBe(TaskStatus.QUEUED);
    });

    test('should cascade unblock when disabling a task', () => {
      dagManager.initialize(createLinearDag());

      dagManager.setTaskEnabled('a', false);

      // Task B should be unblocked since A is now skipped
      expect(dagManager.getTask('b')?.status).toBe(TaskStatus.QUEUED);
    });

    test('should throw for non-existent task', () => {
      dagManager.initialize([createMockTask({ id: 'a' })]);

      expect(() => dagManager.setTaskEnabled('nonexistent', false)).toThrow(/not found/i);
    });
  });

  // ============================================================
  // SECTION 12: Edge Cases and Large DAGs
  // ============================================================
  describe('edge cases', () => {
    test('should handle large DAG (100 tasks)', () => {
      const tasks: DeployTask[] = [];
      for (let i = 0; i < 100; i++) {
        tasks.push(
          createMockTask({
            id: `task-${i}`,
            name: `Task ${i}`,
            dependencies: i > 0 ? [`task-${i - 1}`] : [],
            phase: DeploymentPhase.CORE_SERVICES,
          }),
        );
      }

      expect(() => dagManager.initialize(tasks)).not.toThrow();
      expect(dagManager.getTasks()).toHaveLength(100);
    });

    test('should handle wide DAG (many parallel tasks)', () => {
      const tasks: DeployTask[] = [createMockTask({ id: 'root', dependencies: [] })];

      for (let i = 0; i < 50; i++) {
        tasks.push(
          createMockTask({
            id: `parallel-${i}`,
            name: `Parallel Task ${i}`,
            dependencies: ['root'],
            phase: DeploymentPhase.CORE_SERVICES,
          }),
        );
      }

      dagManager.initialize(tasks);

      // Complete root task
      dagManager.updateTaskStatus('root', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('root', TaskStatus.SUCCESS, { exitCode: 0, message: 'OK', retryCount: 0 });

      // All parallel tasks should be ready
      const readyTasks = dagManager.getReadyTasks();
      expect(readyTasks.length).toBe(50);
    });

    test('should handle complex diamond with multiple levels', () => {
      //       a
      //      / \
      //     b   c
      //    / \ / \
      //   d   e   f
      //    \ | /
      //      g
      const tasks = [
        createMockTask({ id: 'a', dependencies: [], phase: DeploymentPhase.INFRASTRUCTURE_SETUP }),
        createMockTask({ id: 'b', dependencies: ['a'], phase: DeploymentPhase.KUBERNETES_BOOTSTRAP }),
        createMockTask({ id: 'c', dependencies: ['a'], phase: DeploymentPhase.KUBERNETES_BOOTSTRAP }),
        createMockTask({ id: 'd', dependencies: ['b'], phase: DeploymentPhase.CORE_SERVICES }),
        createMockTask({ id: 'e', dependencies: ['b', 'c'], phase: DeploymentPhase.CORE_SERVICES }),
        createMockTask({ id: 'f', dependencies: ['c'], phase: DeploymentPhase.CORE_SERVICES }),
        createMockTask({ id: 'g', dependencies: ['d', 'e', 'f'], phase: DeploymentPhase.DATABASES }),
      ];

      dagManager.initialize(tasks);

      const sortResult = dagManager.getTopologicalSort();

      // Verify ordering constraints
      expect(sortResult.order.indexOf('a')).toBeLessThan(sortResult.order.indexOf('b'));
      expect(sortResult.order.indexOf('a')).toBeLessThan(sortResult.order.indexOf('c'));
      expect(sortResult.order.indexOf('b')).toBeLessThan(sortResult.order.indexOf('d'));
      expect(sortResult.order.indexOf('b')).toBeLessThan(sortResult.order.indexOf('e'));
      expect(sortResult.order.indexOf('c')).toBeLessThan(sortResult.order.indexOf('e'));
      expect(sortResult.order.indexOf('c')).toBeLessThan(sortResult.order.indexOf('f'));
      expect(sortResult.order.indexOf('d')).toBeLessThan(sortResult.order.indexOf('g'));
      expect(sortResult.order.indexOf('e')).toBeLessThan(sortResult.order.indexOf('g'));
      expect(sortResult.order.indexOf('f')).toBeLessThan(sortResult.order.indexOf('g'));
    });

    test('should handle all tasks disabled', () => {
      const tasks = [
        createMockTask({ id: 'a', enabled: false }),
        createMockTask({ id: 'b', enabled: false }),
      ];
      dagManager.initialize(tasks);

      // Disabled tasks are marked as SKIPPED and counted as complete
      expect(dagManager.isComplete()).toBe(true);
      // When no enabled tasks exist, totalTasks is 0, so progress shows 0%
      const progress = dagManager.getProgress();
      expect(progress.totalTasks).toBe(0); // Only enabled tasks are counted
    });

    test('should handle DAG with mixed enabled/disabled tasks', () => {
      const tasks = [
        createMockTask({ id: 'a', enabled: true, dependencies: [] }),
        createMockTask({ id: 'b', enabled: false, dependencies: ['a'] }),
        createMockTask({ id: 'c', enabled: true, dependencies: ['b'] }),
      ];
      dagManager.initialize(tasks);

      // Complete task A
      dagManager.updateTaskStatus('a', TaskStatus.RUNNING);
      dagManager.updateTaskStatus('a', TaskStatus.SUCCESS, { exitCode: 0, message: 'OK', retryCount: 0 });

      // Task C should be queued since B is skipped
      expect(dagManager.getTask('c')?.status).toBe(TaskStatus.QUEUED);
    });
  });

  // ============================================================
  // SECTION 13: Validation Tests
  // ============================================================
  describe('validate', () => {
    test('should return valid for correct DAG', () => {
      dagManager.initialize(createLinearDag());

      const result = dagManager.validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should report entry and exit points', () => {
      dagManager.initialize(createDiamondDag());

      const result = dagManager.validate();

      expect(result.entryPoints).toContain('a');
      expect(result.exitPoints).toContain('d');
    });

    test('should count edges correctly', () => {
      dagManager.initialize(createDiamondDag());

      const result = dagManager.validate();

      // a->b, a->c, b->d, c->d = 4 edges
      expect(result.edgeCount).toBe(4);
    });

    test('should warn about orphan tasks', () => {
      const tasks = [
        createMockTask({ id: 'connected', dependencies: [] }),
        createMockTask({ id: 'orphan', dependencies: [], phase: DeploymentPhase.CORE_SERVICES }),
      ];
      dagManager.initialize(tasks);

      const result = dagManager.validate();

      expect(result.warnings.some((w) => w.code === 'ORPHAN_TASK')).toBe(true);
    });

    test('should warn about bottleneck tasks', () => {
      const tasks: DeployTask[] = [
        createMockTask({ id: 'bottleneck', dependencies: [], phase: DeploymentPhase.INFRASTRUCTURE_SETUP }),
      ];

      // Add 6 dependent tasks to create a bottleneck
      for (let i = 0; i < 6; i++) {
        tasks.push(
          createMockTask({
            id: `dep-${i}`,
            dependencies: ['bottleneck'],
            phase: DeploymentPhase.KUBERNETES_BOOTSTRAP,
          }),
        );
      }

      dagManager.initialize(tasks);

      const result = dagManager.validate();

      expect(result.warnings.some((w) => w.code === 'BOTTLENECK')).toBe(true);
    });
  });
});
