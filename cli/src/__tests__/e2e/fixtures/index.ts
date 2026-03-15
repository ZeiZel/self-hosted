/**
 * E2E Test Fixtures Index
 *
 * This module provides test fixtures for E2E testing.
 */

import * as path from 'path';
import * as fs from 'fs';

/**
 * Path to fixtures directory
 */
export const FIXTURES_PATH = path.join(__dirname);

/**
 * Load mock inventory file content
 */
export function loadMockInventory(): string {
  const inventoryPath = path.join(FIXTURES_PATH, 'mock-inventory.ini');
  return fs.readFileSync(inventoryPath, 'utf-8');
}

/**
 * Load mock services registry
 */
export function loadMockServices(): string {
  const servicesPath = path.join(FIXTURES_PATH, 'mock-services.yaml');
  return fs.readFileSync(servicesPath, 'utf-8');
}

/**
 * Load mock config
 */
export function loadMockConfig(): object {
  const configPath = path.join(FIXTURES_PATH, 'mock-config.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

/**
 * Get fixture file path
 */
export function getFixturePath(filename: string): string {
  return path.join(FIXTURES_PATH, filename);
}
