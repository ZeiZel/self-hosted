import { Injectable, Inject, Optional } from '@nestjs/common';
import { Subject, Observable, interval, BehaviorSubject } from 'rxjs';
import { switchMap, takeUntil, catchError, filter } from 'rxjs/operators';
import { ClusterClientService } from './cluster-client.service';
import { DaemonApiClient } from './daemon-api.client';
import {
  ClusterState,
  NodeMetrics,
  ServiceMetrics,
  ClusterSummary,
  Alert,
} from '../../interfaces/monitor.interface';
import { AlertsService } from './alerts.service';

/**
 * Metrics source mode
 */
export type MetricsSourceMode = 'direct' | 'daemon' | 'auto';

/**
 * Service for streaming real-time cluster metrics
 * Supports both direct kubectl queries and daemon HTTP API
 */
@Injectable()
export class MetricsStreamService {
  private readonly state$ = new BehaviorSubject<ClusterState | null>(null);
  private readonly stop$ = new Subject<void>();
  private refreshInterval = 5000; // milliseconds
  private isStreaming = false;
  private sourceMode: MetricsSourceMode = 'auto';
  private useDaemon: boolean = false;
  private pollLoopActive: boolean = false;

  constructor(
    @Inject(ClusterClientService) private clusterClient: ClusterClientService,
    @Inject(AlertsService) private alertsService: AlertsService,
    @Optional() @Inject(DaemonApiClient) private daemonClient?: DaemonApiClient,
  ) {}

  /**
   * Set the metrics source mode
   */
  setSourceMode(mode: MetricsSourceMode): void {
    this.sourceMode = mode;
  }

  /**
   * Start streaming metrics
   */
  async startStreaming(intervalSeconds: number = 5): Promise<Observable<ClusterState>> {
    if (this.isStreaming) {
      return this.state$.asObservable().pipe(
        filter((state): state is ClusterState => state !== null)
      );
    }

    this.refreshInterval = intervalSeconds * 1000;
    this.isStreaming = true;

    // Determine source mode
    await this.resolveSourceMode();

    if (this.useDaemon && this.daemonClient) {
      // Use daemon long-polling mode
      this.startDaemonPolling();
    } else {
      // Use direct kubectl mode
      this.startDirectPolling();
    }

    return this.state$.asObservable().pipe(
      filter((state): state is ClusterState => state !== null)
    );
  }

  /**
   * Resolve which source mode to use
   */
  private async resolveSourceMode(): Promise<void> {
    if (this.sourceMode === 'direct') {
      this.useDaemon = false;
      return;
    }

    if (this.sourceMode === 'daemon') {
      this.useDaemon = true;
      return;
    }

    // Auto mode: try daemon first, fall back to direct
    if (this.daemonClient) {
      const { connected } = await this.daemonClient.checkConnection();
      this.useDaemon = connected;
      if (connected) {
        console.log('[MetricsStream] Using daemon API');
      } else {
        console.log('[MetricsStream] Daemon not available, using direct kubectl');
      }
    } else {
      this.useDaemon = false;
    }
  }

  /**
   * Start daemon long-polling loop
   */
  private async startDaemonPolling(): Promise<void> {
    if (!this.daemonClient) return;

    this.pollLoopActive = true;

    // Initial fetch
    const initialState = await this.daemonClient.getCurrentMetrics();
    if (initialState) {
      this.state$.next(initialState);
    }

    // Long-poll loop
    while (this.pollLoopActive && this.isStreaming) {
      try {
        const result = await this.daemonClient.pollMetrics(this.refreshInterval);
        if (result.hasUpdate && result.state) {
          this.state$.next(result.state);
        }
      } catch (err) {
        console.error('[MetricsStream] Daemon poll error:', err);
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check if daemon is still available
        const { connected } = await this.daemonClient.checkConnection();
        if (!connected) {
          console.log('[MetricsStream] Daemon disconnected, switching to direct mode');
          this.useDaemon = false;
          this.pollLoopActive = false;
          this.startDirectPolling();
          return;
        }
      }
    }
  }

