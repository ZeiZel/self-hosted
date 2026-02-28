import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConfigService } from '../config/config.service';
import {
  Machine,
  MachineRole,
  SshConfig,
  areRolesCompatible,
  machineSchema,
} from '../../interfaces/machine.interface';

export interface AddMachineInput {
  label: string;
  ip: string;
  roles: MachineRole[];
  ssh: Partial<SshConfig>;
}

@Injectable()
export class InventoryService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Get all machines
   */
  getAll(): Machine[] {
    return this.configService.loadInventory();
  }

  /**
   * Get machine by ID
   */
  getById(id: string): Machine | undefined {
    return this.getAll().find((m) => m.id === id);
  }

  /**
   * Get machine by label
   */
  getByLabel(label: string): Machine | undefined {
    return this.getAll().find((m) => m.label === label);
  }

  /**
   * Get machine by IP
   */
  getByIp(ip: string): Machine | undefined {
    return this.getAll().find((m) => m.ip === ip);
  }

  /**
   * Get machines by role
   */
  getByRole(role: MachineRole): Machine[] {
    return this.getAll().filter((m) => m.roles.includes(role));
  }

  /**
   * Add a new machine
   */
  add(input: AddMachineInput): Machine {
    const machines = this.getAll();

    // Validate unique label
    if (machines.some((m) => m.label === input.label)) {
      throw new Error(`Machine with label '${input.label}' already exists`);
    }

    // Validate unique IP
    if (machines.some((m) => m.ip === input.ip)) {
      throw new Error(`Machine with IP '${input.ip}' already exists`);
    }

    // Validate role compatibility
    if (!areRolesCompatible(input.roles)) {
      throw new Error(`Incompatible roles: ${input.roles.join(', ')}`);
    }

    const machine: Machine = {
      id: randomUUID(),
      label: input.label,
      ip: input.ip,
      roles: input.roles,
      ssh: {
        host: input.ip,
        port: input.ssh.port ?? 22,
        username: input.ssh.username ?? 'root',
        privateKeyPath: input.ssh.privateKeyPath,
        password: input.ssh.password,
      },
      status: 'unknown',
    };

    // Validate with schema
    machineSchema.parse(machine);

    machines.push(machine);
    this.configService.saveInventory(machines);

    return machine;
  }

  /**
   * Update a machine
   */
  update(id: string, updates: Partial<Omit<Machine, 'id'>>): Machine {
    const machines = this.getAll();
    const index = machines.findIndex((m) => m.id === id);

    if (index === -1) {
      throw new Error(`Machine with ID '${id}' not found`);
    }

    // Validate unique label if changing
    if (updates.label && updates.label !== machines[index].label) {
      if (machines.some((m) => m.label === updates.label)) {
        throw new Error(`Machine with label '${updates.label}' already exists`);
      }
    }

    // Validate unique IP if changing
    if (updates.ip && updates.ip !== machines[index].ip) {
      if (machines.some((m) => m.ip === updates.ip)) {
        throw new Error(`Machine with IP '${updates.ip}' already exists`);
      }
    }

    // Validate role compatibility if changing
    if (updates.roles && !areRolesCompatible(updates.roles)) {
      throw new Error(`Incompatible roles: ${updates.roles.join(', ')}`);
    }

    machines[index] = { ...machines[index], ...updates };

    // Update SSH host if IP changed
    if (updates.ip) {
      machines[index].ssh.host = updates.ip;
    }

    // Validate with schema
    machineSchema.parse(machines[index]);

    this.configService.saveInventory(machines);

    return machines[index];
  }

  /**
   * Remove a machine
   */
  remove(id: string): void {
    const machines = this.getAll();
    const index = machines.findIndex((m) => m.id === id);

    if (index === -1) {
      throw new Error(`Machine with ID '${id}' not found`);
    }

    machines.splice(index, 1);
    this.configService.saveInventory(machines);
  }

  /**
   * Remove all machines
   */
  clear(): void {
    this.configService.saveInventory([]);
  }

  /**
   * Validate inventory requirements
   */
  validate(): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check minimum requirements
    const masters = this.getByRole(MachineRole.MASTER);
    const gateways = this.getByRole(MachineRole.GATEWAY);

    if (masters.length === 0) {
      errors.push('At least one master node is required');
    }

    if (gateways.length === 0) {
      // Check if master also has gateway role
      const masterWithGateway = masters.find((m) =>
        m.roles.includes(MachineRole.GATEWAY)
      );
      if (!masterWithGateway) {
        errors.push('At least one gateway node is required (can be combined with master)');
      }
    }

    // Warnings for recommended setup
    if (masters.length < 3 && masters.length > 1) {
      warnings.push('For high availability, use 1 or 3 master nodes (not 2)');
    }

    const workers = this.getByRole(MachineRole.WORKER);
    if (workers.length === 0 && masters.length === 1) {
      warnings.push('Single-node cluster detected. All workloads will run on master.');
    }

    const storage = this.getByRole(MachineRole.STORAGE);
    if (storage.length === 0) {
      warnings.push('No dedicated storage node. OpenEBS will run on worker/master nodes.');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Generate Ansible inventory format
   */
  generateAnsibleInventory(): string {
    const lines: string[] = [];

    // Group by role
    const roleGroups: Record<string, Machine[]> = {
      masters: this.getByRole(MachineRole.MASTER),
      workers: this.getByRole(MachineRole.WORKER),
      gateway: this.getByRole(MachineRole.GATEWAY),
      storage: this.getByRole(MachineRole.STORAGE),
      backups: this.getByRole(MachineRole.BACKUPS),
    };

    for (const [group, groupMachines] of Object.entries(roleGroups)) {
      if (groupMachines.length === 0) continue;

      lines.push(`[${group}]`);
      for (const machine of groupMachines) {
        const vars = [
          `ansible_host=${machine.ip}`,
          `ansible_user=${machine.ssh.username}`,
          `ansible_port=${machine.ssh.port}`,
        ];
        if (machine.ssh.privateKeyPath) {
          vars.push(`ansible_ssh_private_key_file=${machine.ssh.privateKeyPath}`);
        }
        lines.push(`${machine.label} ${vars.join(' ')}`);
      }
      lines.push('');
    }

    // Kubernetes groups for Kubespray
    const masters = this.getByRole(MachineRole.MASTER);
    const workers = this.getByRole(MachineRole.WORKER);

    lines.push('[kube_control_plane]');
    masters.forEach((m) => lines.push(m.label));
    lines.push('');

    lines.push('[etcd]');
    masters.forEach((m) => lines.push(m.label));
    lines.push('');

    lines.push('[kube_node]');
    workers.forEach((m) => lines.push(m.label));
    masters.forEach((m) => {
      // Masters are also nodes if no dedicated workers
      if (workers.length === 0 || m.roles.includes(MachineRole.WORKER)) {
        lines.push(m.label);
      }
    });
    lines.push('');

    lines.push('[k8s_cluster:children]');
    lines.push('kube_control_plane');
    lines.push('kube_node');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    total: number;
    byRole: Record<MachineRole, number>;
    online: number;
    offline: number;
  } {
    const machines = this.getAll();

    const byRole: Record<MachineRole, number> = {
      [MachineRole.MASTER]: 0,
      [MachineRole.WORKER]: 0,
      [MachineRole.GATEWAY]: 0,
      [MachineRole.STORAGE]: 0,
      [MachineRole.BACKUPS]: 0,
    };

    for (const machine of machines) {
      for (const role of machine.roles) {
        byRole[role]++;
      }
    }

    return {
      total: machines.length,
      byRole,
      online: machines.filter((m) => m.status === 'online').length,
      offline: machines.filter((m) => m.status === 'offline').length,
    };
  }
}
