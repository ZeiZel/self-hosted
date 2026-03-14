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

    if (results.length === 0 || !results[0].value) {
      return null;
    }

    const value = parseFloat(results[0].value[1]);
    return isNaN(value) ? null : value;
  }

  /**
   * Get cluster CPU usage
   */
  async getClusterCpuUsage(): Promise<number | null> {
    return this.getMetricValue('100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)');
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
      this.query('(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100'),
      this.query(
        '100 - ((node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) * 100)',
      ),
    ]);

    const nodeMap = new Map<string, { cpuUsage: number; memoryUsage: number; diskUsage: number }>();

    for (const result of cpuResults) {
      const node = result.metric.instance || result.metric.node || 'unknown';
      nodeMap.set(node, {
        cpuUsage: result.value ? parseFloat(result.value[1]) || 0 : 0,
        memoryUsage: 0,
        diskUsage: 0,
      });
    }

    for (const result of memResults) {
      const node = result.metric.instance || result.metric.node || 'unknown';
      const existing = nodeMap.get(node) || { cpuUsage: 0, memoryUsage: 0, diskUsage: 0 };
      existing.memoryUsage = result.value ? parseFloat(result.value[1]) || 0 : 0;
      nodeMap.set(node, existing);
    }

    for (const result of diskResults) {
      const node = result.metric.instance || result.metric.node || 'unknown';
      const existing = nodeMap.get(node) || { cpuUsage: 0, memoryUsage: 0, diskUsage: 0 };
      existing.diskUsage = result.value ? parseFloat(result.value[1]) || 0 : 0;
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

  /**
   * Execute range query
   */
  async queryRange(
    promql: string,
    start: Date,
    end: Date,
    step: string = '15s',
  ): Promise<PrometheusQueryResult[]> {
    const params = new URLSearchParams({
      query: promql,
      start: start.toISOString(),
      end: end.toISOString(),
      step,
    });

    const response = await this.fetch<{
      status: string;
      data: {
        resultType: string;
        result: PrometheusQueryResult[];
      };
    }>(`/query_range?${params.toString()}`);

    if (!response.success || response.data?.status !== 'success') {
      return [];
    }

    return response.data.data.result || [];
  }

  /**
   * Get pod CPU usage
   */
  async getPodCpuUsage(namespace?: string): Promise<Array<{
    pod: string;
    namespace: string;
    container: string;
    cpuUsage: number;
  }>> {
    const nsFilter = namespace ? `, namespace="${namespace}"` : '';
    const query = `sum(rate(container_cpu_usage_seconds_total{container!=""${nsFilter}}[5m])) by (pod, namespace, container) * 1000`;
    const results = await this.query(query);

    return results.map(result => ({
      pod: result.metric.pod || 'unknown',
      namespace: result.metric.namespace || 'unknown',
      container: result.metric.container || 'unknown',
      cpuUsage: result.value ? parseFloat(result.value[1]) || 0 : 0, // millicores
    }));
  }

  /**
   * Get pod memory usage
   */
  async getPodMemoryUsage(namespace?: string): Promise<Array<{
    pod: string;
    namespace: string;
    container: string;
    memoryUsage: number;
  }>> {
    const nsFilter = namespace ? `, namespace="${namespace}"` : '';
    const query = `sum(container_memory_working_set_bytes{container!=""${nsFilter}}) by (pod, namespace, container)`;
    const results = await this.query(query);

    return results.map(result => ({
      pod: result.metric.pod || 'unknown',
      namespace: result.metric.namespace || 'unknown',
      container: result.metric.container || 'unknown',
      memoryUsage: result.value ? parseFloat(result.value[1]) || 0 : 0, // bytes
    }));
  }

  /**
   * Get pod restart count
   */
  async getPodRestartCount(namespace?: string): Promise<Array<{
    pod: string;
    namespace: string;
    restarts: number;
  }>> {
    const nsFilter = namespace ? `, namespace="${namespace}"` : '';
    const query = `sum(kube_pod_container_status_restarts_total${nsFilter ? `{${nsFilter.slice(2)}}` : ''}) by (pod, namespace)`;
    const results = await this.query(query);

    return results.map(result => ({
      pod: result.metric.pod || 'unknown',
      namespace: result.metric.namespace || 'unknown',
      restarts: result.value ? parseInt(result.value[1], 10) || 0 : 0,
    }));
  }

  /**
   * Get node CPU usage per node
   */
  async getNodeCpuUsageByNode(): Promise<Array<{
    node: string;
    cpuUsagePercent: number;
  }>> {
    const query = '100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)';
    const results = await this.query(query);

    return results.map(result => ({
      node: this.extractNodeName(result.metric.instance || ''),
      cpuUsagePercent: result.value ? parseFloat(result.value[1]) || 0 : 0,
    }));
  }

  /**
   * Get node memory usage per node
   */
  async getNodeMemoryUsageByNode(): Promise<Array<{
    node: string;
    memoryUsagePercent: number;
    memoryUsedBytes: number;
    memoryTotalBytes: number;
  }>> {
    const [usageResults, totalResults] = await Promise.all([
      this.query('node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes'),
      this.query('node_memory_MemTotal_bytes'),
    ]);

    const nodeMap = new Map<string, { used: number; total: number }>();

    for (const result of totalResults) {
      const node = this.extractNodeName(result.metric.instance || '');
      nodeMap.set(node, {
        used: 0,
        total: result.value ? parseFloat(result.value[1]) || 0 : 0,
      });
    }

    for (const result of usageResults) {
      const node = this.extractNodeName(result.metric.instance || '');
      const existing = nodeMap.get(node);
      if (existing) {
        existing.used = result.value ? parseFloat(result.value[1]) || 0 : 0;
      }
    }

    return Array.from(nodeMap.entries()).map(([node, data]) => ({
      node,
      memoryUsagePercent: data.total > 0 ? (data.used / data.total) * 100 : 0,
      memoryUsedBytes: data.used,
      memoryTotalBytes: data.total,
    }));
  }

  /**
   * Get historical CPU usage for a node
   */
  async getNodeCpuHistory(
    nodeName: string,
    duration: string = '5m',
    step: string = '15s',
  ): Promise<Array<{ timestamp: number; value: number }>> {
    const end = new Date();
    const start = new Date(end.getTime() - this.parseDuration(duration));

    const query = `100 - (avg(rate(node_cpu_seconds_total{mode="idle", instance=~"${nodeName}.*"}[1m])) * 100)`;
    const results = await this.queryRange(query, start, end, step);

    if (results.length === 0) return [];

    const result = results[0];
    // For range queries, value is [timestamp, value] array
    return (result.values || []).map((v: [number, string]) => ({
      timestamp: v[0] * 1000, // Convert to ms
      value: parseFloat(v[1]) || 0,
    }));
  }

  /**
   * Get historical memory usage for a node
   */
  async getNodeMemoryHistory(
    nodeName: string,
    duration: string = '5m',
    step: string = '15s',
  ): Promise<Array<{ timestamp: number; value: number }>> {
    const end = new Date();
    const start = new Date(end.getTime() - this.parseDuration(duration));

    const query = `(1 - (node_memory_MemAvailable_bytes{instance=~"${nodeName}.*"} / node_memory_MemTotal_bytes{instance=~"${nodeName}.*"})) * 100`;
    const results = await this.queryRange(query, start, end, step);

    if (results.length === 0) return [];

    const result = results[0];
    return (result.values || []).map((v: [number, string]) => ({
      timestamp: v[0] * 1000,
      value: parseFloat(v[1]) || 0,
    }));
  }

  /**
   * Get pod CPU history
   */
  async getPodCpuHistory(
    namespace: string,
    podName: string,
    duration: string = '5m',
    step: string = '15s',
  ): Promise<Array<{ timestamp: number; value: number }>> {
    const end = new Date();
    const start = new Date(end.getTime() - this.parseDuration(duration));

    const query = `sum(rate(container_cpu_usage_seconds_total{namespace="${namespace}", pod="${podName}", container!=""}[1m])) * 1000`;
    const results = await this.queryRange(query, start, end, step);

    if (results.length === 0) return [];

    const result = results[0];
    return (result.values || []).map((v: [number, string]) => ({
      timestamp: v[0] * 1000,
      value: parseFloat(v[1]) || 0,
    }));
  }

  /**
   * Get pod memory history
   */
  async getPodMemoryHistory(
    namespace: string,
    podName: string,
    duration: string = '5m',
    step: string = '15s',
  ): Promise<Array<{ timestamp: number; value: number }>> {
    const end = new Date();
    const start = new Date(end.getTime() - this.parseDuration(duration));

    const query = `sum(container_memory_working_set_bytes{namespace="${namespace}", pod="${podName}", container!=""})`;
    const results = await this.queryRange(query, start, end, step);

    if (results.length === 0) return [];

    const result = results[0];
    return (result.values || []).map((v: [number, string]) => ({
      timestamp: v[0] * 1000,
      value: parseFloat(v[1]) || 0,
    }));
  }

  /**
   * Extract node name from instance string (removes port)
   */
  private extractNodeName(instance: string): string {
    return instance.split(':')[0];
  }

  /**
   * Parse duration string to milliseconds
   */
  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return 5 * 60 * 1000; // default 5 minutes

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return 5 * 60 * 1000;
    }
  }
}
