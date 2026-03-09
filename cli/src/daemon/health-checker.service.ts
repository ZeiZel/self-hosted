import { Injectable, Inject } from '@nestjs/common';
import { ClusterClientService } from '../modules/monitor/cluster-client.service';
import {
  DaemonCheckType,
  DaemonHealthStatus,
  DaemonHealthLog,
  HealthCheckResult,
  mapNodeHealthToDaemonStatus,
} from './interfaces/daemon.interface';
import { NodeHealth, PodStatus } from '../interfaces/monitor.interface';

/**
 * Service for performing health checks on cluster components
 */
@Injectable()
export class HealthCheckerService {
  constructor(
    @Inject(ClusterClientService)
    private readonly clusterClient: ClusterClientService,
  ) {}

  /**
   * Perform full health check
   */
  async performHealthCheck(): Promise<HealthCheckResult> {
    const [nodes, services] = await Promise.all([
      this.checkNodes(),
      this.checkServices(),
    ]);

    // API checks would be added in Task 3
    const apis: HealthCheckResult['apis'] = [];

    return {
      nodes,
      services,
      apis,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Check all nodes
   */
  async checkNodes(): Promise<HealthCheckResult['nodes']> {
    const nodeMetrics = await this.clusterClient.getNodeMetrics();

    return nodeMetrics.map((node) => ({
      name: node.name,
      status: mapNodeHealthToDaemonStatus(node.health),
      cpu: node.cpu.percent,
      memory: node.memory.percent,
      message: this.getNodeMessage(node.health, node.cpu.percent, node.memory.percent),
    }));
  }

  /**
   * Check all services/pods
   */
  async checkServices(): Promise<HealthCheckResult['services']> {
    const serviceMetrics = await this.clusterClient.getServiceMetrics();

    return serviceMetrics.map((service) => ({
      name: service.name,
      namespace: service.namespace,
      status: this.mapPodStatusToDaemonStatus(service.status),
      restarts: service.restarts,
      message: this.getServiceMessage(service.status, service.restarts),
    }));
  }

  /**
   * Convert health check result to log entries
   */
  convertToLogs(result: HealthCheckResult): DaemonHealthLog[] {
    const logs: DaemonHealthLog[] = [];
    const timestamp = result.timestamp;

    // Node logs
    for (const node of result.nodes) {
      if (node.status !== DaemonHealthStatus.HEALTHY) {
        logs.push({
          checkType: DaemonCheckType.NODE,
          target: node.name,
          status: node.status,
          message: node.message,
          metadata: {
            cpu: node.cpu,
            memory: node.memory,
          },
          timestamp,
        });
      }
    }

    // Service logs
    for (const service of result.services) {
      if (service.status !== DaemonHealthStatus.HEALTHY) {
        logs.push({
          checkType: DaemonCheckType.SERVICE,
          target: `${service.namespace}/${service.name}`,
          status: service.status,
          message: service.message,
          metadata: {
            restarts: service.restarts,
          },
          timestamp,
        });
      }
    }

    // API logs
    for (const api of result.apis) {
      if (api.status !== DaemonHealthStatus.HEALTHY) {
        logs.push({
          checkType: DaemonCheckType.API,
          target: api.name,
          status: api.status,
          message: api.message,
          metadata: {
            responseTime: api.responseTime,
          },
          timestamp,
        });
      }
    }

    return logs;
  }

  /**
   * Get summary of health check result
   */
  getSummary(result: HealthCheckResult): {
    healthy: number;
    degraded: number;
    critical: number;
    unknown: number;
  } {
    const allStatuses = [
      ...result.nodes.map((n) => n.status),
      ...result.services.map((s) => s.status),
      ...result.apis.map((a) => a.status),
    ];

    return {
      healthy: allStatuses.filter((s) => s === DaemonHealthStatus.HEALTHY).length,
      degraded: allStatuses.filter((s) => s === DaemonHealthStatus.DEGRADED).length,
      critical: allStatuses.filter((s) => s === DaemonHealthStatus.CRITICAL).length,
      unknown: allStatuses.filter((s) => s === DaemonHealthStatus.UNKNOWN).length,
    };
  }

  /**
   * Map pod status to daemon health status
   */
  private mapPodStatusToDaemonStatus(status: PodStatus): DaemonHealthStatus {
    switch (status) {
      case PodStatus.RUNNING:
      case PodStatus.SUCCEEDED:
        return DaemonHealthStatus.HEALTHY;
      case PodStatus.PENDING:
        return DaemonHealthStatus.DEGRADED;
      case PodStatus.FAILED:
      case PodStatus.CRASH_LOOP:
      case PodStatus.IMAGE_PULL:
      case PodStatus.ERROR:
        return DaemonHealthStatus.CRITICAL;
      default:
        return DaemonHealthStatus.UNKNOWN;
    }
  }

  /**
   * Generate message for node health
   */
  private getNodeMessage(health: NodeHealth, cpu: number, memory: number): string | undefined {
    if (health === NodeHealth.HEALTHY) return undefined;

    const issues: string[] = [];
    if (cpu >= 90) issues.push(`CPU critical at ${cpu}%`);
    else if (cpu >= 75) issues.push(`CPU high at ${cpu}%`);
    if (memory >= 95) issues.push(`Memory critical at ${memory}%`);
    else if (memory >= 80) issues.push(`Memory high at ${memory}%`);

    return issues.join(', ') || undefined;
  }

  /**
   * Generate message for service health
   */
  private getServiceMessage(status: PodStatus, restarts: number): string | undefined {
    const messages: string[] = [];

    if (status === PodStatus.CRASH_LOOP) {
      messages.push('Pod in CrashLoopBackOff');
    } else if (status === PodStatus.IMAGE_PULL) {
      messages.push('Image pull failed');
    } else if (status === PodStatus.FAILED) {
      messages.push('Pod failed');
    } else if (status === PodStatus.PENDING) {
      messages.push('Pod pending');
    }

    if (restarts >= 10) {
      messages.push(`High restart count (${restarts})`);
    } else if (restarts >= 3) {
      messages.push(`Elevated restarts (${restarts})`);
    }

    return messages.length > 0 ? messages.join(', ') : undefined;
  }
}
