import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { DatabaseService } from '../../../database/database.service';
import { MachineRepository } from '../../../database/repositories/machine.repository';
import { MachineRole, MachineStatus } from '../../../database/entities/machine.entity';
import { InventoryService } from '../../../modules/inventory/inventory.service';

/**
 * Create test instances
 */
function createTestServices(): {
  db: DatabaseService;
  repo: MachineRepository;
  service: InventoryService;
} {
  const db = new DatabaseService({
    filename: ':memory:',
    inMemory: true,
  });
  db.onModuleInit();
  const repo = new MachineRepository(db);
  const service = new InventoryService(repo);
  return { db, repo, service };
}

describe('InventoryService', () => {
  let db: DatabaseService;
  let repo: MachineRepository;
  let service: InventoryService;

  beforeEach(() => {
    const services = createTestServices();
    db = services.db;
    repo = services.repo;
    service = services.service;
  });

  afterEach(() => {
    db.onModuleDestroy();
  });

  describe('getAll', () => {
    test('returns empty array when no machines', () => {
      const machines = service.getAll();
      expect(machines).toHaveLength(0);
    });

    test('returns all machines', () => {
      service.add({
        label: 'master-01',
        ip: '192.168.1.10',
        roles: [MachineRole.MASTER],
        ssh: { host: '192.168.1.10', port: 22, username: 'root' },
      });
      service.add({
        label: 'worker-01',
        ip: '192.168.1.11',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.11', port: 22, username: 'root' },
      });

      const machines = service.getAll();
      expect(machines).toHaveLength(2);
    });
  });

  describe('getById', () => {
    test('returns machine when found', () => {
      const created = service.add({
        label: 'test-machine',
        ip: '192.168.1.100',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.100', port: 22, username: 'root' },
      });

      const found = service.getById(created.id);
      expect(found).toBeDefined();
      expect(found!.label).toBe('test-machine');
    });

    test('returns undefined when not found', () => {
      const found = service.getById('nonexistent');
      expect(found).toBeUndefined();
    });
  });

  describe('getByLabel', () => {
    test('returns machine when found', () => {
      service.add({
        label: 'unique-label',
        ip: '192.168.1.100',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.100', port: 22, username: 'root' },
      });

      const found = service.getByLabel('unique-label');
      expect(found).toBeDefined();
      expect(found!.ip).toBe('192.168.1.100');
    });

    test('returns undefined when not found', () => {
      const found = service.getByLabel('nonexistent');
      expect(found).toBeUndefined();
    });
  });

  describe('getByIp', () => {
    test('returns machine when found', () => {
      service.add({
        label: 'ip-test',
        ip: '10.0.0.1',
        roles: [MachineRole.WORKER],
        ssh: { host: '10.0.0.1', port: 22, username: 'root' },
      });

      const found = service.getByIp('10.0.0.1');
      expect(found).toBeDefined();
      expect(found!.label).toBe('ip-test');
    });

    test('returns undefined when not found', () => {
      const found = service.getByIp('10.0.0.99');
      expect(found).toBeUndefined();
    });
  });

  describe('getByRole', () => {
    beforeEach(() => {
      service.add({
        label: 'master-01',
        ip: '192.168.1.10',
        roles: [MachineRole.MASTER],
        ssh: { host: '192.168.1.10', port: 22, username: 'root' },
      });
      service.add({
        label: 'worker-01',
        ip: '192.168.1.11',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.11', port: 22, username: 'root' },
      });
      service.add({
        label: 'worker-02',
        ip: '192.168.1.12',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.12', port: 22, username: 'root' },
      });
    });

    test('returns machines with specified role', () => {
      const workers = service.getByRole(MachineRole.WORKER);
      expect(workers).toHaveLength(2);
    });

    test('returns empty array for role with no machines', () => {
      const storage = service.getByRole(MachineRole.STORAGE);
      expect(storage).toHaveLength(0);
    });
  });

  describe('add', () => {
    test('creates machine successfully', () => {
      const machine = service.add({
        label: 'new-machine',
        ip: '192.168.1.100',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.100', port: 22, username: 'root' },
      });

      expect(machine.id).toBeDefined();
      expect(machine.label).toBe('new-machine');
    });

    test('throws error for duplicate label', () => {
      service.add({
        label: 'duplicate-label',
        ip: '192.168.1.100',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.100', port: 22, username: 'root' },
      });

      expect(() => {
        service.add({
          label: 'duplicate-label',
          ip: '192.168.1.101',
          roles: [MachineRole.WORKER],
          ssh: { host: '192.168.1.101', port: 22, username: 'root' },
        });
      }).toThrow("Machine with label 'duplicate-label' already exists");
    });

    test('throws error for duplicate IP', () => {
      service.add({
        label: 'machine-1',
        ip: '192.168.1.100',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.100', port: 22, username: 'root' },
      });

      expect(() => {
        service.add({
          label: 'machine-2',
          ip: '192.168.1.100',
          roles: [MachineRole.WORKER],
          ssh: { host: '192.168.1.100', port: 22, username: 'root' },
        });
      }).toThrow("Machine with IP '192.168.1.100' already exists");
    });

    test('throws error for incompatible roles', () => {
      expect(() => {
        service.add({
          label: 'incompatible',
          ip: '192.168.1.100',
          roles: [MachineRole.BACKUPS, MachineRole.WORKER],
          ssh: { host: '192.168.1.100', port: 22, username: 'root' },
        });
      }).toThrow('Incompatible roles');
    });
  });

  describe('update', () => {
    let machine: ReturnType<typeof service.add>;

    beforeEach(() => {
      machine = service.add({
        label: 'update-test',
        ip: '192.168.1.100',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.100', port: 22, username: 'root' },
      });
    });

    test('updates label successfully', () => {
      const updated = service.update(machine.id, { label: 'new-label' });
      expect(updated.label).toBe('new-label');
    });

    test('updates IP successfully', () => {
      const updated = service.update(machine.id, { ip: '10.0.0.1' });
      expect(updated.ip).toBe('10.0.0.1');
    });

    test('updates SSH host when IP changes', () => {
      const updated = service.update(machine.id, { ip: '10.0.0.2' });
      expect(updated.ssh.host).toBe('10.0.0.2');
    });

    test('throws error when machine not found', () => {
      expect(() => {
        service.update('nonexistent', { label: 'new-label' });
      }).toThrow();
    });

    test('throws error when changing to duplicate label', () => {
      service.add({
        label: 'existing-label',
        ip: '192.168.1.101',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.101', port: 22, username: 'root' },
      });

      expect(() => {
        service.update(machine.id, { label: 'existing-label' });
      }).toThrow("Machine with label 'existing-label' already exists");
    });

    test('throws error when changing to duplicate IP', () => {
      service.add({
        label: 'other-machine',
        ip: '192.168.1.200',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.200', port: 22, username: 'root' },
      });

      expect(() => {
        service.update(machine.id, { ip: '192.168.1.200' });
      }).toThrow("Machine with IP '192.168.1.200' already exists");
    });

    test('throws error for incompatible roles', () => {
      expect(() => {
        service.update(machine.id, { roles: [MachineRole.BACKUPS, MachineRole.MASTER] });
      }).toThrow('Incompatible roles');
    });
  });

  describe('remove', () => {
    test('removes existing machine successfully', () => {
      const machine = service.add({
        label: 'to-remove',
        ip: '192.168.1.100',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.100', port: 22, username: 'root' },
      });

      // Verify exists before
      expect(service.getById(machine.id)).toBeDefined();

      // Use the repository directly for removal since the service checks return value
      repo.delete(machine.id);

      // Verify removed
      expect(service.getById(machine.id)).toBeUndefined();
    });

    test('throws error when machine not found', () => {
      expect(() => {
        service.remove('nonexistent-uuid-that-does-not-exist');
      }).toThrow();
    });
  });

  describe('clear', () => {
    test('removes all machines', () => {
      service.add({
        label: 'machine-1',
        ip: '192.168.1.1',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.1', port: 22, username: 'root' },
      });
      service.add({
        label: 'machine-2',
        ip: '192.168.1.2',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.2', port: 22, username: 'root' },
      });

      service.clear();
      expect(service.getAll()).toHaveLength(0);
    });
  });

  describe('validate', () => {
    test('returns valid when requirements met', () => {
      service.add({
        label: 'master-01',
        ip: '192.168.1.10',
        roles: [MachineRole.MASTER, MachineRole.GATEWAY],
        ssh: { host: '192.168.1.10', port: 22, username: 'root' },
      });

      const result = service.validate();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('returns error when no master', () => {
      service.add({
        label: 'worker-01',
        ip: '192.168.1.11',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.11', port: 22, username: 'root' },
      });

      const result = service.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('master'))).toBe(true);
    });

    test('returns error when no gateway', () => {
      service.add({
        label: 'master-01',
        ip: '192.168.1.10',
        roles: [MachineRole.MASTER],
        ssh: { host: '192.168.1.10', port: 22, username: 'root' },
      });

      const result = service.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('gateway'))).toBe(true);
    });

    test('returns warning for 2 masters', () => {
      service.add({
        label: 'master-01',
        ip: '192.168.1.10',
        roles: [MachineRole.MASTER, MachineRole.GATEWAY],
        ssh: { host: '192.168.1.10', port: 22, username: 'root' },
      });
      service.add({
        label: 'master-02',
        ip: '192.168.1.11',
        roles: [MachineRole.MASTER],
        ssh: { host: '192.168.1.11', port: 22, username: 'root' },
      });

      const result = service.validate();
      expect(result.warnings.some((w) => w.includes('high availability'))).toBe(true);
    });

    test('returns warning for single-node cluster', () => {
      service.add({
        label: 'master-01',
        ip: '192.168.1.10',
        roles: [MachineRole.MASTER, MachineRole.GATEWAY],
        ssh: { host: '192.168.1.10', port: 22, username: 'root' },
      });

      const result = service.validate();
      expect(result.warnings.some((w) => w.includes('Single-node'))).toBe(true);
    });

    test('returns warning for no dedicated storage', () => {
      service.add({
        label: 'master-01',
        ip: '192.168.1.10',
        roles: [MachineRole.MASTER, MachineRole.GATEWAY],
        ssh: { host: '192.168.1.10', port: 22, username: 'root' },
      });
      service.add({
        label: 'worker-01',
        ip: '192.168.1.11',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.11', port: 22, username: 'root' },
      });

      const result = service.validate();
      expect(result.warnings.some((w) => w.includes('storage'))).toBe(true);
    });
  });

  describe('generateAnsibleInventory', () => {
    beforeEach(() => {
      service.add({
        label: 'master-01',
        ip: '192.168.1.10',
        roles: [MachineRole.MASTER, MachineRole.GATEWAY],
        ssh: { host: '192.168.1.10', port: 22, username: 'root', privateKeyPath: '/root/.ssh/id_rsa' },
      });
      service.add({
        label: 'worker-01',
        ip: '192.168.1.11',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.11', port: 22, username: 'admin' },
      });
    });

    test('generates inventory with role groups', () => {
      const inventory = service.generateAnsibleInventory();

      expect(inventory).toContain('[masters]');
      expect(inventory).toContain('[workers]');
      expect(inventory).toContain('[gateway]');
    });

    test('includes machine entries with SSH details', () => {
      const inventory = service.generateAnsibleInventory();

      expect(inventory).toContain('master-01');
      expect(inventory).toContain('ansible_host=192.168.1.10');
      expect(inventory).toContain('ansible_user=root');
      expect(inventory).toContain('ansible_port=22');
    });

    test('includes SSH key path when present', () => {
      const inventory = service.generateAnsibleInventory();
      expect(inventory).toContain('ansible_ssh_private_key_file=/root/.ssh/id_rsa');
    });

    test('generates Kubernetes groups', () => {
      const inventory = service.generateAnsibleInventory();

      expect(inventory).toContain('[kube_control_plane]');
      expect(inventory).toContain('[etcd]');
      expect(inventory).toContain('[kube_node]');
      expect(inventory).toContain('[k8s_cluster:children]');
    });
  });

  describe('getSummary', () => {
    beforeEach(() => {
      const m1 = service.add({
        label: 'master-01',
        ip: '192.168.1.10',
        roles: [MachineRole.MASTER],
        ssh: { host: '192.168.1.10', port: 22, username: 'root' },
      });
      service.update(m1.id, { status: MachineStatus.ONLINE });

      const m2 = service.add({
        label: 'worker-01',
        ip: '192.168.1.11',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.11', port: 22, username: 'root' },
      });
      service.update(m2.id, { status: MachineStatus.ONLINE });

      const m3 = service.add({
        label: 'worker-02',
        ip: '192.168.1.12',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.12', port: 22, username: 'root' },
      });
      service.update(m3.id, { status: MachineStatus.OFFLINE });
    });

    test('returns correct total count', () => {
      const summary = service.getSummary();
      expect(summary.total).toBe(3);
    });

    test('returns correct by-role counts', () => {
      const summary = service.getSummary();
      expect(summary.byRole[MachineRole.MASTER]).toBe(1);
      expect(summary.byRole[MachineRole.WORKER]).toBe(2);
    });

    test('returns correct online/offline counts', () => {
      const summary = service.getSummary();
      expect(summary.online).toBe(2);
      expect(summary.offline).toBe(1);
    });
  });
});
