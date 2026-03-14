import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { loadYaml, saveYaml, parseYaml, stringifyYaml } from '../../../utils/yaml';

describe('yaml utilities', () => {
  const testDir = '/tmp/selfhost-yaml-test';

  beforeEach(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('loadYaml', () => {
    test('loads valid YAML file', () => {
      const filePath = join(testDir, 'test.yaml');
      writeFileSync(
        filePath,
        `
name: test-service
version: 1.0.0
enabled: true
config:
  port: 8080
  debug: false
`.trim(),
      );

      const result = loadYaml<{
        name: string;
        version: string;
        enabled: boolean;
        config: { port: number; debug: boolean };
      }>(filePath);

      expect(result).not.toBeNull();
      expect(result!.name).toBe('test-service');
      expect(result!.version).toBe('1.0.0');
      expect(result!.enabled).toBe(true);
      expect(result!.config.port).toBe(8080);
      expect(result!.config.debug).toBe(false);
    });

    test('loads YAML with arrays', () => {
      const filePath = join(testDir, 'array.yaml');
      writeFileSync(
        filePath,
        `
services:
  - name: traefik
    namespace: ingress
  - name: vault
    namespace: service
tags:
  - production
  - critical
`.trim(),
      );

      const result = loadYaml<{
        services: Array<{ name: string; namespace: string }>;
        tags: string[];
      }>(filePath);

      expect(result).not.toBeNull();
      expect(result!.services).toHaveLength(2);
      expect(result!.services[0].name).toBe('traefik');
      expect(result!.tags).toEqual(['production', 'critical']);
    });

    test('returns null for non-existent file', () => {
      const result = loadYaml('/non/existent/path.yaml');
      expect(result).toBeNull();
    });

    test('handles malformed YAML gracefully', () => {
      const filePath = join(testDir, 'invalid.yaml');
      // Use YAML with tabs as indentation which is invalid and throws
      writeFileSync(filePath, 'key: value\n\tindented: wrong');

      const result = loadYaml(filePath);
      // loadYaml catches errors and returns null
      expect(result).toBeNull();
    });

    test('handles empty file', () => {
      const filePath = join(testDir, 'empty.yaml');
      writeFileSync(filePath, '');

      const result = loadYaml(filePath);
      expect(result).toBeNull();
    });
  });

  describe('saveYaml', () => {
    test('saves object to YAML file', () => {
      const filePath = join(testDir, 'output.yaml');
      const data = {
        name: 'test',
        version: '1.0.0',
        config: { port: 8080 },
      };

      saveYaml(filePath, data);

      expect(existsSync(filePath)).toBe(true);
      const loaded = loadYaml<typeof data>(filePath);
      expect(loaded).toEqual(data);
    });

    test('creates parent directories if needed', () => {
      const filePath = join(testDir, 'nested', 'deep', 'output.yaml');
      const data = { test: true };

      saveYaml(filePath, data);

      expect(existsSync(filePath)).toBe(true);
      const loaded = loadYaml<typeof data>(filePath);
      expect(loaded).toEqual(data);
    });

    test('saves arrays correctly', () => {
      const filePath = join(testDir, 'array-output.yaml');
      const data = {
        items: [1, 2, 3],
        names: ['a', 'b', 'c'],
        objects: [{ id: 1 }, { id: 2 }],
      };

      saveYaml(filePath, data);

      const loaded = loadYaml<typeof data>(filePath);
      expect(loaded).toEqual(data);
    });

    test('overwrites existing file', () => {
      const filePath = join(testDir, 'overwrite.yaml');
      saveYaml(filePath, { version: 1 });
      saveYaml(filePath, { version: 2 });

      const loaded = loadYaml<{ version: number }>(filePath);
      expect(loaded!.version).toBe(2);
    });
  });

  describe('parseYaml', () => {
    test('parses YAML string to object', () => {
      const yaml = `
name: test
value: 42
`;
      const result = parseYaml<{ name: string; value: number }>(yaml);
      expect(result.name).toBe('test');
      expect(result.value).toBe(42);
    });

    test('parses nested objects', () => {
      const yaml = `
server:
  host: localhost
  port: 8080
  ssl:
    enabled: true
`;
      const result = parseYaml<{
        server: { host: string; port: number; ssl: { enabled: boolean } };
      }>(yaml);
      expect(result.server.host).toBe('localhost');
      expect(result.server.port).toBe(8080);
      expect(result.server.ssl.enabled).toBe(true);
    });

    test('parses arrays', () => {
      const yaml = `
- item1
- item2
- item3
`;
      const result = parseYaml<string[]>(yaml);
      expect(result).toEqual(['item1', 'item2', 'item3']);
    });

    test('handles null values', () => {
      const yaml = `
name: test
value: null
optional: ~
`;
      const result = parseYaml<{ name: string; value: null; optional: null }>(yaml);
      expect(result.name).toBe('test');
      expect(result.value).toBeNull();
      expect(result.optional).toBeNull();
    });
  });

  describe('stringifyYaml', () => {
    test('converts object to YAML string', () => {
      const data = { name: 'test', value: 42 };
      const result = stringifyYaml(data);
      expect(result).toContain('name: test');
      expect(result).toContain('value: 42');
    });

    test('handles nested objects', () => {
      const data = {
        server: {
          host: 'localhost',
          port: 8080,
        },
      };
      const result = stringifyYaml(data);
      expect(result).toContain('server:');
      expect(result).toContain('host: localhost');
      expect(result).toContain('port: 8080');
    });

    test('handles arrays', () => {
      const data = { items: ['a', 'b', 'c'] };
      const result = stringifyYaml(data);
      expect(result).toContain('items:');
      expect(result).toContain('- a');
      expect(result).toContain('- b');
      expect(result).toContain('- c');
    });

    test('roundtrip: stringify then parse equals original', () => {
      const original = {
        name: 'test',
        config: { port: 8080, debug: true },
        tags: ['a', 'b'],
      };
      const yaml = stringifyYaml(original);
      const parsed = parseYaml<typeof original>(yaml);
      expect(parsed).toEqual(original);
    });
  });
});
