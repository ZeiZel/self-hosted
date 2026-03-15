/**
 * Deploy TUI Service
 *
 * Main orchestration service for the deployment TUI.
 * Coordinates between:
 * - TaskBuilderService: Creates the DAG of deployment tasks
 * - DAGManagerService: Manages task dependencies and status
 * - TaskExecutorService: Executes tasks in parallel
 * - Ink/React: Renders the TUI components
 */

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'events';
import { Subscription } from 'rxjs';
import React from 'react';
import { render, Instance } from 'ink';

import { DAGManagerService } from './dag-manager.service';
import { TaskExecutorService } from './task-executor.service';
import { TaskBuilderService } from './task-builder.service';
import { DeployApp } from '../components/DeployApp';
import {
  DeployTUIState,
  createInitialTUIState,
  TaskStatus,
  TaskResult,
  LogLine,
  LogLevel,
  DAGEvent,
  TaskEvent,
} from '../interfaces';
import { findRepoRoot, getRepoPaths } from '../../../../utils/paths';

/**
 * Options for TUI deployment
 */
export interface TUIDeployOptions {
  /** Run in dry-run mode (no actual changes) */
  dryRun: boolean;
  /** Bypass confirmation prompts */
  bypassPermissions: boolean;
  /** Enable local access configuration */
  enableLocalAccess: boolean;
  /** Local domain suffix */
  localDomain: string;
  /** Maximum parallel tasks */
  maxParallel?: number;
  /** Skip specific phases */
  skipPhases?: number[];
  /** Skip specific services */
  skipServices?: string[];
  /** Inventory file to use */
  inventoryFile?: string;
}

/**
 * TUI deployment events
 */
export type DeployTuiEvent =
  | { type: 'started'; timestamp: Date }
  | { type: 'paused'; timestamp: Date }
  | { type: 'resumed'; timestamp: Date }
  | { type: 'completed'; success: boolean; timestamp: Date }
  | { type: 'aborted'; timestamp: Date }
  | { type: 'error'; error: string; timestamp: Date };

/**
 * Deploy TUI Service
 *
 * Provides the main entry point for running the deployment TUI.
 */
@Injectable()
export class DeployTuiService implements OnModuleDestroy {
  private inkInstance: Instance | null = null;
  private isRunning = false;
  private isPaused = false;
  private executionLoopPromise: Promise<void> | null = null;
  private subscriptions: Subscription[] = [];
  private eventEmitter = new EventEmitter();
  private abortController: AbortController | null = null;
  private state: DeployTUIState | null = null;
  private stateUpdateCallbacks: Set<(state: DeployTUIState) => void> = new Set();

  constructor(
    private dagManager: DAGManagerService,
    private executor: TaskExecutorService,
    private taskBuilder: TaskBuilderService,
  ) {}

  /**
   * Cleanup on module destroy
   */
  onModuleDestroy(): void {
    this.cleanup();
  }

  /**
   * Start the deployment TUI
   */
  async start(options: TUIDeployOptions): Promise<void> {
    if (this.isRunning) {
      throw new Error('Deployment TUI is already running');
    }

    this.isRunning = true;
    this.isPaused = false;
    this.abortController = new AbortController();

    try {
      // Get repository paths
      const repoRoot = findRepoRoot();
      if (!repoRoot) {
        throw new Error('Could not find repository root. Are you in the self-hosted directory?');
      }
      const paths = getRepoPaths(repoRoot);

      // Configure executor
      this.executor.updateOptions({
        dryRun: options.dryRun,
        ansiblePath: paths.ansible,
        kubernetesPath: paths.kubernetes,
        helmfilePath: paths.kubernetes,
        inventoryFile: options.inventoryFile || 'inventory/hosts.ini',
        vaultPasswordFile: '~/.ansible_vault_password',
        maxParallel: options.maxParallel || 3,
      });

      // Build task graph
      const tasks = this.taskBuilder.buildTaskGraph();

      // Initialize DAG
      this.dagManager.initialize(tasks, {
        maxParallel: options.maxParallel || 3,
        skipPhases: options.skipPhases || [],
        skipServices: options.skipServices || [],
        dryRun: options.dryRun,
        continueOnError: true,
        autoRetry: false,
        maxRetries: 2,
        retryDelayMs: 5000,
        failFast: false,
      });

      // Subscribe to DAG events
      const dagUnsubscribe = this.dagManager.subscribe((event) => {
        this.handleDAGEvent(event);
      });

      // Create initial state
      this.state = createInitialTUIState();
      this.state.tasks = this.dagManager.getTasks();
      this.state.progress = this.dagManager.getProgress();
      this.state.phases = this.dagManager.getPhaseSummaries();
      this.state.initialized = true;
      this.state.connectionStatus = 'connected';

      // Emit started event
      this.emitEvent({ type: 'started', timestamp: new Date() });

      // Start execution loop
      this.executionLoopPromise = this.startExecutionLoop();

      // Render TUI
      this.inkInstance = render(
        React.createElement(DeployApp, {
          initialState: this.state,
          onAbort: () => this.abort(),
          onPauseToggle: () => this.togglePause(),
          onRetryTask: (id) => this.retryTask(id),
          onSkipTask: (id) => this.skipTask(id),
          onCancelTask: (id) => this.cancelTask(id),
          onStateChange: (newState) => this.handleStateChange(newState),
        }),
      );

      // Wait for TUI to exit
      await this.inkInstance.waitUntilExit();

      // Wait for execution loop to finish
      if (this.executionLoopPromise) {
        await this.executionLoopPromise;
      }

      // Cleanup
      dagUnsubscribe();
    } finally {
      this.cleanup();
    }
  }

