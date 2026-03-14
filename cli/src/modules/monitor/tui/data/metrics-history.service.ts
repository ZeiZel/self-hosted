import { Injectable, Optional, Inject } from '@nestjs/common';
import type { NodeMetrics, ClusterSummary } from '../../../../interfaces/monitor.interface';

/**
 * Single data point with timestamp
 */
export interface MetricDataPoint {
  value: number;
  timestamp: number;
}

/**
 * Historical metrics for a single node
 */
export interface NodeHistory {
  name: string;
  cpu: MetricDataPoint[];
  memory: MetricDataPoint[];
}

/**
 * Cluster-wide historical metrics
 */
export interface ClusterHistory {
  cpu: MetricDataPoint[];
  memory: MetricDataPoint[];
  podCount: MetricDataPoint[];
}

/**
 * Circular buffer for storing time-series data
 */
class CircularBuffer<T> {
  private buffer: T[];
  private head: number = 0;
  private count: number = 0;
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  /**
   * Push a new value to the buffer
   */
  push(value: T): void {
    this.buffer[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  /**
   * Get all values in chronological order
   */
  toArray(): T[] {
    if (this.count === 0) return [];

    const result: T[] = [];
    const start = this.count < this.capacity ? 0 : this.head;

    for (let i = 0; i < this.count; i++) {
      const index = (start + i) % this.capacity;
      result.push(this.buffer[index]);
    }

    return result;
  }

  /**
   * Get the most recent value
   */
  latest(): T | undefined {
    if (this.count === 0) return undefined;
    const index = (this.head - 1 + this.capacity) % this.capacity;
    return this.buffer[index];
  }

  /**
   * Get the number of items
   */
  size(): number {
    return this.count;
  }

  /**
   * Check if buffer is empty
   */
  isEmpty(): boolean {
    return this.count === 0;
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.buffer = new Array(this.capacity);
    this.head = 0;
    this.count = 0;
  }
}

/**
 * Service for managing historical metrics data
 * Uses circular buffers for efficient time-series storage
 */
@Injectable()
export class MetricsHistoryService {
  // Default capacity: 60 data points = 5 minutes at 5s interval
  private static readonly DEFAULT_CAPACITY = 60;

  private nodeHistory: Map<string, {
    cpu: CircularBuffer<MetricDataPoint>;
    memory: CircularBuffer<MetricDataPoint>;
  }> = new Map();

  private clusterHistory: {
    cpu: CircularBuffer<MetricDataPoint>;
    memory: CircularBuffer<MetricDataPoint>;
    podCount: CircularBuffer<MetricDataPoint>;
  };

  private capacity: number;

  constructor(@Optional() @Inject('METRICS_HISTORY_CAPACITY') capacity?: number) {
    this.capacity = capacity ?? MetricsHistoryService.DEFAULT_CAPACITY;
    this.clusterHistory = {
      cpu: new CircularBuffer(this.capacity),
      memory: new CircularBuffer(this.capacity),
      podCount: new CircularBuffer(this.capacity),
    };
  }

  /**
   * Record metrics for a node
   */
  recordNodeMetrics(node: NodeMetrics): void {
    const timestamp = Date.now();

    if (!this.nodeHistory.has(node.name)) {
      this.nodeHistory.set(node.name, {
        cpu: new CircularBuffer(this.capacity),
        memory: new CircularBuffer(this.capacity),
      });
    }

    const history = this.nodeHistory.get(node.name)!;
    history.cpu.push({ value: node.cpu.percent, timestamp });
    history.memory.push({ value: node.memory.percent, timestamp });
  }

  /**
   * Record cluster summary metrics
   */
  recordClusterSummary(summary: ClusterSummary): void {
    const timestamp = Date.now();

    this.clusterHistory.cpu.push({ value: summary.cpu.percent, timestamp });
    this.clusterHistory.memory.push({ value: summary.memory.percent, timestamp });
    this.clusterHistory.podCount.push({ value: summary.pods.running, timestamp });
  }

  /**
   * Record all node metrics from an array
   */
  recordAllNodes(nodes: NodeMetrics[]): void {
    for (const node of nodes) {
      this.recordNodeMetrics(node);
    }
  }

  /**
   * Get history for a specific node
   */
  getNodeHistory(nodeName: string): NodeHistory | null {
    const history = this.nodeHistory.get(nodeName);
    if (!history) return null;

    return {
      name: nodeName,
      cpu: history.cpu.toArray(),
      memory: history.memory.toArray(),
    };
  }

  /**
   * Get history for all nodes
   */
  getAllNodeHistory(): NodeHistory[] {
    const result: NodeHistory[] = [];

    for (const [name, history] of this.nodeHistory) {
      result.push({
        name,
        cpu: history.cpu.toArray(),
        memory: history.memory.toArray(),
      });
    }

    return result;
  }

  /**
   * Get cluster-wide history
   */
  getClusterHistory(): ClusterHistory {
    return {
      cpu: this.clusterHistory.cpu.toArray(),
      memory: this.clusterHistory.memory.toArray(),
      podCount: this.clusterHistory.podCount.toArray(),
    };
  }

  /**
   * Get CPU values for a node as a simple number array (for charts)
   */
  getNodeCpuValues(nodeName: string): number[] {
    const history = this.nodeHistory.get(nodeName);
    if (!history) return [];
    return history.cpu.toArray().map(p => p.value);
  }

  /**
   * Get memory values for a node as a simple number array (for charts)
   */
  getNodeMemoryValues(nodeName: string): number[] {
    const history = this.nodeHistory.get(nodeName);
    if (!history) return [];
    return history.memory.toArray().map(p => p.value);
  }

  /**
   * Get cluster CPU values as a simple number array
   */
  getClusterCpuValues(): number[] {
    return this.clusterHistory.cpu.toArray().map(p => p.value);
  }

  /**
   * Get cluster memory values as a simple number array
   */
  getClusterMemoryValues(): number[] {
    return this.clusterHistory.memory.toArray().map(p => p.value);
  }

  /**
   * Get the most recent CPU value for a node
   */
  getLatestNodeCpu(nodeName: string): number | undefined {
    return this.nodeHistory.get(nodeName)?.cpu.latest()?.value;
  }

  /**
   * Get the most recent memory value for a node
   */
  getLatestNodeMemory(nodeName: string): number | undefined {
    return this.nodeHistory.get(nodeName)?.memory.latest()?.value;
  }

  /**
   * Get number of data points stored for a node
   */
  getNodeDataPointCount(nodeName: string): number {
    const history = this.nodeHistory.get(nodeName);
    if (!history) return 0;
    return history.cpu.size();
  }

  /**
   * Get number of data points stored for cluster
   */
  getClusterDataPointCount(): number {
    return this.clusterHistory.cpu.size();
  }

  /**
   * Clear all history
   */
  clear(): void {
    this.nodeHistory.clear();
    this.clusterHistory.cpu.clear();
    this.clusterHistory.memory.clear();
    this.clusterHistory.podCount.clear();
  }

  /**
   * Remove history for nodes that no longer exist
   */
  pruneStaleNodes(currentNodes: string[]): void {
    const currentSet = new Set(currentNodes);

    for (const nodeName of this.nodeHistory.keys()) {
      if (!currentSet.has(nodeName)) {
        this.nodeHistory.delete(nodeName);
      }
    }
  }

  /**
   * Get statistics about the history
   */
  getStats(): {
    nodeCount: number;
    clusterDataPoints: number;
    oldestTimestamp: number | null;
    newestTimestamp: number | null;
  } {
    const clusterCpu = this.clusterHistory.cpu.toArray();

    return {
      nodeCount: this.nodeHistory.size,
      clusterDataPoints: clusterCpu.length,
      oldestTimestamp: clusterCpu.length > 0 ? clusterCpu[0].timestamp : null,
      newestTimestamp: clusterCpu.length > 0 ? clusterCpu[clusterCpu.length - 1].timestamp : null,
    };
  }
}
