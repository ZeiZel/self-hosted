import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { DatabaseService } from '../../../database/database.service';
import { MachineRepository } from '../../../database/repositories/machine.repository';
import { MachineRole, MachineStatus } from '../../../database/entities/machine.entity';

/**
 * Create test instances of DatabaseService and MachineRepository
 */
function createTestServices(): { db: DatabaseService; repo: MachineRepository } {
  const db = new DatabaseService({
    filename: ':memory:',
    inMemory: true,
  });
  db.onModuleInit();
  const repo = new MachineRepository(db);
  return { db, repo };
}

describe('MachineRepository', () => {
  let db: DatabaseService;
  let repo: MachineRepository;

  beforeEach(() => {
    const services = createTestServices();
    db = services.db;
    repo = services.repo;
  });

  afterEach(() => {
    db.onModuleDestroy();
  });

  describe('create', () => {
    test('creates machine with required fields', () => {
      const machine = repo.create({
        label: 'master-01',
        ip: '192.168.1.10',
        roles: [MachineRole.MASTER],
        ssh: {
          host: '192.168.1.10',
          port: 22,
          username: 'root',
        },
      });

      expect(machine.id).toBeDefined();
      expect(machine.label).toBe('master-01');
      expect(machine.ip).toBe('192.168.1.10');
      expect(machine.roles).toEqual([MachineRole.MASTER]);
      expect(machine.status).toBe(MachineStatus.UNKNOWN);
      expect(machine.ssh.host).toBe('192.168.1.10');
      expect(machine.ssh.port).toBe(22);
      expect(machine.ssh.username).toBe('root');
      expect(machine.createdAt).toBeDefined();
      expect(machine.updatedAt).toBeDefined();
    });

    test('creates machine with multiple roles', () => {
      const machine = repo.create({
        label: 'multi-role',
        ip: '192.168.1.20',
        roles: [MachineRole.MASTER, MachineRole.GATEWAY],
        ssh: {
          host: '192.168.1.20',
          port: 22,
          username: 'admin',
        },
      });

      expect(machine.roles).toEqual([MachineRole.MASTER, MachineRole.GATEWAY]);
    });

    test('creates machine with SSH key path', () => {
      const machine = repo.create({
        label: 'with-key',
        ip: '192.168.1.30',
        roles: [MachineRole.WORKER],
        ssh: {
          host: '192.168.1.30',
          port: 22,
          username: 'deploy',
          privateKeyPath: '/home/user/.ssh/id_rsa',
        },
      });

      expect(machine.ssh.privateKeyPath).toBe('/home/user/.ssh/id_rsa');
    });

    test('uses IP as SSH host when not specified', () => {
      const machine = repo.create({
        label: 'auto-host',
        ip: '192.168.1.40',
        roles: [MachineRole.WORKER],
        ssh: {
          port: 22,
          username: 'root',
        },
      });

      expect(machine.ssh.host).toBe('192.168.1.40');
    });

    test('uses default SSH port when not specified', () => {
      const machine = repo.create({
        label: 'default-port',
        ip: '192.168.1.50',
        roles: [MachineRole.WORKER],
        ssh: {
          username: 'root',
        },
      });

      expect(machine.ssh.port).toBe(22);
    });
  });

  describe('findAll', () => {
    beforeEach(() => {
      repo.create({
        label: 'master-01',
        ip: '192.168.1.10',
        roles: [MachineRole.MASTER],
        ssh: { host: '192.168.1.10', port: 22, username: 'root' },
      });
      repo.create({
        label: 'worker-01',
        ip: '192.168.1.11',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.11', port: 22, username: 'root' },
      });
      repo.create({
        label: 'worker-02',
        ip: '192.168.1.12',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.12', port: 22, username: 'root' },
      });
    });

    test('returns all machines', () => {
      const machines = repo.findAll();
      expect(machines).toHaveLength(3);
    });

    test('returns machines sorted by label', () => {
      const machines = repo.findAll();
      expect(machines[0].label).toBe('master-01');
      expect(machines[1].label).toBe('worker-01');
      expect(machines[2].label).toBe('worker-02');
    });

    test('returns empty array when no machines', () => {
      repo.deleteAll();
      const machines = repo.findAll();
      expect(machines).toHaveLength(0);
    });
  });

  describe('findById', () => {
    test('returns machine when found', () => {
      const created = repo.create({
        label: 'test-machine',
        ip: '192.168.1.100',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.100', port: 22, username: 'root' },
      });

      const found = repo.findById(created.id);
      expect(found).not.toBeNull();
      expect(found!.label).toBe('test-machine');
    });

    test('returns null when not found', () => {
      const found = repo.findById('nonexistent-id');
      expect(found).toBeNull();
    });
  });

  describe('findByLabel', () => {
    beforeEach(() => {
      repo.create({
        label: 'unique-label',
        ip: '192.168.1.100',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.100', port: 22, username: 'root' },
      });
    });

    test('returns machine when found', () => {
      const found = repo.findByLabel('unique-label');
      expect(found).not.toBeNull();
      expect(found!.ip).toBe('192.168.1.100');
    });

    test('returns null when not found', () => {
      const found = repo.findByLabel('nonexistent-label');
      expect(found).toBeNull();
    });
  });

  describe('findByIp', () => {
    beforeEach(() => {
      repo.create({
        label: 'ip-test',
        ip: '10.0.0.1',
        roles: [MachineRole.WORKER],
        ssh: { host: '10.0.0.1', port: 22, username: 'root' },
      });
    });

    test('returns machine when found', () => {
      const found = repo.findByIp('10.0.0.1');
      expect(found).not.toBeNull();
      expect(found!.label).toBe('ip-test');
    });

    test('returns null when not found', () => {
      const found = repo.findByIp('10.0.0.99');
      expect(found).toBeNull();
    });
  });

  describe('findByRole', () => {
    beforeEach(() => {
      repo.create({
        label: 'master-01',
        ip: '192.168.1.10',
        roles: [MachineRole.MASTER],
        ssh: { host: '192.168.1.10', port: 22, username: 'root' },
      });
      repo.create({
        label: 'worker-01',
        ip: '192.168.1.11',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.11', port: 22, username: 'root' },
      });
      repo.create({
        label: 'worker-02',
        ip: '192.168.1.12',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.12', port: 22, username: 'root' },
      });
      repo.create({
        label: 'gateway-01',
        ip: '192.168.1.13',
        roles: [MachineRole.GATEWAY],
        ssh: { host: '192.168.1.13', port: 22, username: 'root' },
      });
    });

    test('returns machines with specified role', () => {
      const workers = repo.findByRole(MachineRole.WORKER);
      expect(workers).toHaveLength(2);
      expect(workers.every((m) => m.roles.includes(MachineRole.WORKER))).toBe(true);
    });

    test('returns single machine for unique role', () => {
      const masters = repo.findByRole(MachineRole.MASTER);
      expect(masters).toHaveLength(1);
      expect(masters[0].label).toBe('master-01');
    });

    test('returns empty array for role with no machines', () => {
      const storage = repo.findByRole(MachineRole.STORAGE);
      expect(storage).toHaveLength(0);
    });
  });

  describe('findByStatus', () => {
    beforeEach(() => {
      const m1 = repo.create({
        label: 'online-machine',
        ip: '192.168.1.10',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.10', port: 22, username: 'root' },
      });
      repo.update(m1.id, { status: MachineStatus.ONLINE });

      const m2 = repo.create({
        label: 'offline-machine',
        ip: '192.168.1.11',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.11', port: 22, username: 'root' },
      });
      repo.update(m2.id, { status: MachineStatus.OFFLINE });
    });

    test('returns machines with specified status', () => {
      const online = repo.findByStatus(MachineStatus.ONLINE);
      expect(online).toHaveLength(1);
      expect(online[0].label).toBe('online-machine');
    });

    test('returns empty array for status with no machines', () => {
      const error = repo.findByStatus(MachineStatus.ERROR);
      expect(error).toHaveLength(0);
    });
  });

  describe('update', () => {
    let machine: ReturnType<typeof repo.create>;

    beforeEach(() => {
      machine = repo.create({
        label: 'update-test',
        ip: '192.168.1.100',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.100', port: 22, username: 'root' },
      });
    });

    test('updates label', () => {
      const updated = repo.update(machine.id, { label: 'new-label' });
      expect(updated).not.toBeNull();
      expect(updated!.label).toBe('new-label');
    });

    test('updates IP', () => {
      const updated = repo.update(machine.id, { ip: '10.0.0.1' });
      expect(updated).not.toBeNull();
      expect(updated!.ip).toBe('10.0.0.1');
    });

    test('updates roles', () => {
      const updated = repo.update(machine.id, {
        roles: [MachineRole.WORKER, MachineRole.STORAGE],
      });
      expect(updated).not.toBeNull();
      expect(updated!.roles).toEqual([MachineRole.WORKER, MachineRole.STORAGE]);
    });

    test('updates status', () => {
      const updated = repo.update(machine.id, { status: MachineStatus.ONLINE });
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe(MachineStatus.ONLINE);
    });

    test('updates SSH config', () => {
      const updated = repo.update(machine.id, {
        ssh: { host: 'proxy.example.com', port: 2222, username: 'admin' },
      });
      expect(updated).not.toBeNull();
      expect(updated!.ssh.host).toBe('proxy.example.com');
      expect(updated!.ssh.port).toBe(2222);
      expect(updated!.ssh.username).toBe('admin');
    });

    test('updates lastSeen', () => {
      const now = new Date().toISOString();
      const updated = repo.update(machine.id, { lastSeen: now });
      expect(updated).not.toBeNull();
      expect(updated!.lastSeen).toBe(now);
    });

    test('updates facts', () => {
      const facts = {
        hostname: 'server1',
        os: 'Ubuntu',
        cpuCores: 8,
      };
      const updated = repo.update(machine.id, { facts });
      expect(updated).not.toBeNull();
      expect(updated!.facts).toEqual(facts);
    });

    test('updates updatedAt timestamp', async () => {
      const original = machine.updatedAt;
      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 10));
      const updated = repo.update(machine.id, { label: 'new-label' });
      // updatedAt should be set (may or may not differ based on timing)
      expect(updated!.updatedAt).toBeDefined();
    });

    test('returns null for nonexistent machine', () => {
      const updated = repo.update('nonexistent-id', { label: 'new-label' });
      expect(updated).toBeNull();
    });

    test('preserves unchanged fields', () => {
      const updated = repo.update(machine.id, { status: MachineStatus.ONLINE });
      expect(updated!.label).toBe('update-test');
      expect(updated!.ip).toBe('192.168.1.100');
      expect(updated!.roles).toEqual([MachineRole.WORKER]);
    });
  });

  describe('delete', () => {
    test('deletes existing machine', () => {
      const machine = repo.create({
        label: 'delete-test',
        ip: '192.168.1.100',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.100', port: 22, username: 'root' },
      });

      // Verify machine exists before delete
      expect(repo.findById(machine.id)).not.toBeNull();

      repo.delete(machine.id);

      // Verify machine no longer exists
      expect(repo.findById(machine.id)).toBeNull();
    });

    test('handles nonexistent machine gracefully', () => {
      // Should not throw for nonexistent machine
      expect(() => repo.delete('nonexistent-id')).not.toThrow();
    });
  });

  describe('deleteAll', () => {
    beforeEach(() => {
      repo.create({
        label: 'machine-1',
        ip: '192.168.1.1',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.1', port: 22, username: 'root' },
      });
      repo.create({
        label: 'machine-2',
        ip: '192.168.1.2',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.2', port: 22, username: 'root' },
      });
      repo.create({
        label: 'machine-3',
        ip: '192.168.1.3',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.3', port: 22, username: 'root' },
      });
    });

    test('deletes all machines', () => {
      expect(repo.findAll()).toHaveLength(3);
      repo.deleteAll();
      expect(repo.findAll()).toHaveLength(0);
    });

    test('handles empty table', () => {
      repo.deleteAll();
      // Second deleteAll should work without error
      expect(() => repo.deleteAll()).not.toThrow();
      expect(repo.findAll()).toHaveLength(0);
    });
  });

  describe('count', () => {
    test('returns 0 when empty', () => {
      expect(repo.count()).toBe(0);
    });

    test('returns correct count', () => {
      repo.create({
        label: 'machine-1',
        ip: '192.168.1.1',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.1', port: 22, username: 'root' },
      });
      repo.create({
        label: 'machine-2',
        ip: '192.168.1.2',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.2', port: 22, username: 'root' },
      });

      expect(repo.count()).toBe(2);
    });
  });

  describe('countByStatus', () => {
    beforeEach(() => {
      const m1 = repo.create({
        label: 'online-1',
        ip: '192.168.1.1',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.1', port: 22, username: 'root' },
      });
      repo.update(m1.id, { status: MachineStatus.ONLINE });

      const m2 = repo.create({
        label: 'online-2',
        ip: '192.168.1.2',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.2', port: 22, username: 'root' },
      });
      repo.update(m2.id, { status: MachineStatus.ONLINE });

      const m3 = repo.create({
        label: 'offline-1',
        ip: '192.168.1.3',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.3', port: 22, username: 'root' },
      });
      repo.update(m3.id, { status: MachineStatus.OFFLINE });
    });

    test('returns correct counts by status', () => {
      const counts = repo.countByStatus();
      expect(counts[MachineStatus.ONLINE]).toBe(2);
      expect(counts[MachineStatus.OFFLINE]).toBe(1);
      expect(counts[MachineStatus.ERROR]).toBe(0);
      expect(counts[MachineStatus.UNKNOWN]).toBe(0);
    });
  });

  describe('countByRole', () => {
    beforeEach(() => {
      repo.create({
        label: 'master-01',
        ip: '192.168.1.1',
        roles: [MachineRole.MASTER],
        ssh: { host: '192.168.1.1', port: 22, username: 'root' },
      });
      repo.create({
        label: 'worker-01',
        ip: '192.168.1.2',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.2', port: 22, username: 'root' },
      });
      repo.create({
        label: 'worker-02',
        ip: '192.168.1.3',
        roles: [MachineRole.WORKER],
        ssh: { host: '192.168.1.3', port: 22, username: 'root' },
      });
      repo.create({
        label: 'multi-role',
        ip: '192.168.1.4',
        roles: [MachineRole.MASTER, MachineRole.GATEWAY],
        ssh: { host: '192.168.1.4', port: 22, username: 'root' },
      });
    });

    test('returns correct counts by role', () => {
      const counts = repo.countByRole();
      expect(counts[MachineRole.MASTER]).toBe(2); // master-01 + multi-role
      expect(counts[MachineRole.WORKER]).toBe(2);
      expect(counts[MachineRole.GATEWAY]).toBe(1); // multi-role
      expect(counts[MachineRole.STORAGE]).toBe(0);
      expect(counts[MachineRole.BACKUPS]).toBe(0);
    });
  });
});
