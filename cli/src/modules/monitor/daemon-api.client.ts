import { Injectable } from '@nestjs/common';
import type { ClusterState } from '../../interfaces/monitor.interface';
import type { MetricsPollResponse } from '../../daemon/http/daemon-server';
import type { ResourcePrediction, PodDetails } from '../../daemon/collectors/metrics-collector.service';

/**
 * Configuration for daemon API client
 */
export interface DaemonApiConfig {
  host: string;
  port: number;
  pollTimeout: number;
  retryDelay: number;
  maxRetries: number;
}

const DEFAULT_CONFIG: DaemonApiConfig = {
  host: '127.0.0.1',
  port: 8765,
  pollTimeout: 15000,
  retryDelay: 1000,
  maxRetries: 3,
};

/**
 * Client for communicating with daemon HTTP API
 * Supports long-polling for real-time metrics updates
 */
@Injectable()
export class DaemonApiClient {
  private config: DaemonApiConfig = DEFAULT_CONFIG;
  private lastTimestamp: number = 0;
  private isConnected: boolean = false;
  private abortController: AbortController | null = null;

  /**
   * Configure the client
   */
  configure(config: Partial<DaemonApiConfig>): void {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if daemon is reachable
   */
  async checkConnection(): Promise<{ connected: boolean; error?: string }> {
    try {
      const response = await this.fetch('/api/v1/health', { timeout: 5000 });
      if (response.ok) {
        this.isConnected = true;
        return { connected: true };
      }
      return { connected: false, error: `HTTP ${response.status}` };
    } catch (err) {
      this.isConnected = false;
      return {
        connected: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  /**
   * Get current metrics (non-blocking)
   */
  async getCurrentMetrics(): Promise<ClusterState | null> {
    try {
      const response = await this.fetch('/api/v1/metrics/current');
      if (!response.ok) {
        console.error('[DaemonApiClient] Current metrics failed:', response.status);
        return null;
      }
      const data = (await response.json()) as MetricsPollResponse;
      if (data.data) {
        this.lastTimestamp = data.timestamp;
      }
      return data.data || null;
    } catch (err) {
      console.error('[DaemonApiClient] Current metrics error:', err);
      return null;
    }
  }

  /**
   * Long-poll for metrics updates
   * Returns immediately if newer data is available, otherwise waits up to timeout
   */
  async pollMetrics(timeoutMs?: number): Promise<{
    state: ClusterState | null;
    hasUpdate: boolean;
    meta: { nextPoll: number; collectionInterval: number; lastCollection: string };
  }> {
    const timeout = timeoutMs || this.config.pollTimeout;

    try {
      // Create abort controller for this request
      this.abortController = new AbortController();

      const url = `/api/v1/metrics/poll?since=${this.lastTimestamp}&timeout=${timeout}`;
      const response = await this.fetch(url, {
        timeout: timeout + 2000, // Add buffer for network latency
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as MetricsPollResponse;

      if (data.hasUpdate && data.data) {
        this.lastTimestamp = data.timestamp;
      }

      return {
        state: data.data || null,
        hasUpdate: data.hasUpdate,
        meta: data.meta,
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was cancelled, not an error
        return {
          state: null,
          hasUpdate: false,
          meta: { nextPoll: this.config.pollTimeout, collectionInterval: 5000, lastCollection: '' },
        };
      }
      console.error('[DaemonApiClient] Poll error:', err);
      throw err;
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Cancel pending poll
   */
  cancelPoll(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Get pod details
   */
  async getPodDetails(namespace: string, podName: string): Promise<PodDetails | null> {
    try {
      const response = await this.fetch(`/api/v1/pods/${namespace}/${podName}/details`);
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`HTTP ${response.status}`);
      }
      return (await response.json()) as PodDetails;
    } catch (err) {
      console.error('[DaemonApiClient] Pod details error:', err);
      return null;
    }
  }

  /**
   * Get resource predictions
   */
  async getPredictions(): Promise<ResourcePrediction[]> {
    try {
      const response = await this.fetch('/api/v1/predictions');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as { predictions: ResourcePrediction[] };
      return data.predictions || [];
    } catch (err) {
      console.error('[DaemonApiClient] Predictions error:', err);
      return [];
    }
  }

  /**
   * Check if connected to daemon
   */
  isReady(): boolean {
    return this.isConnected;
  }

  /**
   * Reset connection state
   */
  reset(): void {
    this.lastTimestamp = 0;
    this.isConnected = false;
    this.cancelPoll();
  }

  /**
   * Internal fetch with timeout
   */
  private async fetch(
    path: string,
    options: { timeout?: number; signal?: AbortSignal } = {},
  ): Promise<Response> {
    const url = `http://${this.config.host}:${this.config.port}${path}`;
    const timeout = options.timeout || 10000;

    // Create timeout abort controller
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeout);

    // Combine with provided signal if any
    const signal = options.signal
      ? this.combineSignals(options.signal, timeoutController.signal)
      : timeoutController.signal;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Combine multiple abort signals
   */
  private combineSignals(...signals: AbortSignal[]): AbortSignal {
    const controller = new AbortController();

    for (const signal of signals) {
      if (signal.aborted) {
        controller.abort();
        break;
      }
      signal.addEventListener('abort', () => controller.abort());
    }

    return controller.signal;
  }
}
