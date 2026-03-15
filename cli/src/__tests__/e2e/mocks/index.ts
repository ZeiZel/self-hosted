/**
 * E2E Test Mocks Index
 *
 * This module provides mock implementations for external tools
 * used during E2E testing, allowing tests to run without real hosts.
 */

import * as path from 'path';

/**
 * Path to mock bin directory containing mock scripts
 */
export const MOCK_BIN_PATH = path.join(__dirname, 'bin');

/**
 * Mock script paths
 */
export const MOCK_SCRIPTS = {
  ansiblePlaybook: path.join(MOCK_BIN_PATH, 'ansible-playbook'),
  helmfile: path.join(MOCK_BIN_PATH, 'helmfile'),
  kubectl: path.join(MOCK_BIN_PATH, 'kubectl'),
} as const;

/**
 * Environment variables for mock mode
 */
export const MOCK_ENV = {
  SELFHOST_TEST_MODE: 'true',
  SELFHOST_MOCK_ANSIBLE: 'true',
  SELFHOST_MOCK_HELMFILE: 'true',
  SELFHOST_NO_UPDATE_CHECK: 'true',
} as const;

/**
 * Check if a command is being mocked
 */
export function isMocked(command: string): boolean {
  return Object.keys(MOCK_SCRIPTS).some((key) =>
    MOCK_SCRIPTS[key as keyof typeof MOCK_SCRIPTS].includes(command)
  );
}
