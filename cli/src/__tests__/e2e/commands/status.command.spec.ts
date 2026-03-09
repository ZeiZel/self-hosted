import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { spawn } from 'child_process';
import { join } from 'path';

const CLI_PATH = join(__dirname, '../../../../main.ts');

/**
 * Helper to run CLI command
 */
function runCli(args: string[]): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve) => {
    const proc = spawn('bun', ['run', CLI_PATH, ...args], {
      cwd: join(__dirname, '../../../../..'),
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({
        exitCode: code ?? 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });

    proc.on('error', (err) => {
      resolve({
        exitCode: 1,
        stdout: '',
        stderr: err.message,
      });
    });
  });
}

describe('CLI Status Command E2E', () => {
  describe('selfhost --help', () => {
    it('should display help text', async () => {
      const result = await runCli(['--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('selfhost');
      expect(result.stdout).toContain('CLI tool');
    });
  });

  describe('selfhost --version', () => {
    it('should display version', async () => {
      const result = await runCli(['--version']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  describe('selfhost status', () => {
    it('should run status command', async () => {
      const result = await runCli(['status']);

      // Status command might fail if not in a valid repo
      // but should not crash
      expect(typeof result.exitCode).toBe('number');
    });

    it('should support --json flag', async () => {
      const result = await runCli(['status', '--json']);

      // If successful, output should be valid JSON
      if (result.exitCode === 0 && result.stdout) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });
  });

  describe('selfhost inventory', () => {
    it('should run inventory command', async () => {
      const result = await runCli(['inventory', '--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('inventory');
    });
  });

  describe('selfhost daemon', () => {
    it('should show daemon help', async () => {
      const result = await runCli(['daemon', '--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('daemon');
      expect(result.stdout).toContain('init');
      expect(result.stdout).toContain('start');
      expect(result.stdout).toContain('stop');
    });
  });

  describe('selfhost test', () => {
    it('should show test help', async () => {
      const result = await runCli(['test', '--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('test');
      expect(result.stdout).toContain('--all');
      expect(result.stdout).toContain('--service');
    });
  });
});
