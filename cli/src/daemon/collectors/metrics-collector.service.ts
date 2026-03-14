import { Injectable, Inject, OnModuleDestroy } from '@nestjs/common';
import { ClusterClientService } from '../../modules/monitor/cluster-client.service';
import { AlertsService } from '../../modules/monitor/alerts.service';
import type { ClusterState, NodeMetrics, ServiceMetrics } from '../../interfaces/monitor.interface';

/**
 * Pod detail information
 */
export interface PodDetails {
  name: string;
  namespace: string;
  node: string;
  status: string;
  ip: string;
  startTime: string;
  containers: ContainerDetails[];
  events: PodEvent[];
  labels: Record<string, string>;
  annotations: Record<string, string>;
}

export interface ContainerDetails {
  name: string;
  image: string;
  ready: boolean;
  restartCount: number;
  state: string;
  lastState?: string;
  resources: {
    requests: { cpu?: string; memory?: string };
    limits: { cpu?: string; memory?: string };
  };
}

export interface PodEvent {
  type: string;
  reason: string;
  message: string;
  count: number;
  firstTimestamp: string;
  lastTimestamp: string;
}

/**
 * Resource prediction
 */
export interface ResourcePrediction {
  metricType: 'node_cpu' | 'node_memory' | 'pod_cpu' | 'pod_memory';
  targetId: string;
  currentValue: number;
  predictedValue: number;
  confidence: number;
  predictionHorizon: number; // seconds into future
  estimatedBreachTime?: string; // ISO timestamp when threshold breached
  trend: 'increasing' | 'decreasing' | 'stable';
}

/**
 * Service for collecting and caching cluster metrics
 * Runs in the background and provides data to the HTTP server
 */
@Injectable()
export class MetricsCollectorService implements OnModuleDestroy {
  private currentState: ClusterState | null = null;
  private collectionInterval: number = 5000; // 5 seconds
  private lastCollectionTime: string = '';
  private collectionTimer: NodeJS.Timeout | null = null;
  private updateCallbacks: Set<(state: ClusterState) => void> = new Set();
  private isCollecting: boolean = false;

  // Historical data for predictions (circular buffers)
  private nodeMetricsHistory: Map<string, { timestamp: number; cpu: number; memory: number }[]> = new Map();
  private maxHistorySize: number = 60; // 5 minutes at 5s intervals

  constructor(
    @Inject(ClusterClientService)
    private readonly clusterClient: ClusterClientService,
    @Inject(AlertsService)
    private readonly alertsService: AlertsService,
  ) {}

  onModuleDestroy() {
    this.stopCollection();
  }

  /**
   * Start background metric collection
   */
  startCollection(intervalMs: number = 5000): void {
    this.collectionInterval = intervalMs;
    this.isCollecting = true;

    // Initial collection
    this.collectMetrics();

    // Schedule periodic collection
    this.collectionTimer = setInterval(() => {
      if (this.isCollecting) {
        this.collectMetrics();
      }
    }, intervalMs);

    console.log(`[MetricsCollector] Started with ${intervalMs}ms interval`);
  }

  /**
   * Stop background collection
   */
  stopCollection(): void {
    this.isCollecting = false;
    if (this.collectionTimer) {
      clearInterval(this.collectionTimer);
      this.collectionTimer = null;
    }
    console.log('[MetricsCollector] Stopped');
  }

  /**
   * Collect metrics from cluster
   */
  private async collectMetrics(): Promise<void> {
    try {
      const [summary, nodes, services] = await Promise.all([
        this.clusterClient.getClusterSummary(),
        this.clusterClient.getNodeMetrics(),
        this.clusterClient.getServiceMetrics(),
      ]);

      // Generate alerts
      const alerts = this.alertsService.generateAlerts(nodes, services);

      // Update state
      this.currentState = {
        summary,
        nodes,
        services,
        alerts,
        timestamp: new Date().toISOString(),
      };

      this.lastCollectionTime = this.currentState.timestamp;

      // Update history for predictions
      this.updateHistory(nodes);

      // Notify subscribers
      this.notifyUpdate(this.currentState);
    } catch (err) {
      console.error('[MetricsCollector] Collection error:', err);
    }
  }

  /**
   * Update historical data
   */
  private updateHistory(nodes: NodeMetrics[]): void {
    const timestamp = Date.now();

    for (const node of nodes) {
      let history = this.nodeMetricsHistory.get(node.name);
      if (!history) {
        history = [];
        this.nodeMetricsHistory.set(node.name, history);
      }

      history.push({
        timestamp,
        cpu: node.cpu.percent,
        memory: node.memory.percent,
      });

      // Trim to max size
      while (history.length > this.maxHistorySize) {
        history.shift();
      }
    }
  }

  /**
   * Get current state
   */
  getCurrentState(): ClusterState | null {
    return this.currentState;
  }

