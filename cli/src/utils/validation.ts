import { z } from 'zod';
import { isIP } from 'net';

/**
 * Custom Zod validators
 */
export const ipAddressSchema = z.string().refine(
  (val) => isIP(val) !== 0,
  { message: 'Invalid IP address' }
);

export const hostnameSchema = z.string().regex(
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i,
  { message: 'Invalid hostname (lowercase alphanumeric with hyphens)' }
);

export const domainSchema = z.string().regex(
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i,
  { message: 'Invalid domain name' }
);

export const portSchema = z.number().int().min(1).max(65535);

export const cpuResourceSchema = z.string().regex(
  /^\d+m?$/,
  { message: 'Invalid CPU resource (e.g., "100m", "2")' }
);

export const memoryResourceSchema = z.string().regex(
  /^\d+(Ki|Mi|Gi|Ti)?$/,
  { message: 'Invalid memory resource (e.g., "128Mi", "2Gi")' }
);

export const storageResourceSchema = z.string().regex(
  /^\d+(Ki|Mi|Gi|Ti)?$/,
  { message: 'Invalid storage resource (e.g., "10Gi", "100Mi")' }
);

/**
 * Parse CPU resource to millicores
 */
export function parseCpuToMillicores(cpu: string): number {
  if (cpu.endsWith('m')) {
    return parseInt(cpu.slice(0, -1), 10);
  }
  return parseInt(cpu, 10) * 1000;
}

/**
 * Parse memory resource to bytes
 */
export function parseMemoryToBytes(memory: string): number {
  const units: Record<string, number> = {
    Ki: 1024,
    Mi: 1024 * 1024,
    Gi: 1024 * 1024 * 1024,
    Ti: 1024 * 1024 * 1024 * 1024,
  };

  for (const [unit, multiplier] of Object.entries(units)) {
    if (memory.endsWith(unit)) {
      return parseInt(memory.slice(0, -unit.length), 10) * multiplier;
    }
  }

  return parseInt(memory, 10);
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number): string {
  const units = ['B', 'Ki', 'Mi', 'Gi', 'Ti'];
  let unitIndex = 0;
  let value = bytes;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${Math.round(value)}${units[unitIndex]}`;
}

/**
 * Format millicores to human readable
 */
export function formatCpu(millicores: number): string {
  if (millicores >= 1000) {
    return `${millicores / 1000}`;
  }
  return `${millicores}m`;
}
