import { Injectable } from '@nestjs/common';
import * as https from 'https';
import * as http from 'http';
import * as dns from 'dns';
import * as tls from 'tls';
import { promisify } from 'util';

/**
 * Endpoint health status
 */
export interface EndpointHealth {
  url: string;
  status: 'up' | 'down' | 'degraded' | 'unknown';
  responseTime: number;
  statusCode?: number;
  tlsValid?: boolean;
  tlsExpiry?: Date;
  resolvedIp?: string;
  lastChecked: Date;
  error?: string;
}

const dnsLookup = promisify(dns.lookup);

/**
 * Endpoint check configuration
 */
export interface EndpointCheckConfig {
  url: string;
  timeout?: number;        // ms, default 5000
  followRedirects?: boolean;
  validateTls?: boolean;
}

/**
 * Service for checking HTTP/HTTPS endpoint health
 */
@Injectable()
export class EndpointCheckerService {
  private readonly defaultTimeout = 5000;

  /**
   * Check a single endpoint
   */
  async checkEndpoint(config: EndpointCheckConfig): Promise<EndpointHealth> {
    const {
      url,
      timeout = this.defaultTimeout,
      followRedirects = true,
      validateTls = true,
    } = config;

    const startTime = Date.now();

    try {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';

      // DNS resolution
      const resolvedIp = await this.resolveHost(parsedUrl.hostname);

      // HTTP request
      const response = await this.makeRequest(url, timeout, followRedirects);
      const responseTime = Date.now() - startTime;

      // TLS check for HTTPS
      let tlsValid: boolean | undefined;
      let tlsExpiry: Date | undefined;

      if (isHttps && validateTls) {
        const tlsInfo = await this.checkTls(parsedUrl.hostname, parseInt(parsedUrl.port || '443', 10));
        tlsValid = tlsInfo.valid;
        tlsExpiry = tlsInfo.expiry;
      }

      // Determine status
      let status: EndpointHealth['status'] = 'unknown';
      if (response.statusCode && response.statusCode >= 200 && response.statusCode < 400) {
        status = 'up';
      } else if (response.statusCode && response.statusCode >= 400 && response.statusCode < 500) {
        status = 'degraded';
      } else if (response.statusCode && response.statusCode >= 500) {
        status = 'down';
      }

      // Check response time threshold
      if (status === 'up' && responseTime > 2000) {
        status = 'degraded';
      }

      return {
        url,
        status,
        responseTime,
        statusCode: response.statusCode,
        tlsValid,
        tlsExpiry,
        resolvedIp,
        lastChecked: new Date(),
      };
    } catch (error) {
      return {
        url,
        status: 'down',
        responseTime: Date.now() - startTime,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check multiple endpoints in parallel
   */
  async checkEndpoints(configs: EndpointCheckConfig[]): Promise<EndpointHealth[]> {
    return Promise.all(configs.map(config => this.checkEndpoint(config)));
  }

  /**
   * Resolve hostname to IP
   */
  private async resolveHost(hostname: string): Promise<string | undefined> {
    try {
      const result = await dnsLookup(hostname);
      return result.address;
    } catch {
      return undefined;
    }
  }

  /**
   * Make HTTP/HTTPS request
   */
  private makeRequest(
    url: string,
    timeout: number,
    followRedirects: boolean
  ): Promise<{ statusCode?: number }> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        timeout,
        headers: {
          'User-Agent': 'selfhost-monitor/1.0',
          'Accept': '*/*',
        },
        rejectUnauthorized: true,
      };

      const req = client.request(options, (res) => {
        // Handle redirects
        if (followRedirects && res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, url).toString();
          this.makeRequest(redirectUrl, timeout, followRedirects)
            .then(resolve)
            .catch(reject);
          return;
        }

        // Consume response body to free up connection
        res.resume();
        resolve({ statusCode: res.statusCode });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.end();
    });
  }

  /**
   * Check TLS certificate
   */
  private checkTls(hostname: string, port: number): Promise<{ valid: boolean; expiry?: Date }> {
    return new Promise((resolve) => {
      const socket = tls.connect(
        {
          host: hostname,
          port,
          servername: hostname,
          rejectUnauthorized: false, // We'll check validity ourselves
        },
        () => {
          const cert = socket.getPeerCertificate();
          socket.destroy();

          if (!cert || Object.keys(cert).length === 0) {
            resolve({ valid: false });
            return;
          }

          const valid = socket.authorized;
          const expiry = cert.valid_to ? new Date(cert.valid_to) : undefined;

          resolve({ valid, expiry });
        }
      );

      socket.on('error', () => {
        resolve({ valid: false });
      });

      socket.setTimeout(5000, () => {
        socket.destroy();
        resolve({ valid: false });
      });
    });
  }

  /**
   * Build endpoint URLs from service info
   */
  buildServiceEndpoints(
    serviceName: string,
    namespace: string,
    domain: string,
    ports: number[] = [443]
  ): EndpointCheckConfig[] {
    const endpoints: EndpointCheckConfig[] = [];

    // Standard ingress URL
    endpoints.push({
      url: `https://${serviceName}.${domain}`,
      timeout: this.defaultTimeout,
      validateTls: true,
    });

    // Add internal service URLs if needed
    for (const port of ports) {
      if (port !== 443) {
        endpoints.push({
          url: `http://${serviceName}.${namespace}.svc.cluster.local:${port}`,
          timeout: this.defaultTimeout,
          validateTls: false,
        });
      }
    }

    return endpoints;
  }
}
