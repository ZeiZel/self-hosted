import { describe, test, expect } from 'bun:test';
import {
  CliError,
  CliErrorType,
  Errors,
  formatError,
  isCliError,
} from '../../../utils/errors';

describe('error utilities', () => {
  describe('CliError', () => {
    test('creates error with type and message', () => {
      const error = new CliError(CliErrorType.CONFIG_ERROR, 'Config failed');
      expect(error.type).toBe(CliErrorType.CONFIG_ERROR);
      expect(error.message).toBe('Config failed');
      expect(error.name).toBe('CliError');
    });

    test('creates error with hint', () => {
      const error = new CliError(CliErrorType.NOT_IN_REPO, 'Not in repo', {
        hint: 'Run from repo root',
      });
      expect(error.hint).toBe('Run from repo root');
    });

    test('creates error with details', () => {
      const error = new CliError(CliErrorType.VALIDATION_ERROR, 'Validation failed', {
        details: 'Field X is invalid',
      });
      expect(error.details).toBe('Field X is invalid');
    });

    test('creates error with cause', () => {
      const cause = new Error('Original error');
      const error = new CliError(CliErrorType.NETWORK_ERROR, 'Network failed', {
        cause,
      });
      expect(error.cause).toBe(cause);
    });

    describe('format', () => {
      test('formats basic error message', () => {
        const error = new CliError(CliErrorType.CONFIG_ERROR, 'Config failed');
        const formatted = error.format();
        expect(formatted).toContain('Error: Config failed');
      });

      test('includes hint when present', () => {
        const error = new CliError(CliErrorType.NOT_IN_REPO, 'Not in repo', {
          hint: 'Run from repo root',
        });
        const formatted = error.format();
        expect(formatted).toContain('Hint: Run from repo root');
      });

      test('includes details when present', () => {
        const error = new CliError(CliErrorType.VALIDATION_ERROR, 'Failed', {
          details: 'Missing required field',
        });
        const formatted = error.format();
        expect(formatted).toContain('Missing required field');
      });

      test('includes stack trace in verbose mode', () => {
        const error = new CliError(CliErrorType.UNKNOWN, 'Unknown error');
        const formatted = error.format(true);
        expect(formatted).toContain('Stack trace:');
      });

      test('does not include stack trace in non-verbose mode', () => {
        const error = new CliError(CliErrorType.UNKNOWN, 'Unknown error');
        const formatted = error.format(false);
        expect(formatted).not.toContain('Stack trace:');
      });
    });
  });

  describe('Errors factory', () => {
    describe('notInRepo', () => {
      test('creates NOT_IN_REPO error', () => {
        const error = Errors.notInRepo();
        expect(error.type).toBe(CliErrorType.NOT_IN_REPO);
        expect(error.message).toContain('selfhost repository');
        expect(error.hint).toBeDefined();
        expect(error.details).toBeDefined();
      });
    });

    describe('notInitialized', () => {
      test('creates NOT_INITIALIZED error', () => {
        const error = Errors.notInitialized();
        expect(error.type).toBe(CliErrorType.NOT_INITIALIZED);
        expect(error.message).toContain('not initialized');
        expect(error.hint).toContain('selfhost init');
      });
    });

    describe('configNotLoaded', () => {
      test('creates CONFIG_ERROR error', () => {
        const error = Errors.configNotLoaded();
        expect(error.type).toBe(CliErrorType.CONFIG_ERROR);
        expect(error.message).toContain('Configuration');
      });
    });

    describe('noMachinesConfigured', () => {
      test('creates CONFIG_ERROR error', () => {
        const error = Errors.noMachinesConfigured();
        expect(error.type).toBe(CliErrorType.CONFIG_ERROR);
        expect(error.message).toContain('No machines');
        expect(error.hint).toContain('inventory add');
      });
    });

    describe('noServicesSelected', () => {
      test('creates CONFIG_ERROR error', () => {
        const error = Errors.noServicesSelected();
        expect(error.type).toBe(CliErrorType.CONFIG_ERROR);
        expect(error.message).toContain('No services');
        expect(error.hint).toContain('services select');
      });
    });

    describe('machineNotFound', () => {
      test('creates CONFIG_ERROR error with identifier', () => {
        const error = Errors.machineNotFound('master-01');
        expect(error.type).toBe(CliErrorType.CONFIG_ERROR);
        expect(error.message).toContain('master-01');
        expect(error.hint).toContain('inventory list');
      });
    });

    describe('serviceNotFound', () => {
      test('creates CONFIG_ERROR error with name', () => {
        const error = Errors.serviceNotFound('traefik');
        expect(error.type).toBe(CliErrorType.CONFIG_ERROR);
        expect(error.message).toContain('traefik');
        expect(error.hint).toContain('services list');
      });
    });

    describe('validationFailed', () => {
      test('creates VALIDATION_ERROR with error list', () => {
        const errors = ['Field A is invalid', 'Field B is required'];
        const error = Errors.validationFailed(errors);
        expect(error.type).toBe(CliErrorType.VALIDATION_ERROR);
        expect(error.message).toBe('Validation failed');
        expect(error.details).toContain('Field A is invalid');
        expect(error.details).toContain('Field B is required');
      });
    });

    describe('dependencyMissing', () => {
      test('creates DEPENDENCY_ERROR error', () => {
        const error = Errors.dependencyMissing('kubectl');
        expect(error.type).toBe(CliErrorType.DEPENDENCY_ERROR);
        expect(error.message).toContain('kubectl');
      });
    });

    describe('permissionDenied', () => {
      test('creates PERMISSION_ERROR error', () => {
        const error = Errors.permissionDenied('/etc/hosts');
        expect(error.type).toBe(CliErrorType.PERMISSION_ERROR);
        expect(error.message).toContain('/etc/hosts');
      });
    });

    describe('networkError', () => {
      test('creates NETWORK_ERROR error', () => {
        const error = Errors.networkError('connecting to API');
        expect(error.type).toBe(CliErrorType.NETWORK_ERROR);
        expect(error.message).toContain('connecting to API');
      });

      test('includes cause when provided', () => {
        const cause = new Error('Connection refused');
        const error = Errors.networkError('API call', cause);
        expect(error.cause).toBe(cause);
        expect(error.details).toContain('Connection refused');
      });
    });

    describe('wrap', () => {
      test('returns CliError unchanged', () => {
        const original = new CliError(CliErrorType.CONFIG_ERROR, 'Test');
        const wrapped = Errors.wrap(original);
        expect(wrapped).toBe(original);
      });

      test('wraps Error with context', () => {
        const original = new Error('Something went wrong');
        const wrapped = Errors.wrap(original, 'Processing');
        expect(wrapped.type).toBe(CliErrorType.UNKNOWN);
        expect(wrapped.message).toContain('Processing');
        expect(wrapped.message).toContain('Something went wrong');
      });

      test('wraps string error', () => {
        const wrapped = Errors.wrap('String error');
        expect(wrapped.type).toBe(CliErrorType.UNKNOWN);
        expect(wrapped.message).toContain('String error');
      });

      test('identifies NOT_IN_REPO error pattern', () => {
        const error = new Error('Not in a valid selfhost repository');
        const wrapped = Errors.wrap(error);
        expect(wrapped.type).toBe(CliErrorType.NOT_IN_REPO);
      });

      test('identifies config not loaded pattern', () => {
        const error = new Error('Configuration not loaded');
        const wrapped = Errors.wrap(error);
        expect(wrapped.type).toBe(CliErrorType.CONFIG_ERROR);
      });

      test('identifies ENOENT error pattern', () => {
        const error = new Error("ENOENT: no such file or directory '/path/to/file'");
        const wrapped = Errors.wrap(error, 'Reading config');
        expect(wrapped.type).toBe(CliErrorType.CONFIG_ERROR);
        expect(wrapped.message).toContain('File or directory not found');
      });

      test('identifies EACCES error pattern', () => {
        const error = new Error('EACCES: permission denied');
        const wrapped = Errors.wrap(error);
        expect(wrapped.type).toBe(CliErrorType.PERMISSION_ERROR);
      });

      test('identifies permission denied message', () => {
        const error = new Error('permission denied writing to file');
        const wrapped = Errors.wrap(error);
        expect(wrapped.type).toBe(CliErrorType.PERMISSION_ERROR);
      });

      test('identifies ECONNREFUSED error pattern', () => {
        const error = new Error('ECONNREFUSED: connection refused');
        const wrapped = Errors.wrap(error, 'API call');
        expect(wrapped.type).toBe(CliErrorType.NETWORK_ERROR);
      });

      test('identifies ETIMEDOUT error pattern', () => {
        const error = new Error('ETIMEDOUT: connection timed out');
        const wrapped = Errors.wrap(error);
        expect(wrapped.type).toBe(CliErrorType.NETWORK_ERROR);
      });
    });
  });

  describe('formatError', () => {
    test('formats CliError', () => {
      const error = new CliError(CliErrorType.CONFIG_ERROR, 'Test error');
      const formatted = formatError(error);
      expect(formatted).toContain('Error: Test error');
    });

    test('formats regular Error by wrapping', () => {
      const error = new Error('Regular error');
      const formatted = formatError(error);
      expect(formatted).toContain('Error:');
      expect(formatted).toContain('Regular error');
    });

    test('formats string error', () => {
      const formatted = formatError('String error');
      expect(formatted).toContain('String error');
    });

    test('includes stack trace in verbose mode', () => {
      const error = new Error('Test error');
      const formatted = formatError(error, true);
      expect(formatted).toContain('Stack trace:');
    });
  });

  describe('isCliError', () => {
    test('returns true for CliError', () => {
      const error = new CliError(CliErrorType.CONFIG_ERROR, 'Test');
      expect(isCliError(error)).toBe(true);
    });

    test('returns false for regular Error', () => {
      const error = new Error('Regular error');
      expect(isCliError(error)).toBe(false);
    });

    test('returns false for non-error values', () => {
      expect(isCliError('string')).toBe(false);
      expect(isCliError(null)).toBe(false);
      expect(isCliError(undefined)).toBe(false);
      expect(isCliError({})).toBe(false);
    });

    test('checks error type when provided', () => {
      const error = new CliError(CliErrorType.CONFIG_ERROR, 'Test');
      expect(isCliError(error, CliErrorType.CONFIG_ERROR)).toBe(true);
      expect(isCliError(error, CliErrorType.NOT_IN_REPO)).toBe(false);
    });

    test('returns true for any type when type not specified', () => {
      const configError = new CliError(CliErrorType.CONFIG_ERROR, 'Test');
      const networkError = new CliError(CliErrorType.NETWORK_ERROR, 'Test');
      expect(isCliError(configError)).toBe(true);
      expect(isCliError(networkError)).toBe(true);
    });
  });
});
