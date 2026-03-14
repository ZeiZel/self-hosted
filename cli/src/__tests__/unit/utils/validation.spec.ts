import { describe, test, expect } from 'bun:test';
import {
  ipAddressSchema,
  hostnameSchema,
  domainSchema,
  portSchema,
  cpuResourceSchema,
  memoryResourceSchema,
  storageResourceSchema,
  parseCpuToMillicores,
  parseMemoryToBytes,
  formatBytes,
  formatCpu,
} from '../../../utils/validation';

describe('validation utilities', () => {
  describe('ipAddressSchema', () => {
    test('accepts valid IPv4 address', () => {
      expect(ipAddressSchema.parse('192.168.1.1')).toBe('192.168.1.1');
      expect(ipAddressSchema.parse('10.0.0.1')).toBe('10.0.0.1');
      expect(ipAddressSchema.parse('255.255.255.255')).toBe('255.255.255.255');
      expect(ipAddressSchema.parse('0.0.0.0')).toBe('0.0.0.0');
    });

    test('accepts valid IPv6 address', () => {
      expect(ipAddressSchema.parse('::1')).toBe('::1');
      expect(ipAddressSchema.parse('2001:db8::1')).toBe('2001:db8::1');
    });

    test('rejects invalid IP addresses', () => {
      expect(() => ipAddressSchema.parse('not-an-ip')).toThrow();
      expect(() => ipAddressSchema.parse('192.168.1')).toThrow();
      expect(() => ipAddressSchema.parse('192.168.1.256')).toThrow();
      expect(() => ipAddressSchema.parse('')).toThrow();
    });
  });

  describe('hostnameSchema', () => {
    test('accepts valid hostnames', () => {
      expect(hostnameSchema.parse('server1')).toBe('server1');
      expect(hostnameSchema.parse('master-01')).toBe('master-01');
      expect(hostnameSchema.parse('a')).toBe('a');
      expect(hostnameSchema.parse('SERVER')).toBe('SERVER');
    });

    test('rejects invalid hostnames', () => {
      expect(() => hostnameSchema.parse('-invalid')).toThrow();
      expect(() => hostnameSchema.parse('invalid-')).toThrow();
      expect(() => hostnameSchema.parse('inv@lid')).toThrow();
      expect(() => hostnameSchema.parse('inv.lid')).toThrow();
      expect(() => hostnameSchema.parse('')).toThrow();
    });
  });

  describe('domainSchema', () => {
    test('accepts valid domain names', () => {
      expect(domainSchema.parse('example.com')).toBe('example.com');
      expect(domainSchema.parse('sub.example.com')).toBe('sub.example.com');
      expect(domainSchema.parse('a.b.c.d.example.com')).toBe('a.b.c.d.example.com');
      expect(domainSchema.parse('my-domain.co.uk')).toBe('my-domain.co.uk');
    });

    test('rejects invalid domain names', () => {
      expect(() => domainSchema.parse('-example.com')).toThrow();
      expect(() => domainSchema.parse('example-.com')).toThrow();
      expect(() => domainSchema.parse('example..com')).toThrow();
      expect(() => domainSchema.parse('')).toThrow();
    });
  });

  describe('portSchema', () => {
    test('accepts valid ports', () => {
      expect(portSchema.parse(1)).toBe(1);
      expect(portSchema.parse(22)).toBe(22);
      expect(portSchema.parse(80)).toBe(80);
      expect(portSchema.parse(443)).toBe(443);
      expect(portSchema.parse(8080)).toBe(8080);
      expect(portSchema.parse(65535)).toBe(65535);
    });

    test('rejects invalid ports', () => {
      expect(() => portSchema.parse(0)).toThrow();
      expect(() => portSchema.parse(-1)).toThrow();
      expect(() => portSchema.parse(65536)).toThrow();
      expect(() => portSchema.parse(1.5)).toThrow();
    });
  });

  describe('cpuResourceSchema', () => {
    test('accepts valid CPU resources', () => {
      expect(cpuResourceSchema.parse('100m')).toBe('100m');
      expect(cpuResourceSchema.parse('500m')).toBe('500m');
      expect(cpuResourceSchema.parse('1000m')).toBe('1000m');
      expect(cpuResourceSchema.parse('2')).toBe('2');
      expect(cpuResourceSchema.parse('4')).toBe('4');
    });

    test('rejects invalid CPU resources', () => {
      expect(() => cpuResourceSchema.parse('100Mi')).toThrow();
      expect(() => cpuResourceSchema.parse('abc')).toThrow();
      expect(() => cpuResourceSchema.parse('')).toThrow();
      expect(() => cpuResourceSchema.parse('1.5')).toThrow();
    });
  });

  describe('memoryResourceSchema', () => {
    test('accepts valid memory resources', () => {
      expect(memoryResourceSchema.parse('128Mi')).toBe('128Mi');
      expect(memoryResourceSchema.parse('1Gi')).toBe('1Gi');
      expect(memoryResourceSchema.parse('512Ki')).toBe('512Ki');
      expect(memoryResourceSchema.parse('2Ti')).toBe('2Ti');
      expect(memoryResourceSchema.parse('1024')).toBe('1024');
    });

    test('rejects invalid memory resources', () => {
      expect(() => memoryResourceSchema.parse('128MB')).toThrow();
      expect(() => memoryResourceSchema.parse('abc')).toThrow();
      expect(() => memoryResourceSchema.parse('')).toThrow();
    });
  });

  describe('storageResourceSchema', () => {
    test('accepts valid storage resources', () => {
      expect(storageResourceSchema.parse('10Gi')).toBe('10Gi');
      expect(storageResourceSchema.parse('100Mi')).toBe('100Mi');
      expect(storageResourceSchema.parse('1Ti')).toBe('1Ti');
    });

    test('rejects invalid storage resources', () => {
      expect(() => storageResourceSchema.parse('10GB')).toThrow();
      expect(() => storageResourceSchema.parse('abc')).toThrow();
    });
  });

  describe('parseCpuToMillicores', () => {
    test('parses millicores', () => {
      expect(parseCpuToMillicores('100m')).toBe(100);
      expect(parseCpuToMillicores('500m')).toBe(500);
      expect(parseCpuToMillicores('1000m')).toBe(1000);
      expect(parseCpuToMillicores('2500m')).toBe(2500);
    });

    test('parses whole cores to millicores', () => {
      expect(parseCpuToMillicores('1')).toBe(1000);
      expect(parseCpuToMillicores('2')).toBe(2000);
      expect(parseCpuToMillicores('4')).toBe(4000);
      expect(parseCpuToMillicores('8')).toBe(8000);
    });

    test('handles edge cases', () => {
      expect(parseCpuToMillicores('0m')).toBe(0);
      expect(parseCpuToMillicores('0')).toBe(0);
    });
  });

  describe('parseMemoryToBytes', () => {
    test('parses Ki units', () => {
      expect(parseMemoryToBytes('1Ki')).toBe(1024);
      expect(parseMemoryToBytes('512Ki')).toBe(512 * 1024);
    });

    test('parses Mi units', () => {
      expect(parseMemoryToBytes('1Mi')).toBe(1024 * 1024);
      expect(parseMemoryToBytes('128Mi')).toBe(128 * 1024 * 1024);
      expect(parseMemoryToBytes('512Mi')).toBe(512 * 1024 * 1024);
    });

    test('parses Gi units', () => {
      expect(parseMemoryToBytes('1Gi')).toBe(1024 * 1024 * 1024);
      expect(parseMemoryToBytes('2Gi')).toBe(2 * 1024 * 1024 * 1024);
      expect(parseMemoryToBytes('16Gi')).toBe(16 * 1024 * 1024 * 1024);
    });

    test('parses Ti units', () => {
      expect(parseMemoryToBytes('1Ti')).toBe(1024 * 1024 * 1024 * 1024);
    });

    test('parses raw bytes', () => {
      expect(parseMemoryToBytes('1024')).toBe(1024);
      expect(parseMemoryToBytes('0')).toBe(0);
    });
  });

  describe('formatBytes', () => {
    test('formats bytes', () => {
      expect(formatBytes(0)).toBe('0B');
      expect(formatBytes(512)).toBe('512B');
    });

    test('formats KiB', () => {
      expect(formatBytes(1024)).toBe('1Ki');
      expect(formatBytes(2048)).toBe('2Ki');
    });

    test('formats MiB', () => {
      expect(formatBytes(1024 * 1024)).toBe('1Mi');
      expect(formatBytes(128 * 1024 * 1024)).toBe('128Mi');
    });

    test('formats GiB', () => {
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1Gi');
      expect(formatBytes(16 * 1024 * 1024 * 1024)).toBe('16Gi');
    });

    test('formats TiB', () => {
      expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe('1Ti');
    });

    test('rounds values', () => {
      expect(formatBytes(1536 * 1024 * 1024)).toBe('2Gi'); // 1.5Gi rounds to 2Gi
    });
  });

  describe('formatCpu', () => {
    test('formats millicores', () => {
      expect(formatCpu(100)).toBe('100m');
      expect(formatCpu(500)).toBe('500m');
      expect(formatCpu(999)).toBe('999m');
    });

    test('formats whole cores', () => {
      expect(formatCpu(1000)).toBe('1');
      expect(formatCpu(2000)).toBe('2');
      expect(formatCpu(4000)).toBe('4');
    });

    test('formats fractional cores', () => {
      expect(formatCpu(1500)).toBe('1.5');
      expect(formatCpu(2500)).toBe('2.5');
    });
  });
});
