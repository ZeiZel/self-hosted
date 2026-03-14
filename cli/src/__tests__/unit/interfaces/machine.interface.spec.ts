import { describe, test, expect } from 'bun:test';
import { MachineRole, areRolesCompatible, machineSchema } from '../../../interfaces/machine.interface';

describe('machine interface', () => {
  describe('MachineRole enum', () => {
    test('has correct values', () => {
      expect(MachineRole.MASTER).toBe('master' as MachineRole);
      expect(MachineRole.WORKER).toBe('worker' as MachineRole);
      expect(MachineRole.GATEWAY).toBe('gateway' as MachineRole);
      expect(MachineRole.STORAGE).toBe('storage' as MachineRole);
      expect(MachineRole.BACKUPS).toBe('backups' as MachineRole);
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

      test('empty roles array is compatible', () => {
        expect(areRolesCompatible([])).toBe(true);
      });
    });

    describe('compatible role combinations', () => {
      test('master + gateway is compatible', () => {
        expect(areRolesCompatible([MachineRole.MASTER, MachineRole.GATEWAY])).toBe(true);
      });

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

      test('master + worker is compatible', () => {
        expect(
          areRolesCompatible([MachineRole.MASTER, MachineRole.WORKER]),
        ).toBe(true);
      });
    });

    describe('incompatible role combinations', () => {
      test('backups + any other role is incompatible', () => {
        expect(areRolesCompatible([MachineRole.BACKUPS, MachineRole.MASTER])).toBe(false);
        expect(areRolesCompatible([MachineRole.BACKUPS, MachineRole.WORKER])).toBe(false);
        expect(areRolesCompatible([MachineRole.BACKUPS, MachineRole.GATEWAY])).toBe(false);
        expect(areRolesCompatible([MachineRole.BACKUPS, MachineRole.STORAGE])).toBe(false);
      });

      test('gateway alone cannot combine with worker', () => {
        expect(areRolesCompatible([MachineRole.GATEWAY, MachineRole.WORKER])).toBe(false);
      });

      test('gateway alone cannot combine with storage', () => {
        expect(areRolesCompatible([MachineRole.GATEWAY, MachineRole.STORAGE])).toBe(false);
      });
    });
  });

  describe('machineSchema', () => {
    const validMachine = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      label: 'master-01',
      ip: '192.168.1.10',
      roles: [MachineRole.MASTER],
      ssh: {
        host: '192.168.1.10',
        port: 22,
        username: 'root',
      },
      status: 'online' as const,
    };

    describe('valid machines', () => {
      test('accepts valid machine with required fields', () => {
        const result = machineSchema.safeParse(validMachine);
        expect(result.success).toBe(true);
      });

      test('accepts machine with multiple roles', () => {
        const result = machineSchema.safeParse({
          ...validMachine,
          roles: [MachineRole.MASTER, MachineRole.GATEWAY],
        });
        expect(result.success).toBe(true);
      });

      test('accepts machine with SSH key path', () => {
        const result = machineSchema.safeParse({
          ...validMachine,
          ssh: {
            ...validMachine.ssh,
            privateKeyPath: '/home/user/.ssh/id_rsa',
          },
        });
        expect(result.success).toBe(true);
      });

      test('accepts machine with facts', () => {
        const result = machineSchema.safeParse({
          ...validMachine,
          facts: {
            hostname: 'server1',
            os: 'Ubuntu',
            osVersion: '22.04',
            kernel: '5.15.0',
            arch: 'x86_64',
            cpuCores: 8,
            cpuModel: 'AMD Ryzen',
            memoryTotal: 16000000000,
            memoryAvailable: 8000000000,
            diskTotal: 500000000000,
            diskAvailable: 250000000000,
          },
        });
        expect(result.success).toBe(true);
      });

      test('accepts machine with lastSeen', () => {
        const result = machineSchema.safeParse({
          ...validMachine,
          lastSeen: new Date().toISOString(),
        });
        expect(result.success).toBe(true);
      });
    });

    describe('invalid machines', () => {
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

      test('rejects label starting with hyphen', () => {
        const result = machineSchema.safeParse({
          ...validMachine,
          label: '-invalid',
        });
        expect(result.success).toBe(false);
      });

      test('rejects label ending with hyphen', () => {
        const result = machineSchema.safeParse({
          ...validMachine,
          label: 'invalid-',
        });
        expect(result.success).toBe(false);
      });

      test('rejects label with uppercase', () => {
        const result = machineSchema.safeParse({
          ...validMachine,
          label: 'Invalid',
        });
        expect(result.success).toBe(false);
      });

      test('rejects invalid IP address', () => {
        const result = machineSchema.safeParse({
          ...validMachine,
          ip: 'not-an-ip',
        });
        expect(result.success).toBe(false);
      });

      test('rejects empty roles array', () => {
        const result = machineSchema.safeParse({
          ...validMachine,
          roles: [],
        });
        expect(result.success).toBe(false);
      });

      test('rejects invalid role', () => {
        const result = machineSchema.safeParse({
          ...validMachine,
          roles: ['invalid-role'],
        });
        expect(result.success).toBe(false);
      });

      test('rejects invalid SSH port', () => {
        const result = machineSchema.safeParse({
          ...validMachine,
          ssh: {
            ...validMachine.ssh,
            port: 0,
          },
        });
        expect(result.success).toBe(false);
      });

      test('rejects SSH port > 65535', () => {
        const result = machineSchema.safeParse({
          ...validMachine,
          ssh: {
            ...validMachine.ssh,
            port: 70000,
          },
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

      test('rejects invalid lastSeen format', () => {
        const result = machineSchema.safeParse({
          ...validMachine,
          lastSeen: 'not-a-date',
        });
        expect(result.success).toBe(false);
      });
    });

    describe('default values', () => {
      test('defaults SSH port to 22', () => {
        const result = machineSchema.safeParse({
          ...validMachine,
          ssh: {
            host: '192.168.1.10',
            username: 'root',
          },
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.ssh.port).toBe(22);
        }
      });

      test('defaults SSH username to root', () => {
        const result = machineSchema.safeParse({
          ...validMachine,
          ssh: {
            host: '192.168.1.10',
          },
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.ssh.username).toBe('root');
        }
      });

      test('defaults status to unknown', () => {
        const machineWithoutStatus = { ...validMachine };
        delete (machineWithoutStatus as { status?: string }).status;
        const result = machineSchema.safeParse(machineWithoutStatus);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe('unknown');
        }
      });
    });
  });
});
