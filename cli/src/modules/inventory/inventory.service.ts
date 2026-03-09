import { Injectable, Inject } from '@nestjs/common';
import {
  MachineRepository,
  Machine,
  MachineRole,
  MachineStatus,
  CreateMachineInput,
  UpdateMachineInput,
  areRolesCompatible,
  machineSchema,
} from '../../database';
import { Errors } from '../../shared/errors';

/**
 * Inventory service for managing cluster machines
 */
@Injectable()
export class InventoryService {
  constructor(
    @Inject(MachineRepository)
    private readonly machineRepository: MachineRepository,
  ) {}

  /**
   * Get all machines
   */
  getAll(): Machine[] {
    return this.machineRepository.findAll();
  }

  /**
   * Get machine by ID
   */
  getById(id: string): Machine | undefined {
    return this.machineRepository.findById(id) ?? undefined;
  }

  /**
   * Get machine by label
   */
  getByLabel(label: string): Machine | undefined {
    return this.machineRepository.findByLabel(label) ?? undefined;
  }

  /**
   * Get machine by IP
   */
  getByIp(ip: string): Machine | undefined {
    return this.machineRepository.findByIp(ip) ?? undefined;
  }

  /**
   * Get machines by role
   */
  getByRole(role: MachineRole): Machine[] {
    return this.machineRepository.findByRole(role);
  }

  /**
   * Add a new machine
   */
  add(input: CreateMachineInput): Machine {
    // Validate unique label
    if (this.machineRepository.findByLabel(input.label)) {
      throw new Error(`Machine with label '${input.label}' already exists`);
    }

    // Validate unique IP
    if (this.machineRepository.findByIp(input.ip)) {
      throw new Error(`Machine with IP '${input.ip}' already exists`);
    }

    // Validate role compatibility
    if (!areRolesCompatible(input.roles)) {
      throw new Error(`Incompatible roles: ${input.roles.join(', ')}`);
    }

    return this.machineRepository.create(input);
  }

  /**
   * Update a machine
   */
  update(id: string, updates: UpdateMachineInput): Machine {
    const existing = this.machineRepository.findById(id);
    if (!existing) {
      throw Errors.machineNotFound(id);
    }

    // Validate unique label if changing
    if (updates.label && updates.label !== existing.label) {
      if (this.machineRepository.findByLabel(updates.label)) {
        throw new Error(`Machine with label '${updates.label}' already exists`);
      }
    }

    // Validate unique IP if changing
    if (updates.ip && updates.ip !== existing.ip) {
      if (this.machineRepository.findByIp(updates.ip)) {
        throw new Error(`Machine with IP '${updates.ip}' already exists`);
      }
    }

    // Validate role compatibility if changing
    if (updates.roles && !areRolesCompatible(updates.roles)) {
      throw new Error(`Incompatible roles: ${updates.roles.join(', ')}`);
    }

    // Update SSH host if IP changed
    if (updates.ip && !updates.ssh?.host) {
      updates.ssh = { ...updates.ssh, host: updates.ip };
    }

    const result = this.machineRepository.update(id, updates);
    if (!result) {
      throw Errors.machineNotFound(id);
    }

    return result;
  }

  /**
   * Remove a machine
   */
  remove(id: string): void {
    if (!this.machineRepository.delete(id)) {
      throw Errors.machineNotFound(id);
    }
  }

  /**
   * Remove all machines
   */
  clear(): void {
    this.machineRepository.deleteAll();
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
      const masterWithGateway = masters.find((m) => m.roles.includes(MachineRole.GATEWAY));
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
    const countByStatus = this.machineRepository.countByStatus();
    const countByRole = this.machineRepository.countByRole();

    return {
      total: this.machineRepository.count(),
      byRole: countByRole,
      online: countByStatus[MachineStatus.ONLINE],
      offline: countByStatus[MachineStatus.OFFLINE],
    };
  }
}
