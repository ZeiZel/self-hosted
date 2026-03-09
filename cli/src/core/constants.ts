/**
 * Injection tokens for dependency injection
 */
export const INJECTION_TOKENS = {
  // Core
  CLI_OPTIONS: Symbol('CLI_OPTIONS'),
  APP_CONFIG: Symbol('APP_CONFIG'),

  // Database
  DATABASE_CONNECTION: Symbol('DATABASE_CONNECTION'),

  // Repositories
  MACHINE_REPOSITORY: Symbol('MACHINE_REPOSITORY'),
  SERVICE_REPOSITORY: Symbol('SERVICE_REPOSITORY'),
  DEPLOYMENT_REPOSITORY: Symbol('DEPLOYMENT_REPOSITORY'),
  METRIC_REPOSITORY: Symbol('METRIC_REPOSITORY'),

  // Services
  CONFIG_SERVICE: Symbol('CONFIG_SERVICE'),
  INVENTORY_SERVICE: Symbol('INVENTORY_SERVICE'),
  SERVICES_SERVICE: Symbol('SERVICES_SERVICE'),
  MONITOR_SERVICE: Symbol('MONITOR_SERVICE'),
} as const;

/**
 * Module configuration keys
 */
export const MODULE_OPTIONS = {
  CONFIG: 'CONFIG_MODULE_OPTIONS',
  DATABASE: 'DATABASE_MODULE_OPTIONS',
} as const;

/**
 * Default paths
 */
export const PATHS = {
  BASE_DIR: '.selfhosted',
  CONFIG_FILE: 'config.yaml',
  DATABASE_FILE: 'selfhosted.db',
  CACHE_DIR: 'cache',
  STATE_DIR: 'state',
  PROJECTS_DIR: 'projects',
  FACTS_CACHE_DIR: 'cache/facts',
} as const;

/**
 * CLI metadata
 */
export const CLI_METADATA = {
  NAME: 'selfhost',
  VERSION: '1.0.0',
  DESCRIPTION: 'CLI tool for automated self-hosted infrastructure deployment',
} as const;
