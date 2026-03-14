import { Injectable, Inject, Optional } from '@nestjs/common';
import { PrometheusClient } from '../../modules/monitor/apis/prometheus.client';
import type { NodeMetrics, ServiceMetrics } from '../../interfaces/monitor.interface';

/**
 * Prometheus metrics enrichment data
 */
export interface PrometheusEnrichment {
  nodeMetrics: Map<string, { cpuPercent: number; memoryPercent: number; memoryUsed: number; memoryTotal: number }>;
  podMetrics: Map<string, { cpuMillicores: number; memoryBytes: number; restarts: number }>;
  lastUpdate: string;
}

/**
 * Service for collecting metrics from Prometheus
 * Enriches kubectl data with real-time metrics
 */
@Injectable()
export class PrometheusCollectorService {
  private lastEnrichment: PrometheusEnrichment | null = null;
  private isAvailable: boolean = false;

  constructor(
    @Optional()
    @Inject(PrometheusClient)
    private readonly prometheusClient?: PrometheusClient,
  ) {}

  /**
   * Check if Prometheus is available
   */
  async checkAvailability(): Promise<boolean> {
    if (!this.prometheusClient) {
      this.isAvailable = false;
      return false;
    }

    try {
      const health = await this.prometheusClient.checkHealth();
      this.isAvailable = health.status === 'healthy';
      return this.isAvailable;
    } catch {
      this.isAvailable = false;
      return false;
    }
  }

  /**
   * Collect enrichment data from Prometheus
   */
  async collectEnrichment(): Promise<PrometheusEnrichment | null> {
    if (!this.prometheusClient || !this.isAvailable) {
      return this.lastEnrichment;
    }

    try {
      const [nodeCpu, nodeMemory, podCpu, podMemory, podRestarts] = await Promise.all([
        this.prometheusClient.getNodeCpuUsageByNode(),
        this.prometheusClient.getNodeMemoryUsageByNode(),
        this.prometheusClient.getPodCpuUsage(),
        this.prometheusClient.getPodMemoryUsage(),
        this.prometheusClient.getPodRestartCount(),
      ]);

      // Build node metrics map
      const nodeMetrics = new Map<string, { cpuPercent: number; memoryPercent: number; memoryUsed: number; memoryTotal: number }>();

      for (const cpu of nodeCpu) {
        nodeMetrics.set(cpu.node, {
          cpuPercent: cpu.cpuUsagePercent,
          memoryPercent: 0,
          memoryUsed: 0,
          memoryTotal: 0,
        });
      }

      for (const mem of nodeMemory) {
        const existing = nodeMetrics.get(mem.node);
        if (existing) {
          existing.memoryPercent = mem.memoryUsagePercent;
          existing.memoryUsed = mem.memoryUsedBytes;
          existing.memoryTotal = mem.memoryTotalBytes;
        } else {
          nodeMetrics.set(mem.node, {
            cpuPercent: 0,
            memoryPercent: mem.memoryUsagePercent,
            memoryUsed: mem.memoryUsedBytes,
            memoryTotal: mem.memoryTotalBytes,
          });
        }
      }

      // Build pod metrics map (key is namespace/pod)
      const podMetrics = new Map<string, { cpuMillicores: number; memoryBytes: number; restarts: number }>();

      for (const cpu of podCpu) {
        const key = `${cpu.namespace}/${cpu.pod}`;
        podMetrics.set(key, {
          cpuMillicores: cpu.cpuUsage,
          memoryBytes: 0,
          restarts: 0,
        });
      }

      for (const mem of podMemory) {
        const key = `${mem.namespace}/${mem.pod}`;
        const existing = podMetrics.get(key);
        if (existing) {
          existing.memoryBytes = mem.memoryUsage;
        } else {
          podMetrics.set(key, {
            cpuMillicores: 0,
            memoryBytes: mem.memoryUsage,
            restarts: 0,
          });
        }
      }

      for (const restart of podRestarts) {
        const key = `${restart.namespace}/${restart.pod}`;
        const existing = podMetrics.get(key);
        if (existing) {
          existing.restarts = restart.restarts;
        }
      }

      this.lastEnrichment = {
        nodeMetrics,
        podMetrics,
        lastUpdate: new Date().toISOString(),
      };

      return this.lastEnrichment;
    } catch (err) {
      console.error('[PrometheusCollector] Collection error:', err);
      return this.lastEnrichment;
    }
  }

  /**
   * Enrich node metrics with Prometheus data
   */
  enrichNodeMetrics(nodes: NodeMetrics[]): NodeMetrics[] {
    if (!this.lastEnrichment) return nodes;

    return nodes.map(node => {
      const promData = this.lastEnrichment!.nodeMetrics.get(node.name);
      if (!promData) return node;

      return {
        ...node,
        cpu: {
          ...node.cpu,
          percent: Math.round(promData.cpuPercent),
        },
        memory: {
          ...node.memory,
          percent: Math.round(promData.memoryPercent),
          used: promData.memoryUsed,
          total: promData.memoryTotal,
        },
      };
    });
  }

  /**
   * Enrich service metrics with Prometheus data
   */
  enrichServiceMetrics(services: ServiceMetrics[]): ServiceMetrics[] {
    if (!this.lastEnrichment) return services;

    return services.map(svc => {
      const key = `${svc.namespace}/${svc.name}`;
      const promData = this.lastEnrichment!.podMetrics.get(key);
      if (!promData) return svc;

      return {
        ...svc,
        cpu: {
          ...svc.cpu,
          used: Math.round(promData.cpuMillicores),
        },
        memory: {
          ...svc.memory,
          used: promData.memoryBytes,
        },
        // Only update restarts if Prometheus has a higher count (more accurate)
        restarts: Math.max(svc.restarts, promData.restarts),
      };
    });
  }

  /**
   * Get historical data for a node
   */
  async getNodeHistory(nodeName: string, duration: string = '5m'): Promise<{
    cpu: Array<{ timestamp: number; value: number }>;
    memory: Array<{ timestamp: number; value: number }>;
  }> {
    if (!this.prometheusClient || !this.isAvailable) {
      return { cpu: [], memory: [] };
    }

    try {
      const [cpu, memory] = await Promise.all([
        this.prometheusClient.getNodeCpuHistory(nodeName, duration),
        this.prometheusClient.getNodeMemoryHistory(nodeName, duration),
      ]);

      return { cpu, memory };
    } catch (err) {
      console.error('[PrometheusCollector] History error:', err);
      return { cpu: [], memory: [] };
    }
  }

  /**
   * Get historical data for a pod
   */
  async getPodHistory(namespace: string, podName: string, duration: string = '5m'): Promise<{
    cpu: Array<{ timestamp: number; value: number }>;
    memory: Array<{ timestamp: number; value: number }>;
  }> {
    if (!this.prometheusClient || !this.isAvailable) {
      return { cpu: [], memory: [] };
    }

    try {
      const [cpu, memory] = await Promise.all([
        this.prometheusClient.getPodCpuHistory(namespace, podName, duration),
        this.prometheusClient.getPodMemoryHistory(namespace, podName, duration),
      ]);

      return { cpu, memory };
    } catch (err) {
      console.error('[PrometheusCollector] Pod history error:', err);
      return { cpu: [], memory: [] };
    }
  }

  /**
   * Check if Prometheus enrichment is available
   */
  isEnrichmentAvailable(): boolean {
    return this.isAvailable && this.lastEnrichment !== null;
  }

  /**
   * Get last enrichment timestamp
   */
  getLastEnrichmentTime(): string | null {
    return this.lastEnrichment?.lastUpdate || null;
  }
}
