import { Injectable } from '@nestjs/common';
import { BaseApiClient } from './base-api.client';
import {
  ApiEndpoint,
  ApiHealthStatus,
  ConsulState,
  ConsulService,
  ConsulHealthCheck,
} from './interfaces/api.interface';

/**
 * Consul API v1 client
 */
@Injectable()
export class ConsulClient extends BaseApiClient {
  protected serviceName = 'consul';
  protected defaultEndpoint: ApiEndpoint = {
    host: 'consul.consul.svc.cluster.local',
    port: 8500,
    protocol: 'http',
    basePath: '/v1',
  };

  /**
   * Check Consul health
   */
  async checkHealth(): Promise<{ status: ApiHealthStatus; message?: string }> {
    const response = await this.fetch<string>('/status/leader');

    if (!response.success) {
      return {
        status: ApiHealthStatus.UNAVAILABLE,
        message: response.error,
      };
    }

    if (!response.data || response.data === '""') {
      return {
        status: ApiHealthStatus.DEGRADED,
        message: 'No leader elected',
      };
    }

    return { status: ApiHealthStatus.HEALTHY };
  }

  /**
   * Get cluster leader
   */
  async getLeader(): Promise<string | null> {
    const response = await this.fetch<string>('/status/leader');
    return response.success && response.data ? response.data.replace(/"/g, '') : null;
  }

  /**
   * List all registered services
   */
  async listServices(): Promise<ConsulService[]> {
    const response = await this.fetch<Record<string, string[]>>('/agent/services');

    if (!response.success || !response.data) {
      return [];
    }

    // Get detailed info for each service
    const services: ConsulService[] = [];

    for (const [id, details] of Object.entries(response.data as Record<string, any>)) {
      services.push({
        id,
        name: details.Service || id,
        address: details.Address || '',
        port: details.Port || 0,
        tags: details.Tags || [],
        meta: details.Meta || {},
        status: 'passing', // Will be updated from health checks
      });
    }

    return services;
  }

  /**
   * Get health checks for a service
   */
  async getServiceHealth(serviceName: string): Promise<ConsulHealthCheck[]> {
    const response = await this.fetch<any[]>(`/health/service/${serviceName}`);

    if (!response.success || !response.data) {
      return [];
    }

    const checks: ConsulHealthCheck[] = [];

    for (const entry of response.data) {
      for (const check of entry.Checks || []) {
        checks.push({
          node: entry.Node?.Node || '',
          checkId: check.CheckID,
          name: check.Name,
          status: check.Status.toLowerCase() as 'passing' | 'warning' | 'critical',
          output: check.Output || '',
          serviceId: check.ServiceID || '',
          serviceName: check.ServiceName || '',
        });
      }
    }

    return checks;
  }

  /**
   * Get all health checks
   */
  async getAllHealthChecks(): Promise<ConsulHealthCheck[]> {
    const response = await this.fetch<Record<string, any>>('/agent/checks');

    if (!response.success || !response.data) {
      return [];
    }

    return Object.entries(response.data).map(([id, check]) => ({
      node: check.Node || '',
      checkId: id,
      name: check.Name || id,
      status: (check.Status || 'unknown').toLowerCase() as 'passing' | 'warning' | 'critical',
      output: check.Output || '',
      serviceId: check.ServiceID || '',
      serviceName: check.ServiceName || '',
    }));
  }

  /**
   * Get full Consul state
   */
  async getState(): Promise<ConsulState> {
    const [leader, services, checks] = await Promise.all([
      this.getLeader(),
      this.listServices(),
      this.getAllHealthChecks(),
    ]);

    const failingChecks = checks.filter(
      (c) => c.status === 'critical' || c.status === 'warning',
    ).length;

    // Update service status based on health checks
    for (const service of services) {
      const serviceChecks = checks.filter((c) => c.serviceName === service.name);
      if (serviceChecks.some((c) => c.status === 'critical')) {
        service.status = 'critical';
      } else if (serviceChecks.some((c) => c.status === 'warning')) {
        service.status = 'warning';
      }
    }

    return {
      available: leader !== null,
      leader: leader || undefined,
      services,
      healthChecks: checks,
      failingChecks,
      lastUpdated: new Date().toISOString(),
    };
  }
}