  /**
   * Start the main execution loop
   */
  private async startExecutionLoop(): Promise<void> {
    const addLog = (message: string, level: LogLevel = LogLevel.INFO): void => {
      if (!this.state) return;

      const log: LogLine = {
        timestamp: new Date(),
        level,
        message,
        source: 'system',
        taskId: 'system',
      };

      this.state.logs.push(log);
      this.notifyStateUpdate();
    };

    addLog('Starting deployment execution loop');

    while (this.isRunning && !this.dagManager.isComplete()) {
      // Check for abort
      if (this.abortController?.signal.aborted) {
        addLog('Deployment aborted', LogLevel.WARN);
        break;
      }

      // Check for pause
      if (this.isPaused) {
        await this.sleep(500);
        continue;
      }

      // Check if executor can accept more tasks
      if (!this.executor.canAcceptMore()) {
        await this.sleep(100);
        continue;
      }

      // Get ready tasks
      const maxTasks = this.executor.getOptions().maxParallel - this.executor.getRunningCount();
      const readyTasks = this.dagManager.getReadyTasks(maxTasks);

      if (readyTasks.length === 0) {
        // No tasks ready, check if we're blocked or done
        const runningTasks = this.dagManager.getRunningTasks();
        if (runningTasks.length === 0) {
          // No running tasks and no ready tasks - might be done or blocked
          const blockedTasks = this.dagManager.getBlockedTasks();
          if (blockedTasks.length > 0 && !this.dagManager.hasFailed()) {
            // We have blocked tasks but nothing is running - something is wrong
            addLog(
              `Warning: ${blockedTasks.length} tasks blocked with no running tasks`,
              LogLevel.WARN,
            );
          }
        }
        await this.sleep(100);
        continue;
      }

      // Execute each ready task
      for (const task of readyTasks) {
        if (!this.executor.canAcceptMore()) break;

        addLog(`Starting task: ${task.name}`);

        // Update task status to running
        this.dagManager.updateTaskStatus(task.id, TaskStatus.RUNNING);

        // Execute task
        const subscription = this.executor.execute(task).subscribe({
          next: (event) => this.handleTaskEvent(event),
          error: (error) => {
            const errorMessage = error instanceof Error ? error.message : String(error);
            addLog(`Task ${task.name} error: ${errorMessage}`, LogLevel.ERROR);

            const result: TaskResult = {
              exitCode: 1,
              message: 'Execution error',
              error: errorMessage,
              retryCount: task.retryAttempt || 0,
            };

            this.dagManager.updateTaskStatus(task.id, TaskStatus.FAILED, result);
          },
          complete: () => {
            // Task completed
          },
        });

        this.subscriptions.push(subscription);
      }

      await this.sleep(100);
    }

    // Deployment complete
    if (this.dagManager.isComplete()) {
      const hasFailed = this.dagManager.hasFailed();
      addLog(
        hasFailed ? 'Deployment completed with failures' : 'Deployment completed successfully',
        hasFailed ? LogLevel.WARN : LogLevel.INFO,
      );
      this.emitEvent({ type: 'completed', success: !hasFailed, timestamp: new Date() });
    }
  }

  /**
   * Handle DAG events
   */
  private handleDAGEvent(event: DAGEvent): void {
    if (!this.state) return;

    // Update state based on event
    this.state.progress = this.dagManager.getProgress();
    this.state.tasks = this.dagManager.getTasks();
    this.state.phases = this.dagManager.getPhaseSummaries();
    this.state.lastUpdate = new Date();

    // Handle specific events
    switch (event.type) {
      case 'task:started': {
        const task = this.dagManager.getTask(event.taskId);
        if (task) {
          this.state.currentTask = task;
        }
        break;
      }

      case 'task:completed':
      case 'task:failed':
      case 'task:skipped':
      case 'task:cancelled': {
        // Clear current task if it matches
        if (this.state.currentTask?.id === event.taskId) {
          // Set to next running task
          const runningTasks = this.dagManager.getRunningTasks();
          this.state.currentTask = runningTasks.length > 0 ? runningTasks[0] : null;
        }
        break;
      }

      case 'deployment:failed':
        this.state.error = event.reason;
        break;

      case 'deployment:completed':
        this.state.progress.status = 'completed';
        break;
    }

    this.notifyStateUpdate();
  }

