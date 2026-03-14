import { Injectable, Inject } from '@nestjs/common';
import { Subscription } from 'rxjs';
import React from 'react';
import { render, Instance } from 'ink';
import type {
  ClusterState,
  MigrationRequest,
} from '../../../interfaces/monitor.interface';
import { MetricsStreamService } from '../metrics-stream.service';
import { MetricsHistoryService } from './data/metrics-history.service';
import { App } from './components/App';

/**
 * Ink-based TUI service for btop-style monitor dashboard
 * Uses React components with ink for modern, maintained TUI rendering
 */
@Injectable()
export class InkTuiService {
  private metricsHistory: MetricsHistoryService;
  private clusterState: ClusterState | null = null;
  private subscription: Subscription | null = null;
  private inkInstance: Instance | null = null;
  private running = false;
  private onMigrate?: (request: MigrationRequest) => Promise<void>;
  private updateCallback?: () => void;

  constructor(
    @Inject(MetricsStreamService) private metricsStream: MetricsStreamService
  ) {
    this.metricsHistory = new MetricsHistoryService(60); // 5 minutes at 5s interval
  }

  /**
   * Start the ink TUI
   */
  async start(
    options: {
      refreshInterval?: number;
      onMigrate?: (request: MigrationRequest) => Promise<void>;
    } = {}
  ): Promise<void> {
    this.running = true;
    this.onMigrate = options.onMigrate;

    // Start metrics streaming
    const stream$ = await this.metricsStream.startStreaming(options.refreshInterval || 5);
    this.subscription = stream$.subscribe((state: ClusterState) => {
      if (state && state.nodes) {
        this.handleMetricsUpdate(state);
      }
    });

    // Render the React app
    this.inkInstance = render(
      React.createElement(App, {
        clusterState: this.clusterState,
        metricsHistory: this.metricsHistory,
        onRefresh: () => this.metricsStream.refresh(),
        onMigrate: this.onMigrate ? async (service, namespace, targetNode) => {
          await this.onMigrate!({
            service,
            namespace,
            sourceNode: '',
            targetNode,
            force: false,
          });
        } : undefined,
      })
    );

    // Wait for the app to exit
    await this.inkInstance.waitUntilExit();
  }

  /**
   * Handle metrics update
   */
  private handleMetricsUpdate(state: ClusterState): void {
    if (!state || !state.nodes || !state.summary) {
      return;
    }

    this.clusterState = state;

    // Record metrics history
    this.metricsHistory.recordAllNodes(state.nodes);
    this.metricsHistory.recordClusterSummary(state.summary);

    // Re-render with new state
    if (this.inkInstance) {
      this.inkInstance.rerender(
        React.createElement(App, {
          clusterState: this.clusterState,
          metricsHistory: this.metricsHistory,
          onRefresh: () => this.metricsStream.refresh(),
          onMigrate: this.onMigrate ? async (service, namespace, targetNode) => {
            await this.onMigrate!({
              service,
              namespace,
              sourceNode: '',
              targetNode,
              force: false,
            });
          } : undefined,
        })
      );
    }
  }

  /**
   * Stop the TUI
   */
  stop(): void {
    this.running = false;
    this.subscription?.unsubscribe();
    this.metricsStream.stopStreaming();
    this.inkInstance?.unmount();
  }

  /**
   * Render headless (JSON) output
   */
  renderHeadless(): string {
    if (!this.clusterState) {
      return JSON.stringify({ error: 'No data available' });
    }
    return JSON.stringify(this.clusterState, null, 2);
  }

  /**
   * Get current cluster state
   */
  getClusterState(): ClusterState | null {
    return this.clusterState;
  }

  /**
   * Get metrics history service
   */
  getMetricsHistory(): MetricsHistoryService {
    return this.metricsHistory;
  }
}
