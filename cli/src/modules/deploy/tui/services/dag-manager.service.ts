/**
 * DAG Manager Service
 *
 * Manages the Directed Acyclic Graph of deployment tasks, handling:
 * - Task dependency tracking and validation
 * - Topological sorting for execution order
 * - Status updates and cascade effects
 * - Progress tracking and ETA calculations
 * - Event emission for UI updates
 */

import { Injectable } from '@nestjs/common';
import {
  DeployTask,
  TaskStatus,
  TaskResult,
  TaskFilter,
  TaskSortOptions,
  TaskStatistics,
  TaskDependencyEdge,
  TaskType,
} from '../interfaces/task.interface';
import {
  IDAGManager,
  DAGManagerOptions,
  DEFAULT_DAG_OPTIONS,
  DAGValidationResult,
  DAGValidationError,
  DAGValidationWarning,
  DeploymentProgress,
  PhaseSummary,
  DAGGraph,
  DAGNode,
  DAGLevel,
  TopologicalSortOptions,
  TopologicalSortResult,
  DAGEvent,
  DAGEventCallback,
  DAGState,
} from '../interfaces/dag.interface';
import { DeploymentPhase, getPhaseName } from '../../../../interfaces/deployment.interface';

/**
 * DAG Manager Service implementation
 *
 * Provides comprehensive DAG management for deployment task orchestration
 * including validation, topological sorting, status tracking, and event emission.
 */
@Injectable()
export class DAGManagerService implements IDAGManager {
  private tasks: Map<string, DeployTask> = new Map();
  private options: DAGManagerOptions = { ...DEFAULT_DAG_OPTIONS };
  private topologicalOrder: string[] = [];
  private levels: string[][] = [];
  private criticalPath: string[] = [];
  private criticalPathDuration: number = 0;
  private startedAt: Date = new Date();
  private subscribers: Set<DAGEventCallback> = new Set();
  private initialized: boolean = false;

  constructor() {}

  /**
   * Initialize DAG with tasks
   */
  initialize(tasks: DeployTask[], options?: Partial<DAGManagerOptions>): void {
    // Merge options with defaults
    this.options = { ...DEFAULT_DAG_OPTIONS, ...options };
    this.tasks.clear();
    this.subscribers.clear();
    this.startedAt = new Date();

    // Store tasks and compute dependents
    for (const task of tasks) {
      // Initialize dependents array if not present
      const taskCopy: DeployTask = {
        ...task,
        dependents: [],
        status: this.shouldSkipTask(task) ? TaskStatus.SKIPPED : task.status,
      };
      this.tasks.set(task.id, taskCopy);
    }

    // Compute reverse dependencies (dependents)
    this.computeDependents();

    // Validate and compute topological order
    const validation = this.validate();
    if (!validation.valid) {
      const errors = validation.errors.map((e) => e.message).join('; ');
      throw new Error(`DAG validation failed: ${errors}`);
    }

    // Compute topological order and levels
    this.computeTopologicalOrder();
    this.computeLevels();
    this.computeCriticalPath();

    // Set initial task statuses
    this.initializeTaskStatuses();

    this.initialized = true;
    this.emit({ type: 'deployment:started', timestamp: new Date() });
  }

  /**
   * Check if task should be skipped based on options
   */
  private shouldSkipTask(task: DeployTask): boolean {
    if (!task.enabled) return true;
    if (this.options.skipPhases.includes(task.phase)) return true;
    if (task.service && this.options.skipServices.includes(task.service)) return true;
    return false;
  }

  /**
   * Compute dependents (reverse dependencies) for all tasks
   */
  private computeDependents(): void {
    const tasks = Array.from(this.tasks.values());
    for (const task of tasks) {
      for (const depId of task.dependencies) {
        const depTask = this.tasks.get(depId);
        if (depTask && !depTask.dependents.includes(task.id)) {
          depTask.dependents.push(task.id);
        }
      }
    }
  }

  /**
   * Initialize task statuses based on dependencies
   */
  private initializeTaskStatuses(): void {
    const tasks = Array.from(this.tasks.values());
    for (const task of tasks) {
      if (task.status === TaskStatus.SKIPPED) continue;

      if (task.dependencies.length === 0) {
        // No dependencies - ready to execute
        task.status = TaskStatus.QUEUED;
      } else {
        // Has dependencies - check if all are satisfied
        const allSatisfied = this.areDependenciesSatisfied(task.id);
        task.status = allSatisfied ? TaskStatus.QUEUED : TaskStatus.BLOCKED;
      }
    }
  }

