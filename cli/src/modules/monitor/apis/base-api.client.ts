import { Injectable } from '@nestjs/common';
import { spawn } from 'child_process';
import {
  ApiResponse,
  ApiEndpoint,
  ApiClientOptions,
  ApiHealthStatus,
  DEFAULT_API_OPTIONS,
} from './interfaces/api.interface';

/**
 * Base API client with retry, timeout, and error handling
 */
@Injectable()
export abstract class BaseApiClient {
  protected abstract serviceName: string;
  protected abstract defaultEndpoint: ApiEndpoint;
  protected options: ApiClientOptions = DEFAULT_API_OPTIONS;

  /**
   * Set client options
   */
  setOptions(options: Partial<ApiClientOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Build URL from endpoint and path
   */
  protected buildUrl(path: string, endpoint?: ApiEndpoint): string {
    const ep = endpoint || this.defaultEndpoint;
    return `${ep.protocol}://${ep.host}:${ep.port}${ep.basePath}${path}`;
  }

  /**
   * Fetch with timeout and retry
   */
  protected async fetch<T>(
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      body?: unknown;
      headers?: Record<string, string>;
    } = {},
  ): Promise<ApiResponse<T>> {
    const startTime = Date.now();
    const url = this.buildUrl(path);

    let lastError: string | undefined;

    for (let attempt = 0; attempt <= this.options.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

        const response = await Bun.fetch(url, {
          method: options.method || 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          lastError = `HTTP ${response.status}: ${response.statusText}`;
          if (attempt < this.options.retries) {
            await this.delay(this.options.retryDelay);
            continue;
          }
        }

        const data = (await response.json()) as T;
        return {
          success: true,
          data,
          responseTime: Date.now() - startTime,
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        if (attempt < this.options.retries) {
          await this.delay(this.options.retryDelay);
        }
      }
    }

    return {
      success: false,
      error: lastError,
      responseTime: Date.now() - startTime,
    };
  }

  /**
   * Port-forward and fetch (for in-cluster services)
   */
  protected async fetchViaPortForward<T>(
    namespace: string,
    service: string,
    port: number,
    path: string,
  ): Promise<ApiResponse<T>> {
    const startTime = Date.now();
    const localPort = 30000 + Math.floor(Math.random() * 5000);

    // Start port-forward
    const portForward = spawn('kubectl', [
      'port-forward',
      '-n',
      namespace,
      `svc/${service}`,
      `${localPort}:${port}`,
    ]);

    // Wait for port-forward to be ready
    await this.delay(1000);

    try {
      const response = await this.fetch<T>(path, {});

      // Override URL to use local port
      const url = `http://127.0.0.1:${localPort}${path}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

      const fetchResponse = await Bun.fetch(url, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!fetchResponse.ok) {
        return {
          success: false,
          error: `HTTP ${fetchResponse.status}`,
          responseTime: Date.now() - startTime,
        };
      }

      const data = (await fetchResponse.json()) as T;
      return {
        success: true,
        data,
        responseTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        responseTime: Date.now() - startTime,
      };
    } finally {
      portForward.kill();
    }
  }

  /**
   * Check API health
   */
  abstract checkHealth(): Promise<{ status: ApiHealthStatus; message?: string }>;

  /**
   * Delay helper
   */
  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Parse error response
   */
  protected parseError(error: unknown): string {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return 'Request timeout';
      }
      return error.message;
    }
    return String(error);
  }
}
