import type { ModuleMetadata, Type } from '@nestjs/common';

/**
 * CLI runtime options (parsed from command line)
 */
export interface CliOptions {
  verbose: boolean;
  noColor: boolean;
  configPath?: string;
}

/**
 * Application configuration (loaded from config.yaml)
 */
export interface AppConfig {
  version: string;
  initialized: boolean;
  cluster: ClusterConfig;
  lastDeployment?: string;
  activeDeploymentId?: string;
}

/**
 * Cluster configuration
 */
export interface ClusterConfig {
  name: string;
  domain: string;
  localDomain: string;
}

/**
 * Repository paths within the selfhost repository
 */
export interface RepoPaths {
  root: string;
  cli: string;
  kubernetes: string;
  ansible: string;
  charts: string;
  releases: string;
  appsRegistry: string;
  helmfile: string;
  inventory: string;
  groupVars: string;
  docs: string;
}

/**
 * Base module options for forRoot/forRootAsync patterns
 */
export interface ModuleOptions {
  isGlobal?: boolean;
}

/**
 * Async module options factory interface
 */
export interface ModuleOptionsFactory<T> {
  createOptions(): Promise<T> | T;
}

/**
 * Async module options for forRootAsync pattern
 */
export interface AsyncModuleOptions<T> extends Pick<ModuleMetadata, 'imports'> {
  isGlobal?: boolean;
  useExisting?: Type<ModuleOptionsFactory<T>>;
  useClass?: Type<ModuleOptionsFactory<T>>;
  useFactory?: (...args: unknown[]) => Promise<T> | T;
  inject?: unknown[];
}

/**
 * Database module options
 */
export interface DatabaseModuleOptions extends ModuleOptions {
  filename: string;
  inMemory?: boolean;
  readonly?: boolean;
}

/**
 * Config module options
 */
export interface ConfigModuleOptions extends ModuleOptions {
  baseDir: string;
  repoRoot?: string;
}