  /**
   * Validate DAG structure (no cycles, valid dependencies)
   */
  validate(): DAGValidationResult {
    const errors: DAGValidationError[] = [];
    const warnings: DAGValidationWarning[] = [];
    const taskIds = new Set(this.tasks.keys());

    // Check for duplicate IDs (already handled by Map, but validate input)
    // Check for missing dependencies
    const allTasks = Array.from(this.tasks.values());
    for (const task of allTasks) {
      // Self-reference check
      if (task.dependencies.includes(task.id)) {
        errors.push({
          code: 'SELF_REFERENCE',
          message: `Task "${task.id}" references itself as a dependency`,
          taskIds: [task.id],
        });
      }

      // Missing dependency check
      for (const depId of task.dependencies) {
        if (!taskIds.has(depId)) {
          errors.push({
            code: 'MISSING_DEPENDENCY',
            message: `Task "${task.id}" depends on non-existent task "${depId}"`,
            taskIds: [task.id, depId],
          });
        }
      }

      // Phase order validation
      for (const depId of task.dependencies) {
        const depTask = this.tasks.get(depId);
        if (depTask && depTask.phase > task.phase) {
          errors.push({
            code: 'INVALID_PHASE_ORDER',
            message: `Task "${task.id}" (phase ${task.phase}) depends on task "${depId}" (phase ${depTask.phase}) which is in a later phase`,
            taskIds: [task.id, depId],
            context: { taskPhase: task.phase, depPhase: depTask.phase },
          });
        }
      }
    }

    // Cycle detection using DFS
    const cycleNodes = this.detectCycles();
    if (cycleNodes.length > 0) {
      errors.push({
        code: 'CYCLE_DETECTED',
        message: `Cycle detected in DAG involving tasks: ${cycleNodes.join(' -> ')}`,
        taskIds: cycleNodes,
      });
    }

    // Find entry and exit points
    const entryPoints: string[] = [];
    const exitPoints: string[] = [];

    for (const task of allTasks) {
      if (task.dependencies.length === 0) {
        entryPoints.push(task.id);
      }
      if (task.dependents.length === 0) {
        exitPoints.push(task.id);
      }
    }

    // Warning: orphan tasks (no dependencies AND no dependents, but not alone)
    if (this.tasks.size > 1) {
      for (const task of allTasks) {
        if (task.dependencies.length === 0 && task.dependents.length === 0) {
          warnings.push({
            code: 'ORPHAN_TASK',
            message: `Task "${task.id}" has no dependencies and no dependents`,
            taskIds: [task.id],
            suggestion: 'Consider adding dependencies or this task may run at any time',
          });
        }
      }
    }

    // Warning: long dependency chains
    const maxDepth = this.computeMaxDepth();
    if (maxDepth > 10) {
      warnings.push({
        code: 'LONG_CHAIN',
        message: `Dependency chain depth is ${maxDepth}, which may slow deployment`,
        taskIds: this.criticalPath,
        suggestion: 'Consider parallelizing some tasks to reduce chain length',
      });
    }

    // Warning: bottleneck detection (single task with many dependents)
    for (const task of allTasks) {
      if (task.dependents.length > 5) {
        warnings.push({
          code: 'BOTTLENECK',
          message: `Task "${task.id}" is a bottleneck with ${task.dependents.length} dependent tasks`,
          taskIds: [task.id, ...task.dependents],
          suggestion: 'This task may become a deployment bottleneck',
        });
      }
    }

    // Count edges
    let edgeCount = 0;
    for (const task of allTasks) {
      edgeCount += task.dependencies.length;
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      taskCount: this.tasks.size,
      edgeCount,
      maxDepth,
      entryPoints,
      exitPoints,
    };
  }

  /**
   * Detect cycles using DFS with coloring
   */
  private detectCycles(): string[] {
    const WHITE = 0; // Not visited
    const GRAY = 1; // In current DFS path
    const BLACK = 2; // Fully processed

    const color = new Map<string, number>();
    const parent = new Map<string, string | null>();

    const taskKeys = Array.from(this.tasks.keys());
    for (const id of taskKeys) {
      color.set(id, WHITE);
      parent.set(id, null);
    }

    const dfs = (nodeId: string): string[] | null => {
      color.set(nodeId, GRAY);

      const task = this.tasks.get(nodeId);
      if (!task) return null;

      for (const depId of task.dependencies) {
        if (color.get(depId) === GRAY) {
          // Found a cycle - reconstruct path
          const cycle: string[] = [depId, nodeId];
          let current = nodeId;
          while (parent.get(current) !== null && parent.get(current) !== depId) {
            current = parent.get(current)!;
            cycle.unshift(current);
          }
          return cycle;
        }

        if (color.get(depId) === WHITE) {
          parent.set(depId, nodeId);
          const result = dfs(depId);
          if (result) return result;
        }
      }

      color.set(nodeId, BLACK);
      return null;
    };

    for (const id of taskKeys) {
      if (color.get(id) === WHITE) {
        const cycle = dfs(id);
        if (cycle) return cycle;
      }
    }

    return [];
  }

  /**
   * Compute maximum depth of dependency chain
   */
  private computeMaxDepth(): number {
    const depths = new Map<string, number>();

    const getDepth = (taskId: string): number => {
      if (depths.has(taskId)) return depths.get(taskId)!;

      const task = this.tasks.get(taskId);
      if (!task || task.dependencies.length === 0) {
        depths.set(taskId, 0);
        return 0;
      }

      let maxDepDepth = 0;
      for (const depId of task.dependencies) {
        maxDepDepth = Math.max(maxDepDepth, getDepth(depId));
      }

      const depth = maxDepDepth + 1;
      depths.set(taskId, depth);
      return depth;
    };

    let maxDepth = 0;
    const allKeys = Array.from(this.tasks.keys());
    for (const id of allKeys) {
      maxDepth = Math.max(maxDepth, getDepth(id));
    }

    return maxDepth;
  }

  /**
   * Compute topological order using Kahn's algorithm
   */
  private computeTopologicalOrder(): void {
    const inDegree = new Map<string, number>();
    const queue: string[] = [];

    // Initialize in-degrees
    const tasksArray = Array.from(this.tasks.values());
    for (const task of tasksArray) {
      inDegree.set(task.id, task.dependencies.length);
      if (task.dependencies.length === 0) {
        queue.push(task.id);
      }
    }

    // Sort initial queue by priority and phase
    queue.sort((a, b) => this.compareTaskPriority(a, b));

    this.topologicalOrder = [];

    while (queue.length > 0) {
      const taskId = queue.shift()!;
      this.topologicalOrder.push(taskId);

      const task = this.tasks.get(taskId)!;
      for (const depId of task.dependents) {
        const newDegree = (inDegree.get(depId) || 0) - 1;
        inDegree.set(depId, newDegree);

        if (newDegree === 0) {
          queue.push(depId);
          // Re-sort queue to maintain priority ordering
          queue.sort((a, b) => this.compareTaskPriority(a, b));
        }
      }
    }
  }

