import { describe, test, expect, beforeEach } from 'bun:test';
import { EndpointCheckerService } from '../../../modules/monitor/apis/endpoint-checker';

describe('EndpointCheckerService', () => {
  let service: EndpointCheckerService;

  beforeEach(() => {
    service = new EndpointCheckerService();
  });

  describe('checkEndpoint', () => {
    test('returns down status for unreachable endpoint', async () => {
      const result = await service.checkEndpoint({
        url: 'http://localhost:99999',
        timeout: 1000,
      });

      expect(result.status).toBe('down');
      expect(result.error).toBeDefined();
      expect(result.lastChecked).toBeInstanceOf(Date);
    });

    test('returns down status for invalid URL', async () => {
      const result = await service.checkEndpoint({
        url: 'not-a-valid-url',
        timeout: 1000,
      });

      expect(result.status).toBe('down');
      expect(result.error).toBeDefined();
    });

    test('returns down status for non-existent domain', async () => {
      const result = await service.checkEndpoint({
        url: 'http://this-domain-does-not-exist-12345.com',
        timeout: 2000,
      });

      expect(result.status).toBe('down');
      expect(result.error).toBeDefined();
    });

    test('handles timeout correctly', async () => {
      const result = await service.checkEndpoint({
        url: 'http://10.255.255.1', // Non-routable IP, will timeout
        timeout: 500,
      });

      expect(result.status).toBe('down');
      expect(result.responseTime).toBeGreaterThanOrEqual(500);
    });

    test('returns response time', async () => {
      const result = await service.checkEndpoint({
        url: 'http://localhost:99999',
        timeout: 1000,
      });

      expect(typeof result.responseTime).toBe('number');
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('checkEndpoints', () => {
    test('checks multiple endpoints in parallel', async () => {
      const configs = [
        { url: 'http://localhost:99998', timeout: 500 },
        { url: 'http://localhost:99999', timeout: 500 },
      ];

      const results = await service.checkEndpoints(configs);

      expect(results).toHaveLength(2);
      expect(results[0].url).toBe('http://localhost:99998');
      expect(results[1].url).toBe('http://localhost:99999');
    });

    test('returns empty array for empty input', async () => {
      const results = await service.checkEndpoints([]);
      expect(results).toHaveLength(0);
    });
  });

  describe('buildServiceEndpoints', () => {
    test('builds standard ingress URL', () => {
      const endpoints = service.buildServiceEndpoints('grafana', 'monitoring', 'example.com');

      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].url).toBe('https://grafana.example.com');
      expect(endpoints[0].validateTls).toBe(true);
    });

    test('builds multiple endpoints for multiple ports', () => {
      const endpoints = service.buildServiceEndpoints('my-service', 'default', 'example.com', [
        443,
        8080,
        9090,
      ]);

      expect(endpoints).toHaveLength(3);
      expect(endpoints[0].url).toBe('https://my-service.example.com');
      expect(endpoints[1].url).toBe('http://my-service.default.svc.cluster.local:8080');
      expect(endpoints[2].url).toBe('http://my-service.default.svc.cluster.local:9090');
    });

    test('internal service URLs have TLS validation disabled', () => {
      const endpoints = service.buildServiceEndpoints('my-service', 'default', 'example.com', [
        443,
        8080,
      ]);

      expect(endpoints[0].validateTls).toBe(true); // HTTPS ingress
      expect(endpoints[1].validateTls).toBe(false); // Internal HTTP
    });

    test('sets default timeout', () => {
      const endpoints = service.buildServiceEndpoints('grafana', 'monitoring', 'example.com');
      expect(endpoints[0].timeout).toBe(5000);
    });
  });
});