  /**
   * Start direct kubectl polling
   */
  private startDirectPolling(): void {
    // Initial fetch
    this.fetchAndUpdateState();

    // Set up interval
    interval(this.refreshInterval)
      .pipe(
        takeUntil(this.stop$),
        switchMap(() => this.fetchState()),
        catchError((err) => {
          console.error('Error fetching metrics:', err);
          return [];
        }),
      )
      .subscribe((state) => {
        if (state) {
          this.state$.next(state);
        }
      });
  }

  /**
   * Stop streaming
   */
  stopStreaming(): void {
    this.stop$.next();
    this.isStreaming = false;
    this.pollLoopActive = false;

    // Cancel any pending daemon poll
    if (this.daemonClient) {
      this.daemonClient.cancelPoll();
    }
  }

  /**
   * Check if daemon is available and connected
   */
  async checkDaemonConnection(): Promise<{ connected: boolean; error?: string }> {
    if (!this.daemonClient) {
      return { connected: false, error: 'Daemon client not available' };
    }
    return this.daemonClient.checkConnection();
  }

  /**
   * Get current source mode
   */
  getCurrentSourceMode(): { mode: MetricsSourceMode; usingDaemon: boolean } {
    return { mode: this.sourceMode, usingDaemon: this.useDaemon };
  }

  /**
   * Get current state (non-streaming)
   */
  async getCurrentState(): Promise<ClusterState> {
    return this.fetchState();
  }

  /**
   * Get the state observable
   */
  getState$(): Observable<ClusterState | null> {
    return this.state$.asObservable();
  }

  /**
   * Force refresh
   */
  async refresh(): Promise<ClusterState> {
    const state = await this.fetchState();
    this.state$.next(state);
    return state;
  }

  /**
   * Fetch and update state
   */
  private async fetchAndUpdateState(): Promise<void> {
    try {
      const state = await this.fetchState();
      this.state$.next(state);
    } catch (err) {
      console.error('Error fetching initial metrics:', err);
    }
  }

  /**
   * Fetch cluster state
   */
  private async fetchState(): Promise<ClusterState> {
    const [summary, nodes, services] = await Promise.all([
      this.clusterClient.getClusterSummary(),
      this.clusterClient.getNodeMetrics(),
      this.clusterClient.getServiceMetrics(),
    ]);

    // Generate alerts based on current state
    const alerts = this.alertsService.generateAlerts(nodes, services);

    return {
      summary,
      nodes,
      services,
      alerts,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get node metrics stream
   */
  getNodesStream(): Observable<NodeMetrics[]> {
    return new Observable((observer) => {
      const subscription = this.state$.subscribe((state) => {
        if (state) {
          observer.next(state.nodes);
        }
      });
      return () => subscription.unsubscribe();
    });
  }

  /**
   * Get services metrics stream
   */
  getServicesStream(): Observable<ServiceMetrics[]> {
    return new Observable((observer) => {
      const subscription = this.state$.subscribe((state) => {
        if (state) {
          observer.next(state.services);
        }
      });
      return () => subscription.unsubscribe();
    });
  }

  /**
   * Get alerts stream
   */
  getAlertsStream(): Observable<Alert[]> {
    return new Observable((observer) => {
      const subscription = this.state$.subscribe((state) => {
        if (state) {
          observer.next(state.alerts);
        }
      });
      return () => subscription.unsubscribe();
    });
  }

  /**
   * Get cluster summary stream
   */
  getSummaryStream(): Observable<ClusterSummary> {
    return new Observable((observer) => {
      const subscription = this.state$.subscribe((state) => {
        if (state) {
          observer.next(state.summary);
        }
      });
      return () => subscription.unsubscribe();
    });
  }
}