  /**
   * Compare task priority for ordering
   */
  private compareTaskPriority(aId: string, bId: string): number {
    const a = this.tasks.get(aId)!;
    const b = this.tasks.get(bId)!;

    // First, compare by phase
    if (a.phase !== b.phase) {
      return a.phase - b.phase;
    }

    // Then by priority (lower number = higher priority)
    const aPriority = a.priority ?? 100;
    const bPriority = b.priority ?? 100;
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    // Then by name for stability
    return a.name.localeCompare(b.name);
  }

  /**
   * Compute execution levels (tasks that can run in parallel)
   */
  private computeLevels(): void {
    const levels: Map<number, string[]> = new Map();
    const taskLevel = new Map<string, number>();

    const getLevel = (taskId: string): number => {
      if (taskLevel.has(taskId)) return taskLevel.get(taskId)!;

      const task = this.tasks.get(taskId);
      if (!task || task.dependencies.length === 0) {
        taskLevel.set(taskId, 0);
        return 0;
      }

      let maxDepLevel = -1;
      for (const depId of task.dependencies) {
        maxDepLevel = Math.max(maxDepLevel, getLevel(depId));
      }

      const level = maxDepLevel + 1;
      taskLevel.set(taskId, level);
      return level;
    };

    // Compute level for each task
    const taskIdsForLevels = Array.from(this.tasks.keys());
    for (const id of taskIdsForLevels) {
      const level = getLevel(id);
      if (!levels.has(level)) {
        levels.set(level, []);
      }
      levels.get(level)!.push(id);
    }

    // Convert to array sorted by level
    this.levels = [];
    const sortedLevels = Array.from(levels.keys()).sort((a, b) => a - b);
    for (const level of sortedLevels) {
      const tasksAtLevel = levels.get(level)!;
      // Sort tasks within level by priority
      tasksAtLevel.sort((a, b) => this.compareTaskPriority(a, b));
      this.levels.push(tasksAtLevel);
    }
  }

  /**
   * Compute critical path (longest dependency chain by estimated duration)
   */
  private computeCriticalPath(): void {
    const longestPath = new Map<string, { duration: number; path: string[] }>();

    // Process in reverse topological order
    const reverseOrder = [...this.topologicalOrder].reverse();

    for (const taskId of reverseOrder) {
      const task = this.tasks.get(taskId)!;
      let maxChildPath = { duration: 0, path: [] as string[] };

      for (const depId of task.dependents) {
        const childPath = longestPath.get(depId);
        if (childPath && childPath.duration > maxChildPath.duration) {
          maxChildPath = childPath;
        }
      }

      longestPath.set(taskId, {
        duration: task.estimatedDuration + maxChildPath.duration,
        path: [taskId, ...maxChildPath.path],
      });
    }

    // Find the path starting from an entry point with maximum duration
    let maxPath = { duration: 0, path: [] as string[] };
    const tasksForCriticalPath = Array.from(this.tasks.values());
    for (const task of tasksForCriticalPath) {
      if (task.dependencies.length === 0) {
        const path = longestPath.get(task.id);
        if (path && path.duration > maxPath.duration) {
          maxPath = path;
        }
      }
    }

    this.criticalPath = maxPath.path;
    this.criticalPathDuration = maxPath.duration;
  }

  /**
   * Get all tasks in the DAG
   */
  getTasks(filter?: TaskFilter, sort?: TaskSortOptions): DeployTask[] {
    let tasks = Array.from(this.tasks.values());

    // Apply filters
    if (filter) {
      tasks = tasks.filter((task) => this.matchesFilter(task, filter));
    }

    // Apply sorting
    if (sort) {
      tasks = this.sortTasks(tasks, sort);
    }

    return tasks;
  }

  /**
   * Check if task matches filter criteria
   */
  private matchesFilter(task: DeployTask, filter: TaskFilter): boolean {
    if (filter.status !== undefined) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      if (!statuses.includes(task.status)) return false;
    }

    if (filter.type !== undefined) {
      const types = Array.isArray(filter.type) ? filter.type : [filter.type];
      if (!types.includes(task.type)) return false;
    }

    if (filter.phase !== undefined) {
      const phases = Array.isArray(filter.phase) ? filter.phase : [filter.phase];
      if (!phases.includes(task.phase)) return false;
    }

    if (filter.service !== undefined && task.service !== filter.service) {
      return false;
    }

    if (filter.namespace !== undefined && task.namespace !== filter.namespace) {
      return false;
    }

    if (filter.mandatory !== undefined && task.mandatory !== filter.mandatory) {
      return false;
    }

    if (filter.enabled !== undefined && task.enabled !== filter.enabled) {
      return false;
    }

