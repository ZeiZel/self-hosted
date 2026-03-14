import { Injectable, Inject } from '@nestjs/common';
import { Subject, Observable, interval, BehaviorSubject } from 'rxjs';
import { switchMap, takeUntil, catchError, filter } from 'rxjs/operators';
import { ClusterClientService } from './cluster-client.service';
import {
  ClusterState,
  NodeMetrics,
  ServiceMetrics,
  ClusterSummary,
  Alert,
} from '../../interfaces/monitor.interface';
import { AlertsService } from './alerts.service';

/**
 * Service for streaming real-time cluster metrics
 */
@Injectable()
export class MetricsStreamService {
  private readonly state$ = new BehaviorSubject<ClusterState | null>(null);
  private readonly stop$ = new Subject<void>();
  private refreshInterval = 5000; // milliseconds
  private isStreaming = false;

  constructor(
    @Inject(ClusterClientService) private clusterClient: ClusterClientService,
    @Inject(AlertsService) private alertsService: AlertsService,
  ) {}

  /**
   * Start streaming metrics
   */
  startStreaming(intervalSeconds: number = 5): Observable<ClusterState> {
    if (this.isStreaming) {
      return this.state$.asObservable().pipe(
        filter((state): state is ClusterState => state !== null)
      );
    }

    this.refreshInterval = intervalSeconds * 1000;
    this.isStreaming = true;

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

    return this.state$.asObservable().pipe(
      filter((state): state is ClusterState => state !== null)
    );
  }

  /**
   * Stop streaming
   */
  stopStreaming(): void {
    this.stop$.next();
    this.isStreaming = false;
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