  /**
   * Get collection interval
   */
  getCollectionInterval(): number {
    return this.collectionInterval;
  }

  /**
   * Get last collection time
   */
  getLastCollectionTime(): string {
    return this.lastCollectionTime;
  }

  /**
   * Register callback for updates
   */
  onUpdate(callback: (state: ClusterState) => void): void {
    this.updateCallbacks.add(callback);
  }

  /**
   * Remove update callback
   */
  offUpdate(callback: (state: ClusterState) => void): void {
    this.updateCallbacks.delete(callback);
  }

  /**
   * Notify all subscribers
   */
  private notifyUpdate(state: ClusterState): void {
    for (const callback of this.updateCallbacks) {
      try {
        callback(state);
      } catch (err) {
        console.error('[MetricsCollector] Callback error:', err);
      }
    }
  }

  /**
   * Get detailed pod information
   */
  async getPodDetails(namespace: string, podName: string): Promise<PodDetails | null> {
    // Find the service in current state
    const service = this.currentState?.services.find(
      s => s.name === podName && s.namespace === namespace
    );

    if (!service) {
      return null;
    }

    // Get additional details via kubectl (this is a basic implementation)
    // In production, this would query Kubernetes API for full pod spec
    return {
      name: podName,
      namespace,
      node: service.node,
      status: service.status,
      ip: '', // Would need additional kubectl query
      startTime: '', // Would need additional kubectl query
      containers: [
        {
          name: podName,
          image: '',
          ready: service.health === 'healthy',
          restartCount: service.restarts,
          state: service.status,
          resources: {
            requests: {
              cpu: `${service.cpu.requested}m`,
              memory: `${service.memory.requested}`,
            },
            limits: {
              cpu: `${service.cpu.limit}m`,
              memory: `${service.memory.limit}`,
            },
          },
        },
      ],
      events: [],
      labels: {},
      annotations: {},
    };
  }

  /**
   * Get resource predictions using linear regression
   */
  getPredictions(): ResourcePrediction[] {
    const predictions: ResourcePrediction[] = [];

    for (const [nodeName, history] of this.nodeMetricsHistory) {
      if (history.length < 10) continue; // Need enough data

      // CPU prediction
      const cpuPrediction = this.predictMetric(
        history.map(h => ({ timestamp: h.timestamp, value: h.cpu })),
        'node_cpu',
        nodeName,
        90, // 90% threshold
      );
      if (cpuPrediction) predictions.push(cpuPrediction);

      // Memory prediction
      const memPrediction = this.predictMetric(
        history.map(h => ({ timestamp: h.timestamp, value: h.memory })),
        'node_memory',
        nodeName,
        90, // 90% threshold
      );
      if (memPrediction) predictions.push(memPrediction);
    }

    return predictions;
  }

  /**
   * Simple linear regression prediction
   */
  private predictMetric(
    data: { timestamp: number; value: number }[],
    metricType: ResourcePrediction['metricType'],
    targetId: string,
    threshold: number,
  ): ResourcePrediction | null {
    if (data.length < 2) return null;

    // Linear regression
    const n = data.length;
    const sumX = data.reduce((s, d) => s + d.timestamp, 0);
    const sumY = data.reduce((s, d) => s + d.value, 0);
    const sumXY = data.reduce((s, d) => s + d.timestamp * d.value, 0);
    const sumX2 = data.reduce((s, d) => s + d.timestamp * d.timestamp, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Predict 5 minutes into future
    const predictionHorizon = 300; // 5 minutes
    const futureTimestamp = Date.now() + predictionHorizon * 1000;
    const predictedValue = slope * futureTimestamp + intercept;

    // Calculate R-squared for confidence
    const meanY = sumY / n;
    const ssTotal = data.reduce((s, d) => s + Math.pow(d.value - meanY, 2), 0);
    const ssResidual = data.reduce((s, d) => s + Math.pow(d.value - (slope * d.timestamp + intercept), 2), 0);
    const rSquared = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

    // Determine trend
    let trend: ResourcePrediction['trend'] = 'stable';
    if (slope > 0.001) trend = 'increasing';
    else if (slope < -0.001) trend = 'decreasing';

    // Calculate breach time if trending up
    let estimatedBreachTime: string | undefined;
    if (slope > 0 && data[data.length - 1].value < threshold) {
      const breachTimestamp = (threshold - intercept) / slope;
      if (breachTimestamp > Date.now()) {
        estimatedBreachTime = new Date(breachTimestamp).toISOString();
      }
    }

    return {
      metricType,
      targetId,
      currentValue: data[data.length - 1].value,
      predictedValue: Math.max(0, Math.min(100, predictedValue)), // Clamp 0-100%
      confidence: Math.max(0, Math.min(1, rSquared)),
      predictionHorizon,
      estimatedBreachTime,
      trend,
    };
  }
}