    return true;
  }

  /**
   * Sort tasks by specified criteria
   */
  private sortTasks(tasks: DeployTask[], sort: TaskSortOptions): DeployTask[] {
    const multiplier = sort.direction === 'asc' ? 1 : -1;

    return tasks.sort((a, b) => {
      switch (sort.field) {
        case 'name':
          return multiplier * a.name.localeCompare(b.name);

        case 'phase':
          return multiplier * (a.phase - b.phase);

        case 'status':
          return multiplier * a.status.localeCompare(b.status);

        case 'priority':
          return multiplier * ((a.priority ?? 100) - (b.priority ?? 100));

        case 'startedAt': {
          const aStart = a.timing.startedAt?.getTime() ?? 0;
          const bStart = b.timing.startedAt?.getTime() ?? 0;
          return multiplier * (aStart - bStart);
        }

        case 'duration': {
          const aDuration = a.timing.durationMs ?? 0;
          const bDuration = b.timing.durationMs ?? 0;
          return multiplier * (aDuration - bDuration);
        }

        default:
          return 0;
      }
    });
  }

  /**
   * Get a single task by ID
   */
  getTask(taskId: string): DeployTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get tasks that are ready for execution
   */
  getReadyTasks(maxCount?: number): DeployTask[] {
    const readyTasks: DeployTask[] = [];

    // Find the minimum active phase
    const activePhase = this.getCurrentActivePhase();

    const tasksForReady = Array.from(this.tasks.values());
    for (const task of tasksForReady) {
      if (task.status !== TaskStatus.QUEUED) continue;
      if (!task.enabled) continue;

      // Respect phase boundaries - only return tasks from current or earlier phases
      if (task.phase > activePhase) continue;

      // Check if all dependencies are satisfied
      if (this.areDependenciesSatisfied(task.id)) {
        readyTasks.push(task);
      }
    }

    // Sort by priority
    readyTasks.sort((a, b) => this.compareTaskPriority(a.id, b.id));

    // Apply limit
    if (maxCount !== undefined && maxCount > 0) {
      return readyTasks.slice(0, maxCount);
    }

    return readyTasks;
  }

  /**
   * Get the current active phase (lowest phase with non-completed tasks)
   */
  private getCurrentActivePhase(): DeploymentPhase {
    let minActivePhase = DeploymentPhase.VERIFICATION;

    const tasksForPhase = Array.from(this.tasks.values());
    for (const task of tasksForPhase) {
      if (!task.enabled) continue;
      if (task.status === TaskStatus.SKIPPED) continue;
      if (task.status === TaskStatus.SUCCESS) continue;
      if (task.status === TaskStatus.CANCELLED) continue;

      if (task.phase < minActivePhase) {
        minActivePhase = task.phase;
      }
    }

    return minActivePhase;
  }

  /**
   * Check if all dependencies for a task are satisfied
   */
  private areDependenciesSatisfied(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    for (const depId of task.dependencies) {
      const depTask = this.tasks.get(depId);
      if (!depTask) return false;

      // Dependency is satisfied if it's completed successfully or skipped
      if (depTask.status !== TaskStatus.SUCCESS && depTask.status !== TaskStatus.SKIPPED) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get tasks that are currently running
   */
  getRunningTasks(): DeployTask[] {
    return Array.from(this.tasks.values()).filter((task) => task.status === TaskStatus.RUNNING);
  }

  /**
   * Get tasks blocked by dependencies
   */
  getBlockedTasks(): Array<{ task: DeployTask; blockedBy: string[] }> {
    const blocked: Array<{ task: DeployTask; blockedBy: string[] }> = [];

    const tasksForBlocked = Array.from(this.tasks.values());
    for (const task of tasksForBlocked) {
      if (task.status !== TaskStatus.BLOCKED) continue;

      const blockedBy: string[] = [];
      for (const depId of task.dependencies) {
        const depTask = this.tasks.get(depId);
        if (depTask && depTask.status !== TaskStatus.SUCCESS && depTask.status !== TaskStatus.SKIPPED) {
          blockedBy.push(depId);
        }
      }

      if (blockedBy.length > 0) {
        blocked.push({ task, blockedBy });
      }
    }

    return blocked;
  }

  /**
   * Update task status
   */
  updateTaskStatus(taskId: string, status: TaskStatus, result?: TaskResult): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task "${taskId}" not found`);
    }

    task.status = status;

    // Update timing information
    const now = new Date();
    switch (status) {
      case TaskStatus.QUEUED:
        task.timing.queuedAt = now;
        this.emit({ type: 'task:queued', taskId, timestamp: now });
        break;

      case TaskStatus.RUNNING:
        task.timing.startedAt = now;
        if (task.timing.queuedAt) {
          task.timing.waitDurationMs = now.getTime() - task.timing.queuedAt.getTime();
        }
        this.emit({ type: 'task:started', taskId, timestamp: now });
        break;

      case TaskStatus.SUCCESS:
        task.timing.completedAt = now;
        if (task.timing.startedAt) {
          task.timing.durationMs = now.getTime() - task.timing.startedAt.getTime();
        }
        if (result) task.result = result;
        this.emit({ type: 'task:completed', taskId, result: result!, timestamp: now });
        break;

      case TaskStatus.FAILED:
        task.timing.completedAt = now;
        if (task.timing.startedAt) {
          task.timing.durationMs = now.getTime() - task.timing.startedAt.getTime();
        }
        if (result) task.result = result;
        this.emit({ type: 'task:failed', taskId, result: result!, timestamp: now });
        break;

      case TaskStatus.SKIPPED:
        task.timing.completedAt = now;
        this.emit({ type: 'task:skipped', taskId, reason: result?.message || 'Skipped', timestamp: now });
        break;

      case TaskStatus.CANCELLED:
        task.timing.completedAt = now;
        this.emit({ type: 'task:cancelled', taskId, timestamp: now });
        break;
    }

    // Cascade status updates to dependents
    if (status === TaskStatus.SUCCESS || status === TaskStatus.SKIPPED) {
      this.cascadeUnblock(taskId);
    } else if (status === TaskStatus.FAILED && !this.options.continueOnError) {
      this.cascadeBlock(taskId);
    }

    // Check for phase completion
    this.checkPhaseCompletion(task.phase);

    // Emit progress update
    this.emit({ type: 'progress:updated', progress: this.getProgress(), timestamp: now });
  }

  /**
   * Cascade unblock dependents when a task completes
   */
  private cascadeUnblock(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    for (const depId of task.dependents) {
      const depTask = this.tasks.get(depId);
      if (!depTask) continue;
      if (depTask.status !== TaskStatus.BLOCKED) continue;

      // Check if all dependencies are now satisfied
      if (this.areDependenciesSatisfied(depId)) {
        depTask.status = TaskStatus.QUEUED;
        depTask.timing.queuedAt = new Date();
        this.emit({ type: 'task:queued', taskId: depId, timestamp: new Date() });
      }
    }
  }

  /**
   * Cascade block dependents when a task fails (if failFast or !continueOnError)
   */
  private cascadeBlock(taskId: string): void {
    const visited = new Set<string>();
    const queue = [taskId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const task = this.tasks.get(currentId);
      if (!task) continue;

      for (const depId of task.dependents) {
        const depTask = this.tasks.get(depId);
        if (!depTask) continue;

        if (depTask.status === TaskStatus.QUEUED || depTask.status === TaskStatus.BLOCKED) {
          depTask.status = TaskStatus.BLOCKED;
          queue.push(depId);
        }
      }
    }
  }

  /**
   * Check if a phase is complete and emit events
   */
  private checkPhaseCompletion(phase: DeploymentPhase): void {
    const phaseTasks = Array.from(this.tasks.values()).filter((t) => t.phase === phase && t.enabled);

    const allComplete = phaseTasks.every(
      (t) =>
        t.status === TaskStatus.SUCCESS ||
        t.status === TaskStatus.SKIPPED ||
        t.status === TaskStatus.FAILED ||
        t.status === TaskStatus.CANCELLED,
    );

    if (!allComplete) return;

    const hasFailed = phaseTasks.some((t) => t.status === TaskStatus.FAILED);

    if (hasFailed) {
      this.emit({ type: 'phase:failed', phase, timestamp: new Date() });
    } else {
      this.emit({ type: 'phase:completed', phase, timestamp: new Date() });
    }

    // Check overall deployment completion
    this.checkDeploymentCompletion();
  }

  /**
   * Check if overall deployment is complete
   */
  private checkDeploymentCompletion(): void {
    const allComplete = Array.from(this.tasks.values())
      .filter((t) => t.enabled)
      .every(
        (t) =>
          t.status === TaskStatus.SUCCESS ||
          t.status === TaskStatus.SKIPPED ||
          t.status === TaskStatus.FAILED ||
          t.status === TaskStatus.CANCELLED,
      );

    if (!allComplete) return;

    const hasFailed = Array.from(this.tasks.values()).some(
      (t) => t.enabled && t.status === TaskStatus.FAILED,
    );

    if (hasFailed) {
      this.emit({
        type: 'deployment:failed',
        reason: 'One or more tasks failed',
        timestamp: new Date(),
      });
    } else {
      this.emit({ type: 'deployment:completed', timestamp: new Date() });
    }
  }

  /**
   * Get current deployment progress
   */
  getProgress(): DeploymentProgress {
    let totalTasks = 0;
    let completedTasks = 0;
    let failedTasks = 0;
    let skippedTasks = 0;
    let runningTasks = 0;
    let queuedTasks = 0;
    let blockedTasks = 0;
    let pendingTasks = 0;
    let cancelledTasks = 0;

    const tasksForProgress = Array.from(this.tasks.values());
    for (const task of tasksForProgress) {
      if (!task.enabled) continue;
      totalTasks++;

      switch (task.status) {
        case TaskStatus.SUCCESS:
          completedTasks++;
          break;
        case TaskStatus.FAILED:
          failedTasks++;
          break;
        case TaskStatus.SKIPPED:
          skippedTasks++;
          break;
        case TaskStatus.RUNNING:
          runningTasks++;
          break;
        case TaskStatus.QUEUED:
          queuedTasks++;
          break;
        case TaskStatus.BLOCKED:
          blockedTasks++;
          break;
        case TaskStatus.PENDING:
          pendingTasks++;
          break;
        case TaskStatus.CANCELLED:
          cancelledTasks++;
          break;
      }
    }

    const finishedTasks = completedTasks + failedTasks + skippedTasks + cancelledTasks;
    const progressPercent = totalTasks > 0 ? Math.round((finishedTasks / totalTasks) * 100) : 0;

    const elapsedMs = Date.now() - this.startedAt.getTime();
    const estimatedRemainingSeconds = this.estimateRemainingTime();

    const currentPhase = this.getCurrentActivePhase();
    const phases = this.getPhaseSummaries();

    // Determine overall status
    let status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
    if (finishedTasks === totalTasks) {
      status = failedTasks > 0 ? 'failed' : 'completed';
    } else if (runningTasks > 0) {
      status = 'running';
    } else if (queuedTasks > 0) {
      status = 'running';
    } else {
      status = 'pending';
    }

    // Find last error
    let lastError: string | undefined;
    let lastFailedTask: string | undefined;
    for (const task of tasksForProgress) {
      if (task.status === TaskStatus.FAILED && task.result?.error) {
        lastError = task.result.error;
        lastFailedTask = task.id;
      }
    }

    return {
      totalTasks,
      completedTasks,
      failedTasks,
      skippedTasks,
      runningTasks,
      queuedTasks,
      blockedTasks,
      pendingTasks,
      cancelledTasks,
      progressPercent,
      currentPhase,
      phases,
      startedAt: this.startedAt,
      completedAt: status === 'completed' || status === 'failed' ? new Date() : undefined,
      elapsedMs,
      estimatedRemainingSeconds,
      status,
      lastError,
      lastFailedTask,
    };
  }

  /**
   * Estimate remaining time based on completed tasks
   */
  private estimateRemainingTime(): number {
    const tasks = Array.from(this.tasks.values()).filter((t) => t.enabled);

    // Sum up estimated durations of remaining tasks
    let remainingDuration = 0;
    for (const task of tasks) {
      if (
        task.status === TaskStatus.QUEUED ||
        task.status === TaskStatus.BLOCKED ||
        task.status === TaskStatus.PENDING
      ) {
        remainingDuration += task.estimatedDuration;
      } else if (task.status === TaskStatus.RUNNING && task.timing.startedAt) {
        // Estimate remaining time for running task
        const elapsed = (Date.now() - task.timing.startedAt.getTime()) / 1000;
        const remaining = Math.max(0, task.estimatedDuration - elapsed);
        remainingDuration += remaining;
      }
    }

    // Adjust for parallelism
    const parallelFactor = Math.max(1, this.options.maxParallel);
    return Math.ceil(remainingDuration / parallelFactor);
  }

  /**
   * Get phase summaries
   */
  getPhaseSummaries(): PhaseSummary[] {
    const phaseMap = new Map<DeploymentPhase, PhaseSummary>();

    // Initialize all phases
    const allPhases = [
      DeploymentPhase.INFRASTRUCTURE_SETUP,
      DeploymentPhase.KUBERNETES_BOOTSTRAP,
      DeploymentPhase.STORAGE_LAYER,
      DeploymentPhase.BACKUP_SETUP,
      DeploymentPhase.CORE_SERVICES,
      DeploymentPhase.DATABASES,
      DeploymentPhase.APPLICATION_SERVICES,
      DeploymentPhase.NETWORK_GATEWAY,
      DeploymentPhase.VERIFICATION,
    ];

    for (const phase of allPhases) {
      phaseMap.set(phase, {
        phase,
        name: getPhaseName(phase),
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        skippedTasks: 0,
        runningTasks: 0,
        queuedTasks: 0,
        blockedTasks: 0,
        status: 'pending',
      });
    }

    // Aggregate task data
    const tasksForPhaseSummary = Array.from(this.tasks.values());
    for (const task of tasksForPhaseSummary) {
      if (!task.enabled) continue;

      const summary = phaseMap.get(task.phase);
      if (!summary) continue;

      summary.totalTasks++;

      switch (task.status) {
        case TaskStatus.SUCCESS:
          summary.completedTasks++;
          break;
        case TaskStatus.FAILED:
          summary.failedTasks++;
          break;
        case TaskStatus.SKIPPED:
          summary.skippedTasks++;
          break;
        case TaskStatus.RUNNING:
          summary.runningTasks++;
          if (!summary.startedAt) {
            summary.startedAt = task.timing.startedAt;
          }
          break;
        case TaskStatus.QUEUED:
          summary.queuedTasks++;
          break;
        case TaskStatus.BLOCKED:
          summary.blockedTasks++;
          break;
      }

      // Track timing
      if (task.timing.startedAt && (!summary.startedAt || task.timing.startedAt < summary.startedAt)) {
        summary.startedAt = task.timing.startedAt;
      }
      if (task.timing.completedAt && (!summary.completedAt || task.timing.completedAt > summary.completedAt)) {
        summary.completedAt = task.timing.completedAt;
      }
    }

    // Determine phase status and duration
    const phaseSummaryValues = Array.from(phaseMap.values());
    for (const summary of phaseSummaryValues) {
      if (summary.totalTasks === 0) {
        summary.status = 'skipped';
        continue;
      }

      const finishedTasks = summary.completedTasks + summary.failedTasks + summary.skippedTasks;

      if (finishedTasks === summary.totalTasks) {
        summary.status = summary.failedTasks > 0 ? 'failed' : 'completed';
        if (summary.startedAt && summary.completedAt) {
          summary.durationMs = summary.completedAt.getTime() - summary.startedAt.getTime();
        }
      } else if (summary.runningTasks > 0 || summary.queuedTasks > 0) {
        summary.status = 'running';
        // Estimate remaining time
        let remaining = 0;
        for (const task of tasksForPhaseSummary) {
          if (
            task.phase === summary.phase &&
            task.enabled &&
            (task.status === TaskStatus.QUEUED ||
              task.status === TaskStatus.BLOCKED ||
              task.status === TaskStatus.RUNNING)
          ) {
            remaining += task.estimatedDuration;
          }
        }
        summary.estimatedRemainingSeconds = Math.ceil(remaining / this.options.maxParallel);
      } else {
        summary.status = 'pending';
      }
    }

    return Array.from(phaseMap.values()).filter((s) => s.totalTasks > 0);
  }

  /**
   * Get summary for a specific phase
   */
  getPhaseSummary(phase: DeploymentPhase): PhaseSummary {
    const summaries = this.getPhaseSummaries();
    const summary = summaries.find((s) => s.phase === phase);

    if (summary) return summary;

    // Return empty summary if phase has no tasks
    return {
      phase,
      name: getPhaseName(phase),
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      skippedTasks: 0,
      runningTasks: 0,
      queuedTasks: 0,
      blockedTasks: 0,
      status: 'skipped',
    };
  }

  /**
   * Get task statistics
   */
  getStatistics(): TaskStatistics {
    const byStatus: Record<TaskStatus, number> = {
      [TaskStatus.PENDING]: 0,
      [TaskStatus.BLOCKED]: 0,
      [TaskStatus.QUEUED]: 0,
      [TaskStatus.RUNNING]: 0,
      [TaskStatus.SUCCESS]: 0,
      [TaskStatus.FAILED]: 0,
      [TaskStatus.SKIPPED]: 0,
      [TaskStatus.CANCELLED]: 0,
    };

    const byType: Record<TaskType, number> = {
      [TaskType.ANSIBLE]: 0,
      [TaskType.HELMFILE]: 0,
      [TaskType.KUBECTL]: 0,
      [TaskType.SHELL]: 0,
      [TaskType.VALIDATION]: 0,
      [TaskType.COMPOSITE]: 0,
    };

    const byPhase: Record<DeploymentPhase, number> = {
      [DeploymentPhase.INFRASTRUCTURE_SETUP]: 0,
      [DeploymentPhase.KUBERNETES_BOOTSTRAP]: 0,
      [DeploymentPhase.STORAGE_LAYER]: 0,
      [DeploymentPhase.BACKUP_SETUP]: 0,
      [DeploymentPhase.CORE_SERVICES]: 0,
      [DeploymentPhase.DATABASES]: 0,
      [DeploymentPhase.APPLICATION_SERVICES]: 0,
      [DeploymentPhase.NETWORK_GATEWAY]: 0,
      [DeploymentPhase.VERIFICATION]: 0,
    };

    let totalEstimatedDuration = 0;
    let totalActualDuration = 0;
    let durationCount = 0;
    let failedCount = 0;
    let retriedCount = 0;

    const tasksForStats = Array.from(this.tasks.values());
    for (const task of tasksForStats) {
      byStatus[task.status]++;
      byType[task.type]++;
      byPhase[task.phase]++;

      totalEstimatedDuration += task.estimatedDuration;

      if (task.timing.durationMs) {
        totalActualDuration += task.timing.durationMs;
        durationCount++;
      }

      if (task.status === TaskStatus.FAILED) {
        failedCount++;
      }

      if ((task.retryAttempt ?? 0) > 0) {
        retriedCount++;
      }
    }

    return {
      total: this.tasks.size,
      byStatus,
      byType,
      byPhase,
      totalEstimatedDuration,
      totalActualDuration,
      averageDuration: durationCount > 0 ? totalActualDuration / durationCount : 0,
      failedCount,
      retriedCount,
    };
  }

  /**
   * Get dependency edges for visualization
   */
  getDependencyEdges(): TaskDependencyEdge[] {
    const edges: TaskDependencyEdge[] = [];

    const tasksForEdges = Array.from(this.tasks.values());
    for (const task of tasksForEdges) {
      for (const depId of task.dependencies) {
        const depTask = this.tasks.get(depId);
        const satisfied =
          depTask?.status === TaskStatus.SUCCESS || depTask?.status === TaskStatus.SKIPPED;
        const blocking = !satisfied && task.status === TaskStatus.BLOCKED;

        edges.push({
          from: depId,
          to: task.id,
          satisfied,
          blocking,
        });
      }
    }

    return edges;
  }

  /**
   * Get DAG graph structure for visualization
   */
  getGraph(): DAGGraph {
    const nodes: DAGNode[] = [];
    const edges = this.getDependencyEdges();
    const taskLevels = new Map<string, number>();

    // Compute levels
    let levelIndex = 0;
    for (const levelTasks of this.levels) {
      for (const taskId of levelTasks) {
        taskLevels.set(taskId, levelIndex);
      }
      levelIndex++;
    }

    // Create nodes with positions
    let xOffset = 0;
    for (let i = 0; i < this.levels.length; i++) {
      const levelTasks = this.levels[i];
      xOffset = 0;

      for (const taskId of levelTasks) {
        const task = this.tasks.get(taskId)!;
        nodes.push({
          id: task.id,
          label: task.name,
          status: task.status,
          x: xOffset,
          y: i,
          width: Math.max(task.name.length * 8, 100),
          selected: false,
          highlighted: this.criticalPath.includes(task.id),
        });
        xOffset += 1;
      }
    }

    // Create levels structure
    const dagLevels: DAGLevel[] = this.levels.map((tasks, index) => {
      const phasesInLevel = new Set(
        tasks.map((id) => this.tasks.get(id)?.phase).filter((p) => p !== undefined),
      );
      const phase = phasesInLevel.size === 1 ? Array.from(phasesInLevel)[0] : undefined;

      return {
        index,
        tasks,
        phase,
        canParallelize: tasks.length > 1,
      };
    });

    // Calculate width and depth
    const width = Math.max(...this.levels.map((l) => l.length), 0);
    const depth = this.levels.length;

    return {
      nodes,
      edges,
      width,
      depth,
      levels: dagLevels,
    };
  }

  /**
   * Get topological sort of tasks
   */
  getTopologicalSort(options?: TopologicalSortOptions): TopologicalSortResult {
    let order = [...this.topologicalOrder];

    if (options?.groupByPhase) {
      // Group by phase while maintaining topological order within each phase
      const phaseGroups = new Map<DeploymentPhase, string[]>();

      for (const taskId of order) {
        const task = this.tasks.get(taskId)!;
        if (!phaseGroups.has(task.phase)) {
          phaseGroups.set(task.phase, []);
        }
        phaseGroups.get(task.phase)!.push(taskId);
      }

      order = [];
      const sortedPhases = Array.from(phaseGroups.keys()).sort((a, b) => a - b);
      for (const phase of sortedPhases) {
        order.push(...phaseGroups.get(phase)!);
      }
    }

    if (options?.respectPriority) {
      // Already sorted by priority in computeTopologicalOrder
    }

    return {
      order,
      levels: this.levels,
      criticalPath: this.criticalPath,
      criticalPathDuration: this.criticalPathDuration,
    };
  }

  /**
   * Get critical path (longest dependency chain)
   */
  getCriticalPath(): string[] {
    return [...this.criticalPath];
  }

  /**
   * Check if deployment is complete
   */
  isComplete(): boolean {
    return Array.from(this.tasks.values())
      .filter((t) => t.enabled)
      .every(
        (t) =>
          t.status === TaskStatus.SUCCESS ||
          t.status === TaskStatus.SKIPPED ||
          t.status === TaskStatus.FAILED ||
          t.status === TaskStatus.CANCELLED,
      );
  }

  /**
   * Check if deployment has failures
   */
  hasFailed(): boolean {
    return Array.from(this.tasks.values()).some(
      (t) => t.enabled && t.status === TaskStatus.FAILED,
    );
  }

  /**
   * Check if a task can be executed
   */
  canExecute(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    if (!task.enabled) return false;
    if (task.status !== TaskStatus.QUEUED) return false;

    return this.areDependenciesSatisfied(taskId);
  }

  /**
   * Skip a task and update dependents
   */
  skipTask(taskId: string, reason: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task "${taskId}" not found`);
    }

    if (task.status === TaskStatus.RUNNING) {
      throw new Error(`Cannot skip running task "${taskId}"`);
    }

    task.status = TaskStatus.SKIPPED;
    task.timing.completedAt = new Date();
    task.result = {
      exitCode: 0,
      message: reason,
      retryCount: 0,
    };

    this.emit({ type: 'task:skipped', taskId, reason, timestamp: new Date() });

    // Cascade unblock dependents
    this.cascadeUnblock(taskId);

    // Check phase completion
    this.checkPhaseCompletion(task.phase);
  }

  /**
   * Retry a failed task
   */
  retryTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    if (task.status !== TaskStatus.FAILED) return false;

    const maxRetries = task.maxRetries ?? this.options.maxRetries;
    const currentAttempt = task.retryAttempt ?? 0;

    if (currentAttempt >= maxRetries) {
      return false;
    }

    task.retryAttempt = currentAttempt + 1;
    task.status = TaskStatus.QUEUED;
    task.timing = { queuedAt: new Date() };
    task.result = undefined;
    task.logs = [];

    this.emit({
      type: 'task:retrying',
      taskId,
      attempt: task.retryAttempt,
      maxRetries,
      timestamp: new Date(),
    });

    return true;
  }

  /**
   * Cancel a task
   */
  cancelTask(taskId: string, cascade?: boolean): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task "${taskId}" not found`);
    }

    if (
      task.status === TaskStatus.SUCCESS ||
      task.status === TaskStatus.FAILED ||
      task.status === TaskStatus.CANCELLED
    ) {
      return; // Already completed or cancelled
    }

    task.status = TaskStatus.CANCELLED;
    task.timing.completedAt = new Date();

    this.emit({ type: 'task:cancelled', taskId, timestamp: new Date() });

    if (cascade) {
      // Cancel all dependent tasks
      const visited = new Set<string>();
      const queue = [...task.dependents];

      while (queue.length > 0) {
        const depId = queue.shift()!;
        if (visited.has(depId)) continue;
        visited.add(depId);

        const depTask = this.tasks.get(depId);
        if (!depTask) continue;

        if (
          depTask.status !== TaskStatus.SUCCESS &&
          depTask.status !== TaskStatus.FAILED &&
          depTask.status !== TaskStatus.CANCELLED
        ) {
          depTask.status = TaskStatus.CANCELLED;
          depTask.timing.completedAt = new Date();
          this.emit({ type: 'task:cancelled', taskId: depId, timestamp: new Date() });
          queue.push(...depTask.dependents);
        }
      }
    }

    this.checkPhaseCompletion(task.phase);
  }

  /**
   * Enable or disable a task
   */
  setTaskEnabled(taskId: string, enabled: boolean): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task "${taskId}" not found`);
    }

    const wasEnabled = task.enabled;
    task.enabled = enabled;

    if (wasEnabled && !enabled) {
      // Task was disabled
      if (task.status === TaskStatus.QUEUED || task.status === TaskStatus.BLOCKED) {
        task.status = TaskStatus.SKIPPED;
        this.cascadeUnblock(taskId);
      }
    } else if (!wasEnabled && enabled) {
      // Task was enabled
      if (this.areDependenciesSatisfied(taskId)) {
        task.status = TaskStatus.QUEUED;
      } else {
        task.status = TaskStatus.BLOCKED;
      }
    }
  }

  /**
   * Subscribe to DAG events
   */
  subscribe(callback: DAGEventCallback): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Emit an event to all subscribers
   */
  private emit(event: DAGEvent): void {
    const subscriberArray = Array.from(this.subscribers);
    for (const callback of subscriberArray) {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in DAG event subscriber:', error);
      }
    }
  }

  /**
   * Reset DAG to initial state
   */
  reset(): void {
    const tasksForReset = Array.from(this.tasks.values());
    for (const task of tasksForReset) {
      task.status = TaskStatus.PENDING;
      task.timing = {};
      task.result = undefined;
      task.logs = [];
      task.retryAttempt = undefined;
    }

    this.initializeTaskStatuses();
    this.startedAt = new Date();
  }

  /**
   * Export DAG state for persistence
   */
  exportState(): DAGState {
    return {
      version: '1.0.0',
      tasks: Array.from(this.tasks.values()),
      options: { ...this.options },
      progress: this.getProgress(),
      createdAt: this.startedAt,
      updatedAt: new Date(),
    };
  }

  /**
   * Import DAG state from persistence
   */
  importState(state: DAGState): void {
    if (state.version !== '1.0.0') {
      throw new Error(`Unsupported DAG state version: ${state.version}`);
    }

    this.options = { ...state.options };
    this.tasks.clear();

    for (const task of state.tasks) {
      this.tasks.set(task.id, { ...task });
    }

    this.startedAt = new Date(state.createdAt);

    // Recompute graph structures
    this.computeDependents();
    this.computeTopologicalOrder();
    this.computeLevels();
    this.computeCriticalPath();

    this.initialized = true;
  }
}
