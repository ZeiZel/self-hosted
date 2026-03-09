import { Injectable } from '@nestjs/common';
import { spawn } from 'child_process';
import {
  NodeMetrics,
  ServiceMetrics,
  ClusterSummary,
  NodeHealth,
  PodStatus,
  NodeCondition,
  calculateHealth,
} from '../../interfaces/monitor.interface';
import { MachineRole } from '../../interfaces/machine.interface';

/**
 * Result of kubectl execution
 */
interface KubectlResult {
  success: boolean;
  stdout: string;
  stderr: string;
}

/**
 * Service for interacting with Kubernetes cluster via kubectl
 */
@Injectable()
export class ClusterClientService {
  private kubeconfig?: string;

  /**
   * Set kubeconfig path
   */
  setKubeconfig(path: string): void {
    this.kubeconfig = path;
  }

  /**
   * Execute kubectl command
   */
  private async kubectl(args: string[]): Promise<KubectlResult> {
    return new Promise((resolve) => {
      const fullArgs = this.kubeconfig
        ? ['--kubeconfig', this.kubeconfig, ...args]
        : args;

      const proc = spawn('kubectl', fullArgs);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        });
      });

      proc.on('error', (err) => {
        resolve({
          success: false,
          stdout: '',
          stderr: err.message,
        });
      });
    });
  }

  /**
   * Get node metrics
   */
  async getNodeMetrics(): Promise<NodeMetrics[]> {
    // Get nodes with resources
    const nodesResult = await this.kubectl([
      'get', 'nodes',
      '-o', 'json',
    ]);

    if (!nodesResult.success) {
      return this.getMockNodeMetrics();
    }

    try {
      const nodesData = JSON.parse(nodesResult.stdout);

      // Get metrics if available
      const metricsResult = await this.kubectl([
        'top', 'nodes',
        '--no-headers',
      ]);

      const metricsMap = new Map<string, { cpu: number; memory: number }>();
      if (metricsResult.success) {
        const lines = metricsResult.stdout.split('\n');
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 5) {
            const name = parts[0];
            const cpuStr = parts[1]; // e.g., "234m" or "1234m"
            const memStr = parts[3]; // e.g., "1234Mi"

            metricsMap.set(name, {
              cpu: this.parseCpu(cpuStr),
              memory: this.parseMemory(memStr),
            });
          }
        }
      }

      const nodes: NodeMetrics[] = [];

      for (const node of nodesData.items || []) {
        const name = node.metadata?.name || 'unknown';
        const labels = node.metadata?.labels || {};

        // Parse capacity
        const capacity = node.status?.capacity || {};
        const totalCpu = this.parseCpu(capacity.cpu || '4');
        const totalMemory = this.parseMemory(capacity.memory || '8Gi');

        // Get actual usage from metrics
        const usage = metricsMap.get(name) || { cpu: 0, memory: 0 };

        // Parse conditions
        const conditions: NodeCondition[] = (node.status?.conditions || []).map(
          (c: any) => ({
            type: c.type,
            status: c.status,
            reason: c.reason,
            message: c.message,
          }),
        );

        // Determine roles
        const roles: MachineRole[] = [];
        if (labels['node-role.kubernetes.io/master'] !== undefined ||
            labels['node-role.kubernetes.io/control-plane'] !== undefined) {
          roles.push(MachineRole.MASTER);
        }
        if (labels['node-role.kubernetes.io/worker'] !== undefined || roles.length === 0) {
          roles.push(MachineRole.WORKER);
        }

        const cpuPercent = totalCpu > 0 ? Math.round((usage.cpu / totalCpu) * 100) : 0;
        const memPercent = totalMemory > 0 ? Math.round((usage.memory / totalMemory) * 100) : 0;

        nodes.push({
          name,
          ip: node.status?.addresses?.find((a: any) => a.type === 'InternalIP')?.address || '',
          roles,
          health: calculateHealth(cpuPercent, memPercent),
          cpu: {
            total: totalCpu,
            used: usage.cpu,
            percent: cpuPercent,
          },
          memory: {
            total: totalMemory,
            used: usage.memory,
            percent: memPercent,
          },
          pods: {
            total: 0, // Will be filled by pod query
            running: 0,
            pending: 0,
            failed: 0,
          },
          conditions,
          lastUpdated: new Date().toISOString(),
        });
      }

      // Get pod counts per node
      await this.enrichWithPodCounts(nodes);

      return nodes;
    } catch {
      return this.getMockNodeMetrics();
    }
  }

  /**
   * Get service/pod metrics
   */
  async getServiceMetrics(namespace?: string): Promise<ServiceMetrics[]> {
    const nsArg = namespace ? ['-n', namespace] : ['-A'];

    const result = await this.kubectl([
      'get', 'pods',
      ...nsArg,
      '-o', 'json',
    ]);

    if (!result.success) {
      return this.getMockServiceMetrics();
    }

    try {
      const podsData = JSON.parse(result.stdout);
      const services: ServiceMetrics[] = [];

      for (const pod of podsData.items || []) {
        const name = pod.metadata?.labels?.['app.kubernetes.io/name'] ||
                     pod.metadata?.labels?.['app'] ||
                     pod.metadata?.name || 'unknown';

        // Skip if we already have this service
        if (services.some((s) => s.name === name && s.namespace === pod.metadata?.namespace)) {
          continue;
        }

        const status = this.mapPodStatus(pod.status?.phase, pod.status?.containerStatuses);

        services.push({
          name,
          namespace: pod.metadata?.namespace || 'default',
          node: pod.spec?.nodeName || 'unknown',
          status,
          health: this.mapStatusToHealth(status),
          replicas: {
            desired: 1,
            ready: pod.status?.containerStatuses?.filter((c: any) => c.ready)?.length || 0,
            available: status === PodStatus.RUNNING ? 1 : 0,
          },
          cpu: {
            requested: this.parseCpu(
              pod.spec?.containers?.[0]?.resources?.requests?.cpu || '100m',
            ),
            limit: this.parseCpu(
              pod.spec?.containers?.[0]?.resources?.limits?.cpu || '1000m',
            ),
            used: 0, // Would need metrics-server
          },
          memory: {
            requested: this.parseMemory(
              pod.spec?.containers?.[0]?.resources?.requests?.memory || '128Mi',
            ),
            limit: this.parseMemory(
              pod.spec?.containers?.[0]?.resources?.limits?.memory || '512Mi',
            ),
            used: 0,
          },
          restarts: pod.status?.containerStatuses?.[0]?.restartCount || 0,
          age: this.calculateAge(pod.metadata?.creationTimestamp),
          lastUpdated: new Date().toISOString(),
        });
      }

      return services;
    } catch {
      return this.getMockServiceMetrics();
    }
  }

  /**
   * Get cluster summary
   */
  async getClusterSummary(): Promise<ClusterSummary> {
    const [nodes, services] = await Promise.all([
      this.getNodeMetrics(),
      this.getServiceMetrics(),
    ]);

    // Get namespace count
    const nsResult = await this.kubectl(['get', 'namespaces', '-o', 'json']);
    let namespaceCount = 11; // Default
    if (nsResult.success) {
      try {
        const nsData = JSON.parse(nsResult.stdout);
        namespaceCount = nsData.items?.length || 11;
      } catch {
        // Use default
      }
    }

    const totalCpu = nodes.reduce((sum, n) => sum + n.cpu.total, 0);
    const usedCpu = nodes.reduce((sum, n) => sum + n.cpu.used, 0);
    const totalMemory = nodes.reduce((sum, n) => sum + n.memory.total, 0);
    const usedMemory = nodes.reduce((sum, n) => sum + n.memory.used, 0);

    return {
      nodes: {
        total: nodes.length,
        healthy: nodes.filter((n) => n.health === NodeHealth.HEALTHY).length,
        warning: nodes.filter((n) => n.health === NodeHealth.WARNING).length,
        critical: nodes.filter((n) => n.health === NodeHealth.CRITICAL).length,
      },
      pods: {
        total: services.length,
        running: services.filter((s) => s.status === PodStatus.RUNNING).length,
        pending: services.filter((s) => s.status === PodStatus.PENDING).length,
        failed: services.filter(
          (s) =>
            s.status === PodStatus.FAILED ||
            s.status === PodStatus.CRASH_LOOP ||
            s.status === PodStatus.ERROR,
        ).length,
      },
      cpu: {
        total: totalCpu,
        used: usedCpu,
        percent: totalCpu > 0 ? Math.round((usedCpu / totalCpu) * 100) : 0,
      },
      memory: {
        total: totalMemory,
        used: usedMemory,
        percent: totalMemory > 0 ? Math.round((usedMemory / totalMemory) * 100) : 0,
      },
      namespaces: namespaceCount,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Check if kubectl is available and cluster is reachable
   */
  async checkConnection(): Promise<{ connected: boolean; error?: string }> {
    const result = await this.kubectl(['cluster-info']);
    return {
      connected: result.success,
      error: result.success ? undefined : result.stderr,
    };
  }

  /**
   * Enrich node metrics with pod counts
   */
  private async enrichWithPodCounts(nodes: NodeMetrics[]): Promise<void> {
    const result = await this.kubectl([
      'get', 'pods', '-A',
      '-o', 'jsonpath={range .items[*]}{.spec.nodeName}{" "}{.status.phase}{"\\n"}{end}',
    ]);

    if (!result.success) return;

    const podsByNode = new Map<string, { running: number; pending: number; failed: number }>();

    for (const line of result.stdout.split('\n')) {
      const [nodeName, phase] = line.trim().split(' ');
      if (!nodeName) continue;

      if (!podsByNode.has(nodeName)) {
        podsByNode.set(nodeName, { running: 0, pending: 0, failed: 0 });
      }

      const counts = podsByNode.get(nodeName)!;
      if (phase === 'Running') counts.running++;
      else if (phase === 'Pending') counts.pending++;
      else if (phase === 'Failed') counts.failed++;
    }

    for (const node of nodes) {
      const counts = podsByNode.get(node.name);
      if (counts) {
        node.pods = {
          total: counts.running + counts.pending + counts.failed,
          running: counts.running,
          pending: counts.pending,
          failed: counts.failed,
        };
      }
    }
  }

  /**
   * Parse CPU string to millicores
   */
  private parseCpu(cpu: string): number {
    if (!cpu) return 0;
    if (cpu.endsWith('m')) {
      return parseInt(cpu.slice(0, -1), 10);
    }
    return parseInt(cpu, 10) * 1000;
  }

  /**
   * Parse memory string to bytes
   */
  private parseMemory(memory: string): number {
    if (!memory) return 0;
    const units: Record<string, number> = {
      Ki: 1024,
      Mi: 1024 * 1024,
      Gi: 1024 * 1024 * 1024,
      Ti: 1024 * 1024 * 1024 * 1024,
      K: 1000,
      M: 1000 * 1000,
      G: 1000 * 1000 * 1000,
    };

    for (const [unit, multiplier] of Object.entries(units)) {
      if (memory.endsWith(unit)) {
        return parseInt(memory.slice(0, -unit.length), 10) * multiplier;
      }
    }

    return parseInt(memory, 10);
  }

  /**
   * Map pod phase to PodStatus
   */
  private mapPodStatus(phase: string, containerStatuses?: any[]): PodStatus {
    // Check container statuses for more specific states
    if (containerStatuses && containerStatuses.length > 0) {
      for (const cs of containerStatuses) {
        if (cs.state?.waiting?.reason === 'CrashLoopBackOff') {
          return PodStatus.CRASH_LOOP;
        }
        if (cs.state?.waiting?.reason === 'ImagePullBackOff') {
          return PodStatus.IMAGE_PULL;
        }
        if (cs.state?.terminated?.reason === 'Error') {
          return PodStatus.ERROR;
        }
      }
    }

    switch (phase) {
      case 'Running':
        return PodStatus.RUNNING;
      case 'Pending':
        return PodStatus.PENDING;
      case 'Succeeded':
        return PodStatus.SUCCEEDED;
      case 'Failed':
        return PodStatus.FAILED;
      case 'Terminating':
        return PodStatus.TERMINATING;
      default:
        return PodStatus.UNKNOWN;
    }
  }

  /**
   * Map pod status to health
   */
  private mapStatusToHealth(status: PodStatus): NodeHealth {
    switch (status) {
      case PodStatus.RUNNING:
      case PodStatus.SUCCEEDED:
        return NodeHealth.HEALTHY;
      case PodStatus.PENDING:
        return NodeHealth.WARNING;
      case PodStatus.FAILED:
      case PodStatus.CRASH_LOOP:
      case PodStatus.IMAGE_PULL:
      case PodStatus.ERROR:
        return NodeHealth.CRITICAL;
      default:
        return NodeHealth.UNKNOWN;
    }
  }

  /**
   * Calculate age string from timestamp
   */
  private calculateAge(timestamp?: string): string {
    if (!timestamp) return 'unknown';

    const created = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    const diffSecs = Math.floor(diffMs / 1000);

    if (diffSecs < 60) return `${diffSecs}s`;
    if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m`;
    if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h`;
    return `${Math.floor(diffSecs / 86400)}d`;
  }

  /**
   * Mock node metrics for testing/demo
   */
  private getMockNodeMetrics(): NodeMetrics[] {
    return [
      {
        name: 'master-01',
        ip: '192.168.1.10',
        roles: [MachineRole.MASTER],
        health: NodeHealth.HEALTHY,
        cpu: { total: 8000, used: 2400, percent: 30 },
        memory: { total: 16 * 1024 * 1024 * 1024, used: 8 * 1024 * 1024 * 1024, percent: 50 },
        pods: { total: 15, running: 14, pending: 1, failed: 0 },
        conditions: [{ type: 'Ready', status: 'True' }],
        lastUpdated: new Date().toISOString(),
      },
      {
        name: 'worker-01',
        ip: '192.168.1.11',
        roles: [MachineRole.WORKER],
        health: NodeHealth.WARNING,
        cpu: { total: 16000, used: 12000, percent: 75 },
        memory: { total: 32 * 1024 * 1024 * 1024, used: 28 * 1024 * 1024 * 1024, percent: 87 },
        pods: { total: 25, running: 23, pending: 0, failed: 2 },
        conditions: [{ type: 'Ready', status: 'True' }],
        lastUpdated: new Date().toISOString(),
      },
    ];
  }

  /**
   * Mock service metrics for testing/demo
   */
  private getMockServiceMetrics(): ServiceMetrics[] {
    return [
      {
        name: 'traefik',
        namespace: 'ingress',
        node: 'master-01',
        status: PodStatus.RUNNING,
        health: NodeHealth.HEALTHY,
        replicas: { desired: 1, ready: 1, available: 1 },
        cpu: { requested: 500, limit: 1000, used: 200 },
        memory: { requested: 128 * 1024 * 1024, limit: 512 * 1024 * 1024, used: 100 * 1024 * 1024 },
        restarts: 0,
        age: '5d',
        lastUpdated: new Date().toISOString(),
      },
      {
        name: 'postgresql',
        namespace: 'db',
        node: 'worker-01',
        status: PodStatus.RUNNING,
        health: NodeHealth.HEALTHY,
        replicas: { desired: 1, ready: 1, available: 1 },
        cpu: { requested: 2000, limit: 4000, used: 1500 },
        memory: {
          requested: 2 * 1024 * 1024 * 1024,
          limit: 4 * 1024 * 1024 * 1024,
          used: 1.5 * 1024 * 1024 * 1024,
        },
        restarts: 0,
        age: '5d',
        lastUpdated: new Date().toISOString(),
      },
      {
        name: 'gitlab',
        namespace: 'code',
        node: 'worker-01',
        status: PodStatus.RUNNING,
        health: NodeHealth.HEALTHY,
        replicas: { desired: 1, ready: 1, available: 1 },
        cpu: { requested: 4000, limit: 8000, used: 3000 },
        memory: {
          requested: 4 * 1024 * 1024 * 1024,
          limit: 8 * 1024 * 1024 * 1024,
          used: 5 * 1024 * 1024 * 1024,
        },
        restarts: 2,
        age: '3d',
        lastUpdated: new Date().toISOString(),
      },
    ];
  }
}