  /**
   * Handle task execution events
   */
  private handleTaskEvent(event: TaskEvent): void {
    if (!this.state) return;

    switch (event.type) {
      case 'log':
        this.state.logs.push(event.log);
        // Keep logs bounded
        if (this.state.logs.length > 10000) {
          this.state.logs = this.state.logs.slice(-8000);
        }
        break;

      case 'completed':
        this.dagManager.updateTaskStatus(event.taskId, TaskStatus.SUCCESS, event.result);
        break;

      case 'failed':
        this.dagManager.updateTaskStatus(event.taskId, TaskStatus.FAILED, event.result);
        break;

      case 'cancelled':
        this.dagManager.updateTaskStatus(event.taskId, TaskStatus.CANCELLED);
        break;

      case 'retrying':
        // Log retry attempt
        this.state.logs.push({
          timestamp: new Date(),
          level: LogLevel.WARN,
          message: `Retrying task: ${event.reason} (attempt ${event.attempt})`,
          source: 'system',
          taskId: event.taskId,
        });
        break;
    }

    this.notifyStateUpdate();
  }

  /**
   * Handle state change from TUI
   */
  private handleStateChange(newState: DeployTUIState): void {
    this.state = newState;
  }

  /**
   * Notify state update callbacks
   */
  private notifyStateUpdate(): void {
    if (!this.state) return;

    for (const callback of this.stateUpdateCallbacks) {
      try {
        callback(this.state);
      } catch {
        // Ignore callback errors
      }
    }
  }

  /**
   * Toggle pause state
   */
  togglePause(): void {
    this.isPaused = !this.isPaused;

    if (this.state) {
      this.state.paused = this.isPaused;
      this.state.progress.status = this.isPaused ? 'paused' : 'running';
      this.notifyStateUpdate();
    }

    this.emitEvent({
      type: this.isPaused ? 'paused' : 'resumed',
      timestamp: new Date(),
    });
  }

  /**
   * Abort deployment
   */
  async abort(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
    }

    // Cancel all running tasks
    this.executor.cancelAll();

    // Update state
    if (this.state) {
      this.state.progress.status = 'cancelled';
      this.notifyStateUpdate();
    }

    this.isRunning = false;
    this.emitEvent({ type: 'aborted', timestamp: new Date() });
  }

  /**
   * Retry a failed task
   */
  retryTask(taskId: string): void {
    const success = this.dagManager.retryTask(taskId);
    if (success && this.state) {
      this.state.logs.push({
        timestamp: new Date(),
        level: LogLevel.INFO,
        message: `Retrying task: ${taskId}`,
        source: 'system',
        taskId: 'system',
      });
      this.notifyStateUpdate();
    }
  }

  /**
   * Skip a task
   */
  skipTask(taskId: string): void {
    this.dagManager.skipTask(taskId, 'Skipped by user');

    if (this.state) {
      this.state.logs.push({
        timestamp: new Date(),
        level: LogLevel.WARN,
        message: `Skipped task: ${taskId}`,
        source: 'system',
        taskId: 'system',
      });
      this.notifyStateUpdate();
    }
  }

  /**
   * Cancel a task
   */
  cancelTask(taskId: string): void {
    // Cancel in executor if running
    this.executor.cancel(taskId);

    // Cancel in DAG
    this.dagManager.cancelTask(taskId, false);

    if (this.state) {
      this.state.logs.push({
        timestamp: new Date(),
        level: LogLevel.WARN,
        message: `Cancelled task: ${taskId}`,
        source: 'system',
        taskId: 'system',
      });
      this.notifyStateUpdate();
    }
  }

  /**
   * Get current state
   */
  getState(): DeployTUIState | null {
    return this.state;
  }

  /**
   * Subscribe to state updates
   */
  onStateUpdate(callback: (state: DeployTUIState) => void): () => void {
    this.stateUpdateCallbacks.add(callback);
    return () => {
      this.stateUpdateCallbacks.delete(callback);
    };
  }

  /**
   * Subscribe to deployment events
   */
  on(event: string, listener: (...args: unknown[]) => void): void {
    this.eventEmitter.on(event, listener);
  }

  /**
   * Remove event listener
   */
  off(event: string, listener: (...args: unknown[]) => void): void {
    this.eventEmitter.off(event, listener);
  }

  /**
   * Emit deployment event
   */
  private emitEvent(event: DeployTuiEvent): void {
    this.eventEmitter.emit(event.type, event);
    this.eventEmitter.emit('event', event);
  }

  /**
   * Check if deployment is running
   */
  isDeploymentRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Check if deployment is paused
   */
  isDeploymentPaused(): boolean {
    return this.isPaused;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    this.isRunning = false;
    this.isPaused = false;

    // Cleanup subscriptions
    for (const sub of this.subscriptions) {
      sub.unsubscribe();
    }
    this.subscriptions = [];

    // Cancel any running tasks
    this.executor.cancelAll();

    // Clear state callbacks
    this.stateUpdateCallbacks.clear();

    // Clear ink instance
    if (this.inkInstance) {
      this.inkInstance.unmount();
      this.inkInstance = null;
    }

    this.state = null;
    this.abortController = null;
  }
}
