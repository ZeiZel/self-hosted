/**
 * Global test setup
 * Loaded before all tests via bunfig.toml preload
 */

import { beforeAll, afterAll, afterEach, mock } from 'bun:test';

// Set test environment
process.env.NODE_ENV = 'test';

// Suppress console output during tests
const originalConsole = { ...console };
const silentConsole = {
  log: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

beforeAll(() => {
  // Silence console during tests (can be overridden with VERBOSE_TESTS=true)
  if (!process.env.VERBOSE_TESTS) {
    Object.assign(console, silentConsole);
  }
});

afterAll(() => {
  // Restore console
  Object.assign(console, originalConsole);
});

afterEach(() => {
  // Clear all mocks after each test
  mock.restore();
});

/**
 * Helper to create a temporary directory for tests
 */
export async function createTempDir(): Promise<string> {
  const tempDir = `/tmp/selfhost-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await Bun.$`mkdir -p ${tempDir}`;
  return tempDir;
}

/**
 * Helper to clean up temporary directory
 */
export async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await Bun.$`rm -rf ${dir}`;
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Helper to wait for a condition
 */
export function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const check = async () => {
      try {
        if (await condition()) {
          resolve();
          return;
        }

        if (Date.now() - startTime > timeout) {
          reject(new Error('Timeout waiting for condition'));
          return;
        }

        setTimeout(check, interval);
      } catch (error) {
        reject(error);
      }
    };

    check();
  });
}

/**
 * Helper to capture console output
 */
export function captureConsole(): { logs: string[]; restore: () => void } {
  const logs: string[] = [];
  const originalLog = console.log;
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = (...args) => logs.push(['LOG', ...args].join(' '));
  console.info = (...args) => logs.push(['INFO', ...args].join(' '));
  console.warn = (...args) => logs.push(['WARN', ...args].join(' '));
  console.error = (...args) => logs.push(['ERROR', ...args].join(' '));

  return {
    logs,
    restore: () => {
      console.log = originalLog;
      console.info = originalInfo;
      console.warn = originalWarn;
      console.error = originalError;
    },
  };
}
