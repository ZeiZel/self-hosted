import { z } from 'zod';

/**
 * Machine roles in the infrastructure
 */
export enum MachineRole {
  MASTER = 'master',
  WORKER = 'worker',
  GATEWAY = 'gateway',
  STORAGE = 'storage',
  BACKUPS = 'backups',
}

/**
 * Machine facts collected via SSH
 */
export interface MachineFacts {
  hostname: string;
  os: string;
  osVersion: string;
  kernel: string;
  arch: string;
  cpuCores: number;
  cpuModel: string;
  memoryTotal: number; // bytes
  memoryAvailable: number; // bytes
  diskTotal: number; // bytes
  diskAvailable: number; // bytes
  dockerVersion?: string;
  kubernetesVersion?: string;
}

/**
 * SSH connection configuration
 */
export interface SshConfig {
  host: string;
  port: number;
  username: string;
  privateKeyPath?: string;
  password?: string;
}

/**
 * Machine definition in inventory
 */
export interface Machine {
  id: string;
  label: string;
  ip: string;
  roles: MachineRole[];
  ssh: SshConfig;
  facts?: MachineFacts;
  lastSeen?: string;
  status: 'unknown' | 'online' | 'offline' | 'error';
}

/**
 * Zod schema for machine validation
 */
export const machineSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(63).regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/),
  ip: z.string().ip(),
  roles: z.array(z.nativeEnum(MachineRole)).min(1),
  ssh: z.object({
    host: z.string(),
    port: z.number().int().min(1).max(65535).default(22),
    username: z.string().default('root'),
    privateKeyPath: z.string().optional(),
    password: z.string().optional(),
  }),
  facts: z.object({
    hostname: z.string(),
    os: z.string(),
    osVersion: z.string(),
    kernel: z.string(),
    arch: z.string(),
    cpuCores: z.number(),
    cpuModel: z.string(),
    memoryTotal: z.number(),
    memoryAvailable: z.number(),
    diskTotal: z.number(),
    diskAvailable: z.number(),
    dockerVersion: z.string().optional(),
    kubernetesVersion: z.string().optional(),
  }).optional(),
  lastSeen: z.string().datetime().optional(),
  status: z.enum(['unknown', 'online', 'offline', 'error']).default('unknown'),
});

export type MachineInput = z.infer<typeof machineSchema>;

/**
 * Role compatibility rules
 */
export const ROLE_COMPATIBILITY: Record<MachineRole, MachineRole[]> = {
  [MachineRole.GATEWAY]: [MachineRole.MASTER], // gateway can be combined with master
  [MachineRole.MASTER]: [MachineRole.GATEWAY, MachineRole.WORKER, MachineRole.STORAGE],
  [MachineRole.WORKER]: [MachineRole.MASTER, MachineRole.STORAGE],
  [MachineRole.STORAGE]: [MachineRole.MASTER, MachineRole.WORKER],
  [MachineRole.BACKUPS]: [], // backups should be standalone
};

/**
 * Check if roles are compatible
 */
export function areRolesCompatible(roles: MachineRole[]): boolean {
  if (roles.length <= 1) return true;

  for (const role of roles) {
    const compatible = ROLE_COMPATIBILITY[role];
    for (const otherRole of roles) {
      if (role !== otherRole && !compatible.includes(otherRole)) {
        return false;
      }
    }
  }

  return true;
}
