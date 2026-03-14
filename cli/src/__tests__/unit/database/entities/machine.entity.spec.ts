import { describe, test, expect } from 'bun:test';
import {
  MachineRole,
  MachineStatus,
  machineSchema,
  areRolesCompatible,
  entityToMachine,
  machineToEntity,
  type MachineEntity,
  type Machine,
} from '../../../../database/entities/machine.entity';

describe('machine entity', () => {
  describe('enums', () => {
    test('MachineRole has expected values', () => {
      expect(MachineRole.MASTER).toBe('master');
      expect(MachineRole.WORKER).toBe('worker');
      expect(MachineRole.GATEWAY).toBe('gateway');
      expect(MachineRole.STORAGE).toBe('storage');
      expect(MachineRole.BACKUPS).toBe('backups');
    });

    test('MachineStatus has expected values', () => {
      expect(MachineStatus.ONLINE).toBe('online');
      expect(MachineStatus.OFFLINE).toBe('offline');
      expect(MachineStatus.ERROR).toBe('error');
      expect(MachineStatus.UNKNOWN).toBe('unknown');
    });
  });

  describe('areRolesCompatible', () => {
    describe('single roles', () => {
      test('single role is always compatible', () => {
        expect(areRolesCompatible([MachineRole.MASTER])).toBe(true);
        expect(areRolesCompatible([MachineRole.WORKER])).toBe(true);
        expect(areRolesCompatible([MachineRole.GATEWAY])).toBe(true);
        expect(areRolesCompatible([MachineRole.STORAGE])).toBe(true);
        expect(areRolesCompatible([MachineRole.BACKUPS])).toBe(true);
      });

      test('empty array is compatible', () => {
        expect(areRolesCompatible([])).toBe(true);
      });
    });

    describe('gateway combinations', () => {
      test('gateway + master is compatible', () => {
        expect(areRolesCompatible([MachineRole.GATEWAY, MachineRole.MASTER])).toBe(true);
      });

      test('gateway + worker is incompatible', () => {
        expect(areRolesCompatible([MachineRole.GATEWAY, MachineRole.WORKER])).toBe(false);
      });

      test('gateway + storage is incompatible', () => {
        expect(areRolesCompatible([MachineRole.GATEWAY, MachineRole.STORAGE])).toBe(false);
      });
    });

    describe('backups combinations', () => {
      test('backups + any other role is incompatible', () => {
        expect(areRolesCompatible([MachineRole.BACKUPS, MachineRole.MASTER])).toBe(false);
        expect(areRolesCompatible([MachineRole.BACKUPS, MachineRole.WORKER])).toBe(false);
        expect(areRolesCompatible([MachineRole.BACKUPS, MachineRole.GATEWAY])).toBe(false);
        expect(areRolesCompatible([MachineRole.BACKUPS, MachineRole.STORAGE])).toBe(false);
      });
    });

    describe('other combinations', () => {
      test('master + worker is compatible', () => {
        expect(areRolesCompatible([MachineRole.MASTER, MachineRole.WORKER])).toBe(true);
      });

      test('master + storage is compatible', () => {
        expect(areRolesCompatible([MachineRole.MASTER, MachineRole.STORAGE])).toBe(true);
      });

      test('worker + storage is compatible', () => {
        expect(areRolesCompatible([MachineRole.WORKER, MachineRole.STORAGE])).toBe(true);
      });

      test('master + worker + storage is compatible', () => {
        expect(
          areRolesCompatible([MachineRole.MASTER, MachineRole.WORKER, MachineRole.STORAGE]),
        ).toBe(true);
      });
    });
  });

  describe('machineSchema', () => {
    const validMachine = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      label: 'master-01',
      ip: '192.168.1.10',
      roles: [MachineRole.MASTER],
      status: MachineStatus.ONLINE,
      ssh: {
        host: '192.168.1.10',
        port: 22,
        username: 'root',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    test('accepts valid machine', () => {
      const result = machineSchema.safeParse(validMachine);
      expect(result.success).toBe(true);
    });

    test('accepts machine with optional fields', () => {
      const result = machineSchema.safeParse({
        ...validMachine,
        ssh: {
          ...validMachine.ssh,
          privateKeyPath: '/home/user/.ssh/id_rsa',
          password: 'secret',
        },
        lastSeen: new Date().toISOString(),
        facts: { hostname: 'server1', cpuCores: 8 },
      });
      expect(result.success).toBe(true);
    });

    test('rejects invalid UUID', () => {
      const result = machineSchema.safeParse({
        ...validMachine,
        id: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });

    test('rejects empty label', () => {
      const result = machineSchema.safeParse({
        ...validMachine,
        label: '',
      });
      expect(result.success).toBe(false);
    });

    test('rejects label too long', () => {
      const result = machineSchema.safeParse({
        ...validMachine,
        label: 'a'.repeat(65),
      });
      expect(result.success).toBe(false);
    });

    test('rejects invalid IP', () => {
      const result = machineSchema.safeParse({
        ...validMachine,
        ip: 'not-an-ip',
      });
      expect(result.success).toBe(false);
    });

    test('rejects empty roles', () => {
      const result = machineSchema.safeParse({
        ...validMachine,
        roles: [],
      });
      expect(result.success).toBe(false);
    });

    test('rejects invalid status', () => {
      const result = machineSchema.safeParse({
        ...validMachine,
        status: 'invalid-status',
      });
      expect(result.success).toBe(false);
    });

    test('rejects invalid port', () => {
      const result = machineSchema.safeParse({
        ...validMachine,
        ssh: { ...validMachine.ssh, port: 0 },
      });
      expect(result.success).toBe(false);

      const result2 = machineSchema.safeParse({
        ...validMachine,
        ssh: { ...validMachine.ssh, port: 70000 },
      });
      expect(result2.success).toBe(false);
    });
  });

  describe('entityToMachine', () => {
    test('converts entity to domain model', () => {
      const entity: MachineEntity = {
        id: 'machine-123',
        label: 'master-01',
        ip: '192.168.1.10',
        roles: [MachineRole.MASTER, MachineRole.GATEWAY],
        status: MachineStatus.ONLINE,
        sshHost: '192.168.1.10',
        sshPort: 22,
        sshUsername: 'root',
        sshPrivateKeyPath: '/root/.ssh/id_rsa',
        lastSeen: '2024-01-01T00:00:00Z',
        facts: JSON.stringify({ hostname: 'server1', cpuCores: 8 }),
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const machine = entityToMachine(entity);

      expect(machine.id).toBe('machine-123');
      expect(machine.label).toBe('master-01');
      expect(machine.ip).toBe('192.168.1.10');
      expect(machine.roles).toEqual([MachineRole.MASTER, MachineRole.GATEWAY]);
      expect(machine.status).toBe(MachineStatus.ONLINE);
      expect(machine.ssh.host).toBe('192.168.1.10');
      expect(machine.ssh.port).toBe(22);
      expect(machine.ssh.username).toBe('root');
      expect(machine.ssh.privateKeyPath).toBe('/root/.ssh/id_rsa');
      expect(machine.lastSeen).toBe('2024-01-01T00:00:00Z');
      expect(machine.facts).toEqual({ hostname: 'server1', cpuCores: 8 });
    });

    test('handles missing optional fields', () => {
      const entity: MachineEntity = {
        id: 'machine-456',
        label: 'worker-01',
        ip: '192.168.1.11',
        roles: [MachineRole.WORKER],
        status: MachineStatus.UNKNOWN,
        sshHost: '192.168.1.11',
        sshPort: 22,
        sshUsername: 'admin',
        sshPrivateKeyPath: undefined,
        lastSeen: undefined,
        facts: undefined,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const machine = entityToMachine(entity);

      expect(machine.ssh.privateKeyPath).toBeUndefined();
      expect(machine.lastSeen).toBeUndefined();
      expect(machine.facts).toBeUndefined();
    });
  });

  describe('machineToEntity', () => {
    test('converts domain model to entity', () => {
      const machine: Machine = {
        id: 'machine-789',
        label: 'storage-01',
        ip: '192.168.1.12',
        roles: [MachineRole.STORAGE],
        status: MachineStatus.OFFLINE,
        ssh: {
          host: 'proxy.example.com',
          port: 2222,
          username: 'deploy',
          privateKeyPath: '/home/deploy/.ssh/key',
        },
        lastSeen: '2024-01-01T12:00:00Z',
        facts: { diskTotal: 1000000000000 },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T12:00:00Z',
      };

      const entity = machineToEntity(machine);

      expect(entity.id).toBe('machine-789');
      expect(entity.label).toBe('storage-01');
      expect(entity.ip).toBe('192.168.1.12');
      expect(entity.roles).toEqual([MachineRole.STORAGE]);
      expect(entity.status).toBe(MachineStatus.OFFLINE);
      expect(entity.sshHost).toBe('proxy.example.com');
      expect(entity.sshPort).toBe(2222);
      expect(entity.sshUsername).toBe('deploy');
      expect(entity.sshPrivateKeyPath).toBe('/home/deploy/.ssh/key');
      expect(entity.lastSeen).toBe('2024-01-01T12:00:00Z');
      expect(entity.facts).toBe(JSON.stringify({ diskTotal: 1000000000000 }));
    });

    test('handles missing optional fields', () => {
      const machine: Machine = {
        id: 'machine-abc',
        label: 'worker-02',
        ip: '192.168.1.13',
        roles: [MachineRole.WORKER],
        status: MachineStatus.ONLINE,
        ssh: {
          host: '192.168.1.13',
          port: 22,
          username: 'root',
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const entity = machineToEntity(machine);

      expect(entity.sshPrivateKeyPath).toBeUndefined();
      expect(entity.lastSeen).toBeUndefined();
      expect(entity.facts).toBeUndefined();
    });
  });

  describe('roundtrip conversion', () => {
    test('entity -> machine -> entity preserves data', () => {
      const originalEntity: MachineEntity = {
        id: 'roundtrip-test',
        label: 'test-machine',
        ip: '10.0.0.1',
        roles: [MachineRole.MASTER, MachineRole.GATEWAY],
        status: MachineStatus.ONLINE,
        sshHost: '10.0.0.1',
        sshPort: 22,
        sshUsername: 'root',
        sshPrivateKeyPath: '/root/.ssh/id_rsa',
        lastSeen: '2024-01-01T00:00:00Z',
        facts: JSON.stringify({ hostname: 'test', cpuCores: 4 }),
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const machine = entityToMachine(originalEntity);
      const convertedEntity = machineToEntity(machine);

      expect(convertedEntity.id).toBe(originalEntity.id);
      expect(convertedEntity.label).toBe(originalEntity.label);
      expect(convertedEntity.ip).toBe(originalEntity.ip);
      expect(convertedEntity.roles).toEqual(originalEntity.roles);
      expect(convertedEntity.status).toBe(originalEntity.status);
      expect(convertedEntity.sshHost).toBe(originalEntity.sshHost);
      expect(convertedEntity.sshPort).toBe(originalEntity.sshPort);
      expect(convertedEntity.sshUsername).toBe(originalEntity.sshUsername);
      expect(convertedEntity.sshPrivateKeyPath).toBe(originalEntity.sshPrivateKeyPath);
      expect(convertedEntity.lastSeen).toBe(originalEntity.lastSeen);
      expect(convertedEntity.facts).toBe(originalEntity.facts);
    });
  });
});
