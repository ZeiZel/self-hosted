import { Injectable } from '@nestjs/common';
import { BaseApiClient } from './base-api.client';
import {
  ApiEndpoint,
  ApiHealthStatus,
  PrometheusState,
  PrometheusAlert,
  PrometheusQueryResult,
} from './interfaces/api.interface';

/**
 * Prometheus API client
 */
@Injectable()
export class PrometheusClient extends BaseApiClient {
  protected serviceName = 'prometheus';
  protected defaultEndpoint: ApiEndpoint = {
    host: 'prometheus.monitoring.svc.cluster.local',
    port: 9090,
    protocol: 'http',
    basePath: '/api/v1',
  };

  /**
   * Check Prometheus health
   */
  async checkHealth(): Promise<{ status: ApiHealthStatus; message?: string }> {
    const response = await this.fetch<{ status: string }>('/status/runtimeinfo');

    if (!response.success) {
      return {
        status: ApiHealthStatus.UNAVAILABLE,
        message: response.error,
      };
    }

    return { status: ApiHealthStatus.HEALTHY };
  }

  /**
   * Execute instant query
   */
  async query(promql: string): Promise<PrometheusQueryResult[]> {
    const response = await this.fetch<{
      status: string;
      data: {
        resultType: string;
        result: PrometheusQueryResult[];
      };
    }>(`/query?query=${encodeURIComponent(promql)}`);

    if (!response.success || response.data?.status !== 'success') {
      return [];
    }

    return response.data.data.result || [];
  }

  /**
   * Get active alerts
   */
  async getAlerts(): Promise<PrometheusAlert[]> {
    const response = await this.fetch<{
      status: string;
      data: {
        alerts: Array<{
          labels: Record<string, string>;
          annotations: Record<string, string>;
          state: 'firing' | 'pending' | 'inactive';
          activeAt?: string;
          value?: string;
        }>;
      };
    }>('/alerts');

    if (!response.success || response.data?.status !== 'success') {
      return [];
    }

    return response.data.data.alerts || [];
  }

  /**
   * Get firing alerts only
   */
  async getFiringAlerts(): Promise<PrometheusAlert[]> {
    const alerts = await this.getAlerts();
    return alerts.filter((a) => a.state === 'firing');
  }

  /**
   * Get pending alerts
   */
  async getPendingAlerts(): Promise<PrometheusAlert[]> {
    const alerts = await this.getAlerts();
    return alerts.filter((a) => a.state === 'pending');
  }

  /**
   * Get specific metric value
   */
  async getMetricValue(metric: string): Promise<number | null> {
    const results = await this.query(metric);

    if (results.length === 0) {
      return null;
    }

    const value = parseFloat(results[0].value[1]);
    return isNaN(value) ? null : value;
  }

  /**
   * Get cluster CPU usage
   */
  async getClusterCpuUsage(): Promise<number | null> {
    return this.getMetricValue(
      '100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)',
    );
  }

  /**
   * Get cluster memory usage
   */
  async getClusterMemoryUsage(): Promise<number | null> {
    return this.getMetricValue(
      '(1 - (sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes))) * 100',
    );
  }

  /**
   * Get node metrics
   */
  async getNodeMetrics(): Promise<
    Array<{
      node: string;
      cpuUsage: number;
      memoryUsage: number;
      diskUsage: number;
    }>
  > {
    const [cpuResults, memResults, diskResults] = await Promise.all([
      this.query('100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)'),
      this.query(
        '(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100',
      ),
      this.query(
        '100 - ((node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) * 100)',
      ),
    ]);

    const nodeMap = new Map<
      string,
      { cpuUsage: number; memoryUsage: number; diskUsage: number }
    >();

    for (const result of cpuResults) {
      const node = result.metric.instance || result.metric.node || 'unknown';
      nodeMap.set(node, {
        cpuUsage: parseFloat(result.value[1]) || 0,
        memoryUsage: 0,
        diskUsage: 0,
      });
    }

    for (const result of memResults) {
      const node = result.metric.instance || result.metric.node || 'unknown';
      const existing = nodeMap.get(node) || { cpuUsage: 0, memoryUsage: 0, diskUsage: 0 };
      existing.memoryUsage = parseFloat(result.value[1]) || 0;
      nodeMap.set(node, existing);
    }

    for (const result of diskResults) {
      const node = result.metric.instance || result.metric.node || 'unknown';
      const existing = nodeMap.get(node) || { cpuUsage: 0, memoryUsage: 0, diskUsage: 0 };
      existing.diskUsage = parseFloat(result.value[1]) || 0;
      nodeMap.set(node, existing);
    }

    return Array.from(nodeMap.entries()).map(([node, metrics]) => ({
      node,
      ...metrics,
    }));
  }

  /**
   * Get full Prometheus state
   */
  async getState(): Promise<PrometheusState> {
    const healthCheck = await this.checkHealth();
    const alerts = await this.getAlerts();

    return {
      available: healthCheck.status === ApiHealthStatus.HEALTHY,
      alerts,
      firingAlerts: alerts.filter((a) => a.state === 'firing').length,
      pendingAlerts: alerts.filter((a) => a.state === 'pending').length,
      lastUpdated: new Date().toISOString(),
    };
  }
}
