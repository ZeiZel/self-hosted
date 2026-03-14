import { describe, test, expect } from 'bun:test';
import { CliError, CliErrorType, Errors } from '../../../shared/errors/cli-error';

describe('CliError (shared)', () => {
  describe('constructor', () => {
    test('creates error with type and message', () => {
      const error = new CliError(CliErrorType.CONFIG_ERROR, 'Config failed');
      expect(error.type).toBe(CliErrorType.CONFIG_ERROR);
      expect(error.message).toBe('Config failed');
      expect(error.name).toBe('CliError');
    });

    test('creates error with all options', () => {
      const cause = new Error('Original');
      const error = new CliError(CliErrorType.NETWORK_ERROR, 'Network failed', {
        hint: 'Check connection',
        details: 'Connection refused',
        cause,
      });

      expect(error.hint).toBe('Check connection');
      expect(error.details).toBe('Connection refused');
      expect(error.cause).toBe(cause);
    });
  });

  describe('format', () => {
    test('formats basic error', () => {
      const error = new CliError(CliErrorType.CONFIG_ERROR, 'Test error');
      const formatted = error.format(false, false);
      expect(formatted).toContain('Error: Test error');
    });

    test('includes hint', () => {
      const error = new CliError(CliErrorType.CONFIG_ERROR, 'Test', {
        hint: 'Try this',
      });
      const formatted = error.format(false, false);
      expect(formatted).toContain('Hint: Try this');
    });

    test('includes details', () => {
      const error = new CliError(CliErrorType.CONFIG_ERROR, 'Test', {
        details: 'More info',
      });
      const formatted = error.format(false, false);
      expect(formatted).toContain('More info');
    });

    test('includes stack trace in verbose mode', () => {
      const error = new CliError(CliErrorType.CONFIG_ERROR, 'Test');
      const formatted = error.format(true, false);
      expect(formatted).toContain('Stack trace:');
    });

    test('formats with color when enabled', () => {
      const error = new CliError(CliErrorType.CONFIG_ERROR, 'Test');
      const formatted = error.format(false, true);
      // Chalk adds ANSI codes
      expect(formatted.length).toBeGreaterThan(0);
    });
  });

  describe('toJSON', () => {
    test('converts to JSON object', () => {
      const error = new CliError(CliErrorType.CONFIG_ERROR, 'Test error', {
        hint: 'Try this',
        details: 'More info',
      });

      const json = error.toJSON();

      expect(json.error).toBe(true);
      expect(json.type).toBe(CliErrorType.CONFIG_ERROR);
      expect(json.message).toBe('Test error');
      expect(json.hint).toBe('Try this');
      expect(json.details).toBe('More info');
    });
  });

  describe('Errors factory', () => {
    test('notInRepo creates correct error', () => {
      const error = Errors.notInRepo();
      expect(error.type).toBe(CliErrorType.NOT_IN_REPO);
      expect(error.hint).toBeDefined();
      expect(error.details).toBeDefined();
    });

    test('notInitialized creates correct error', () => {
      const error = Errors.notInitialized();
      expect(error.type).toBe(CliErrorType.NOT_INITIALIZED);
      expect(error.hint).toContain('selfhost init');
    });

    test('configNotLoaded creates correct error', () => {
      const error = Errors.configNotLoaded();
      expect(error.type).toBe(CliErrorType.CONFIG_ERROR);
    });

    test('databaseError creates correct error', () => {
      const cause = new Error('SQLITE_BUSY');
      const error = Errors.databaseError('Database locked', cause);
      expect(error.type).toBe(CliErrorType.DATABASE_ERROR);
      expect(error.message).toContain('Database locked');
      expect(error.cause).toBe(cause);
    });

    test('noMachinesConfigured creates correct error', () => {
      const error = Errors.noMachinesConfigured();
      expect(error.type).toBe(CliErrorType.CONFIG_ERROR);
      expect(error.hint).toContain('inventory add');
    });

    test('noServicesSelected creates correct error', () => {
      const error = Errors.noServicesSelected();
      expect(error.type).toBe(CliErrorType.CONFIG_ERROR);
      expect(error.hint).toContain('services select');
    });

    test('machineNotFound creates correct error', () => {
      const error = Errors.machineNotFound('master-01');
      expect(error.type).toBe(CliErrorType.CONFIG_ERROR);
      expect(error.message).toContain('master-01');
    });

    test('serviceNotFound creates correct error', () => {
      const error = Errors.serviceNotFound('traefik');
      expect(error.type).toBe(CliErrorType.CONFIG_ERROR);
      expect(error.message).toContain('traefik');
    });

    test('validationFailed creates correct error', () => {
      const error = Errors.validationFailed(['Error 1', 'Error 2']);
      expect(error.type).toBe(CliErrorType.VALIDATION_ERROR);
      expect(error.details).toContain('Error 1');
      expect(error.details).toContain('Error 2');
    });

    test('dependencyMissing creates correct error', () => {
      const error = Errors.dependencyMissing('kubectl');
      expect(error.type).toBe(CliErrorType.DEPENDENCY_ERROR);
      expect(error.message).toContain('kubectl');
    });

    test('permissionDenied creates correct error', () => {
      const error = Errors.permissionDenied('/etc/hosts');
      expect(error.type).toBe(CliErrorType.PERMISSION_ERROR);
      expect(error.message).toContain('/etc/hosts');
    });

    test('networkError creates correct error', () => {
      const cause = new Error('Connection refused');
      const error = Errors.networkError('API call', cause);
      expect(error.type).toBe(CliErrorType.NETWORK_ERROR);
      expect(error.cause).toBe(cause);
    });

    describe('wrap', () => {
      test('returns CliError unchanged', () => {
        const original = new CliError(CliErrorType.CONFIG_ERROR, 'Test');
        expect(Errors.wrap(original)).toBe(original);
      });

      test('wraps Error with context', () => {
        const error = new Error('Something failed');
        const wrapped = Errors.wrap(error, 'Context');
        expect(wrapped.message).toContain('Context');
        expect(wrapped.message).toContain('Something failed');
      });

      test('wraps string error', () => {
        const wrapped = Errors.wrap('String error');
        expect(wrapped.message).toContain('String error');
      });

      test('identifies NOT_IN_REPO pattern', () => {
        const error = new Error('Not in a valid selfhost repository');
        const wrapped = Errors.wrap(error);
        expect(wrapped.type).toBe(CliErrorType.NOT_IN_REPO);
      });

      test('identifies config not loaded pattern', () => {
        const error = new Error('Configuration not loaded');
        const wrapped = Errors.wrap(error);
        expect(wrapped.type).toBe(CliErrorType.CONFIG_ERROR);
      });

      test('identifies SQLITE/database pattern', () => {
        const error = new Error('SQLITE_BUSY: database is locked');
        const wrapped = Errors.wrap(error);
        expect(wrapped.type).toBe(CliErrorType.DATABASE_ERROR);
      });

      test('identifies ENOENT pattern', () => {
        const error = new Error('ENOENT: no such file');
        const wrapped = Errors.wrap(error, 'Reading');
        expect(wrapped.type).toBe(CliErrorType.CONFIG_ERROR);
        expect(wrapped.message).toContain('File or directory not found');
      });

      test('identifies EACCES pattern', () => {
        const error = new Error('EACCES: permission denied');
        const wrapped = Errors.wrap(error);
        expect(wrapped.type).toBe(CliErrorType.PERMISSION_ERROR);
      });

      test('identifies ECONNREFUSED pattern', () => {
        const error = new Error('ECONNREFUSED');
        const wrapped = Errors.wrap(error, 'Connecting');
        expect(wrapped.type).toBe(CliErrorType.NETWORK_ERROR);
      });

      test('identifies ETIMEDOUT pattern', () => {
        const error = new Error('ETIMEDOUT');
        const wrapped = Errors.wrap(error);
        expect(wrapped.type).toBe(CliErrorType.NETWORK_ERROR);
      });

      test('wraps unknown errors', () => {
        const error = new Error('Unknown error type');
        const wrapped = Errors.wrap(error);
        expect(wrapped.type).toBe(CliErrorType.UNKNOWN);
      });
    });
  });

  describe('CliErrorType enum', () => {
    test('has all expected types', () => {
      expect(CliErrorType.NOT_IN_REPO).toBe('NOT_IN_REPO');
      expect(CliErrorType.NOT_INITIALIZED).toBe('NOT_INITIALIZED');
      expect(CliErrorType.CONFIG_ERROR).toBe('CONFIG_ERROR');
      expect(CliErrorType.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
      expect(CliErrorType.SERVICE_ERROR).toBe('SERVICE_ERROR');
      expect(CliErrorType.NETWORK_ERROR).toBe('NETWORK_ERROR');
      expect(CliErrorType.PERMISSION_ERROR).toBe('PERMISSION_ERROR');
      expect(CliErrorType.DEPENDENCY_ERROR).toBe('DEPENDENCY_ERROR');
      expect(CliErrorType.DATABASE_ERROR).toBe('DATABASE_ERROR');
      expect(CliErrorType.UNKNOWN).toBe('UNKNOWN');
    });
  });
});
