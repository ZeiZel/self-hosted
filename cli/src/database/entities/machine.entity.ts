import { z } from 'zod';
import { BaseEntity } from './base.entity';

/**
 * Machine roles in the cluster
 */
export enum MachineRole {
  MASTER = 'master',
  WORKER = 'worker',
  GATEWAY = 'gateway',
  STORAGE = 'storage',
  BACKUPS = 'backups',
}

/**
 * Machine status
 */
export enum MachineStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  ERROR = 'error',
  UNKNOWN = 'unknown',
}

/**
 * SSH configuration for machine
 */
export interface SshConfig {
  host: string;
  port: number;
  username: string;
  privateKeyPath?: string;
  password?: string;
}

/**
 * Machine entity stored in database
 */
export interface MachineEntity extends BaseEntity {
  label: string;
  ip: string;
  roles: MachineRole[];
  status: MachineStatus;
  sshHost: string;
  sshPort: number;
  sshUsername: string;
  sshPrivateKeyPath?: string;
  lastSeen?: string;
  facts?: string; // JSON string of collected facts
}

/**
 * Machine entity for API/service layer
 */
export interface Machine {
  id: string;
  label: string;
  ip: string;
  roles: MachineRole[];
  status: MachineStatus;
  ssh: SshConfig;
  lastSeen?: string;
  facts?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Input for creating a new machine
 */
export interface CreateMachineInput {
  label: string;
  ip: string;
  roles: MachineRole[];
  ssh: Partial<SshConfig>;
}

/**
 * Input for updating a machine
 */
export interface UpdateMachineInput {
  label?: string;
  ip?: string;
  roles?: MachineRole[];
  status?: MachineStatus;
  ssh?: Partial<SshConfig>;
  lastSeen?: string;
  facts?: Record<string, unknown>;
}

/**
 * Zod schema for machine validation
 */
export const machineSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(64),
  ip: z.string().ip(),
  roles: z.array(z.nativeEnum(MachineRole)).min(1),
  status: z.nativeEnum(MachineStatus),
  ssh: z.object({
    host: z.string(),
    port: z.number().int().min(1).max(65535),
    username: z.string(),
    privateKeyPath: z.string().optional(),
    password: z.string().optional(),
  }),
  lastSeen: z.string().datetime().optional(),
  facts: z.record(z.unknown()).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/**
 * Check if roles are compatible (gateway can only be with master)
 */
export function areRolesCompatible(roles: MachineRole[]): boolean {
  const hasGateway = roles.includes(MachineRole.GATEWAY);
  const hasMaster = roles.includes(MachineRole.MASTER);

  // Gateway can only be combined with master
  if (hasGateway && roles.length > 1 && !hasMaster) {
    return false;
  }

  // Backups should be standalone
  const hasBackups = roles.includes(MachineRole.BACKUPS);
  if (hasBackups && roles.length > 1) {
    return false;
  }

  return true;
}

/**
 * Convert entity to domain model
 */
export function entityToMachine(entity: MachineEntity): Machine {
  return {
    id: entity.id,
    label: entity.label,
    ip: entity.ip,
    roles: entity.roles,
    status: entity.status,
    ssh: {
      host: entity.sshHost,
      port: entity.sshPort,
      username: entity.sshUsername,
      privateKeyPath: entity.sshPrivateKeyPath,
    },
    lastSeen: entity.lastSeen,
    facts: entity.facts ? JSON.parse(entity.facts) : undefined,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

/**
 * Convert domain model to entity
 */
export function machineToEntity(machine: Machine): MachineEntity {
  return {
    id: machine.id,
    label: machine.label,
    ip: machine.ip,
    roles: machine.roles,
    status: machine.status,
    sshHost: machine.ssh.host,
    sshPort: machine.ssh.port,
    sshUsername: machine.ssh.username,
    sshPrivateKeyPath: machine.ssh.privateKeyPath,
    lastSeen: machine.lastSeen,
    facts: machine.facts ? JSON.stringify(machine.facts) : undefined,
    createdAt: machine.createdAt,
    updatedAt: machine.updatedAt,
  };
}
