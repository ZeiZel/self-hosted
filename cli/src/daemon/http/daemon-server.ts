import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Server, createServer, IncomingMessage, ServerResponse } from 'http';
import { MetricsCollectorService } from '../collectors/metrics-collector.service';
import { DaemonClientService } from '../daemon-client.service';
import type { ClusterState } from '../../interfaces/monitor.interface';

/**
 * Configuration for daemon HTTP server
 */
export interface DaemonServerConfig {
  port: number;
  host: string;
  pollTimeout: number; // milliseconds
}

export const DEFAULT_SERVER_CONFIG: DaemonServerConfig = {
  port: 8765,
  host: '127.0.0.1',
  pollTimeout: 15000, // 15 seconds
};

/**
 * API response for metrics poll endpoint
 */
export interface MetricsPollResponse {
  timestamp: number;
  hasUpdate: boolean;
  data?: ClusterState;
  meta: {
    nextPoll: number;
    collectionInterval: number;
    lastCollection: string;
  };
}

/**
 * HTTP Server for daemon API
 * Provides long-polling endpoints for real-time metrics
 */
@Injectable()
export class DaemonHttpServer implements OnModuleInit, OnModuleDestroy {
  private server: Server | null = null;
  private config: DaemonServerConfig = DEFAULT_SERVER_CONFIG;
  private pendingPolls: Map<string, { res: ServerResponse; timeout: NodeJS.Timeout; since: number }> = new Map();
  private lastMetricsUpdate: number = 0;

  constructor(
    @Inject(MetricsCollectorService)
    private readonly metricsCollector: MetricsCollectorService,
    @Inject(DaemonClientService)
    private readonly daemonClient: DaemonClientService,
  ) {}

  async onModuleInit() {
    // Subscribe to metrics updates to notify waiting clients
    this.metricsCollector.onUpdate((state) => {
      this.lastMetricsUpdate = Date.now();
      this.notifyPendingPolls(state);
    });
  }

  async onModuleDestroy() {
    await this.stop();
  }

  /**
   * Start the HTTP server
   */
  async start(config: Partial<DaemonServerConfig> = {}): Promise<void> {
    this.config = { ...DEFAULT_SERVER_CONFIG, ...config };

    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));

      this.server.on('error', (err) => {
        console.error('[HTTP Server] Error:', err);
        reject(err);
      });

      this.server.listen(this.config.port, this.config.host, () => {
        console.log(`[HTTP Server] Listening on http://${this.config.host}:${this.config.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the HTTP server
   */
  async stop(): Promise<void> {
    // Clear all pending polls
    for (const [id, poll] of this.pendingPolls) {
      clearTimeout(poll.timeout);
      this.sendJsonResponse(poll.res, 503, { error: 'Server shutting down' });
    }
    this.pendingPolls.clear();

    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('[HTTP Server] Stopped');
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Handle incoming HTTP request
   */
  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const path = url.pathname;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Route handling
    try {
      if (path === '/api/v1/health') {
        this.handleHealth(req, res);
      } else if (path === '/api/v1/metrics/poll') {
        this.handleMetricsPoll(req, res, url);
      } else if (path === '/api/v1/metrics/current') {
        this.handleMetricsCurrent(req, res);
      } else if (path.startsWith('/api/v1/pods/')) {
        this.handlePodDetails(req, res, path);
      } else if (path === '/api/v1/predictions') {
        this.handlePredictions(req, res);
      } else {
        this.sendJsonResponse(res, 404, { error: 'Not found', path });
      }
    } catch (err) {
      console.error('[HTTP Server] Request error:', err);
      this.sendJsonResponse(res, 500, { error: 'Internal server error' });
    }
  }

  /**
   * Health check endpoint
   */
  private handleHealth(_req: IncomingMessage, res: ServerResponse): void {
    const status = this.daemonClient.getDaemonStatus();
    this.sendJsonResponse(res, 200, {
      status: 'ok',
      uptime: status.startedAt ? Date.now() - new Date(status.startedAt).getTime() : 0,
      lastCheck: status.lastCheck,
      pendingPolls: this.pendingPolls.size,
    });
  }

  /**
   * Long-polling metrics endpoint
   * Waits for new data or timeout, whichever comes first
   */
  private handleMetricsPoll(req: IncomingMessage, res: ServerResponse, url: URL): void {
    const since = parseInt(url.searchParams.get('since') || '0', 10);
    const timeout = Math.min(
      parseInt(url.searchParams.get('timeout') || String(this.config.pollTimeout), 10),
      30000, // Max 30 seconds
    );

    // If we have newer data than client's timestamp, return immediately
    if (this.lastMetricsUpdate > since) {
      const state = this.metricsCollector.getCurrentState();
      this.sendPollResponse(res, state, true);
      return;
    }

    // Otherwise, register for long-polling
    const pollId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timeoutHandle = setTimeout(() => {
      this.pendingPolls.delete(pollId);
      // Return current state even if not updated
      const state = this.metricsCollector.getCurrentState();
      this.sendPollResponse(res, state, false);
    }, timeout);

    this.pendingPolls.set(pollId, { res, timeout: timeoutHandle, since });
  }

  /**
   * Current metrics endpoint (non-blocking)
   */
  private handleMetricsCurrent(_req: IncomingMessage, res: ServerResponse): void {
    const state = this.metricsCollector.getCurrentState();
    this.sendPollResponse(res, state, true);
  }

  /**
   * Pod details endpoint
   */
  private async handlePodDetails(_req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    // Parse path: /api/v1/pods/{namespace}/{name}/details
    const match = path.match(/^\/api\/v1\/pods\/([^/]+)\/([^/]+)\/details$/);
    if (!match) {
      this.sendJsonResponse(res, 400, { error: 'Invalid path format. Use /api/v1/pods/{namespace}/{name}/details' });
      return;
    }

    const [, namespace, podName] = match;
    const details = await this.metricsCollector.getPodDetails(namespace, podName);

    if (!details) {
      this.sendJsonResponse(res, 404, { error: 'Pod not found', namespace, name: podName });
      return;
    }

    this.sendJsonResponse(res, 200, details);
  }

  /**
   * Predictions endpoint
   */
  private handlePredictions(_req: IncomingMessage, res: ServerResponse): void {
    const predictions = this.metricsCollector.getPredictions();
    this.sendJsonResponse(res, 200, { predictions });
  }

  /**
   * Notify all pending polls of new data
   */
  private notifyPendingPolls(state: ClusterState): void {
    for (const [id, poll] of this.pendingPolls) {
      clearTimeout(poll.timeout);
      this.pendingPolls.delete(id);
      this.sendPollResponse(poll.res, state, true);
    }
  }

  /**
   * Send poll response with metadata
   */
  private sendPollResponse(res: ServerResponse, state: ClusterState | null, hasUpdate: boolean): void {
    const response: MetricsPollResponse = {
      timestamp: Date.now(),
      hasUpdate,
      data: state || undefined,
      meta: {
        nextPoll: this.config.pollTimeout,
        collectionInterval: this.metricsCollector.getCollectionInterval(),
        lastCollection: this.metricsCollector.getLastCollectionTime(),
      },
    };
    this.sendJsonResponse(res, 200, response);
  }

  /**
   * Send JSON response
   */
  private sendJsonResponse(res: ServerResponse, status: number, data: any): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }
}
