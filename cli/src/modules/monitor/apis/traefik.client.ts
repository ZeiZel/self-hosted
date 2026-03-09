import { Injectable } from '@nestjs/common';
import { BaseApiClient } from './base-api.client';
import {
  ApiEndpoint,
  ApiHealthStatus,
  TraefikState,
  TraefikRouter,
  TraefikService,
  TraefikOverview,
} from './interfaces/api.interface';

/**
 * Traefik dashboard API client
 */
@Injectable()
export class TraefikClient extends BaseApiClient {
  protected serviceName = 'traefik';
  protected defaultEndpoint: ApiEndpoint = {
    host: 'traefik.ingress.svc.cluster.local',
    port: 9000,
    protocol: 'http',
    basePath: '/api',
  };

  /**
   * Check Traefik health
   */
  async checkHealth(): Promise<{ status: ApiHealthStatus; message?: string }> {
    const response = await this.fetch<{ overview: TraefikOverview }>('/overview');

    if (!response.success) {
      return {
        status: ApiHealthStatus.UNAVAILABLE,
        message: response.error,
      };
    }

    const overview = response.data?.overview;
    if (!overview) {
      return {
        status: ApiHealthStatus.DEGRADED,
        message: 'Invalid response format',
      };
    }

    // Check for errors
    const httpErrors =
      (overview.http?.routers?.errors || 0) + (overview.http?.services?.errors || 0);

    if (httpErrors > 0) {
      return {
        status: ApiHealthStatus.DEGRADED,
        message: `${httpErrors} configuration errors`,
      };
    }

    return { status: ApiHealthStatus.HEALTHY };
  }

  /**
   * Get dashboard overview
   */
  async getOverview(): Promise<TraefikOverview | null> {
    const response = await this.fetch<TraefikOverview>('/overview');
    return response.success ? response.data || null : null;
  }

  /**
   * List HTTP routers
   */
  async getHttpRouters(): Promise<TraefikRouter[]> {
    const response = await this.fetch<
      Array<{
        name: string;
        rule: string;
        service: string;
        entryPoints: string[];
        status: string;
        middlewares?: string[];
        tls?: { certResolver?: string };
        provider?: string;
      }>
    >('/http/routers');

    if (!response.success || !response.data) {
      return [];
    }

    return response.data.map((router) => ({
      name: router.name,
      rule: router.rule,
      service: router.service,
      entryPoints: router.entryPoints || [],
      status: router.status === 'enabled' ? 'enabled' : 'disabled',
      middlewares: router.middlewares,
      tls: !!router.tls,
    }));
  }

  /**
   * List HTTP services
   */
  async getHttpServices(): Promise<TraefikService[]> {
    const response = await this.fetch<
      Array<{
        name: string;
        type: string;
        status: string;
        loadBalancer?: {
          servers: Array<{ url: string }>;
          healthCheck?: {
            scheme: string;
            path: string;
            interval: string;
          };
        };
        provider?: string;
      }>
    >('/http/services');

    if (!response.success || !response.data) {
      return [];
    }

    return response.data.map((service) => ({
      name: service.name,
      type: service.type as 'loadbalancer' | 'weighted' | 'mirroring',
      status: service.status === 'enabled' ? 'enabled' : 'disabled',
      loadBalancer: service.loadBalancer,
    }));
  }

  /**
   * Get HTTP middlewares
   */
  async getHttpMiddlewares(): Promise<Array<{ name: string; type: string; status: string }>> {
    const response = await this.fetch<
      Array<{
        name: string;
        type: string;
        status: string;
      }>
    >('/http/middlewares');

    if (!response.success || !response.data) {
      return [];
    }

    return response.data.map((mw) => ({
      name: mw.name,
      type: mw.type,
      status: mw.status,
    }));
  }

  /**
   * Get entrypoints
   */
  async getEntrypoints(): Promise<Array<{ name: string; address: string }>> {
    const response = await this.fetch<
      Array<{
        name: string;
        address: string;
      }>
    >('/entrypoints');

    if (!response.success || !response.data) {
      return [];
    }

    return response.data;
  }

  /**
   * Get routers with errors
   */
  async getRoutersWithErrors(): Promise<TraefikRouter[]> {
    const routers = await this.getHttpRouters();
    return routers.filter((r) => r.status === 'disabled');
  }

  /**
   * Get services with errors
   */
  async getServicesWithErrors(): Promise<TraefikService[]> {
    const services = await this.getHttpServices();
    return services.filter((s) => s.status === 'disabled');
  }

  /**
   * Search routers by rule pattern
   */
  async searchRouters(pattern: string): Promise<TraefikRouter[]> {
    const routers = await this.getHttpRouters();
    const regex = new RegExp(pattern, 'i');
    return routers.filter((r) => regex.test(r.rule) || regex.test(r.name));
  }

  /**
   * Get full Traefik state
   */
  async getState(): Promise<TraefikState> {
    const [overview, routers, services] = await Promise.all([
      this.getOverview(),
      this.getHttpRouters(),
      this.getHttpServices(),
    ]);

    const errorCount =
      routers.filter((r) => r.status === 'disabled').length +
      services.filter((s) => s.status === 'disabled').length;

    return {
      available: overview !== null,
      overview: overview || undefined,
      routers,
      services,
      errorCount,
      lastUpdated: new Date().toISOString(),
    };
  }
}
