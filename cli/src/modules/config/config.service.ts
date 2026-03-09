import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { createHash } from 'crypto';
import { MODULE_OPTIONS, PATHS } from '../../core/constants';
import type { ConfigModuleOptions, AppConfig, ClusterConfig, RepoPaths } from '../../core/interfaces';
import { loadYaml, saveYaml } from '../../utils/yaml';

/**
 * CLI configuration schema
 */
const appConfigSchema = z.object({
  version: z.string().default('1.0.0'),
  cluster: z.object({
    name: z.string().default('selfhost'),
    domain: z.string().default('example.com'),
    localDomain: z.string().default('homelab.local'),
  }).default({}),
  initialized: z.boolean().default(false),
  lastDeployment: z.string().datetime().optional(),
  activeDeploymentId: z.string().optional(),
});

/**
 * Configuration service providing access to CLI configuration and paths
 */
@Injectable()
export class ConfigService implements OnModuleInit {
  private config: AppConfig | null = null;
  private paths: RepoPaths | null = null;
  private projectHash: string | null = null;

  constructor(
    @Inject(MODULE_OPTIONS.CONFIG)
    private readonly options: ConfigModuleOptions,
  ) {}

  /**
   * Initialize configuration on module startup
   */
  onModuleInit(): void {
    this.ensureDirectories();
    this.setupRepoPaths();
    this.loadConfig();
  }

  /**
   * Ensure all required directories exist
   */
  private ensureDirectories(): void {
    const dirs = [
      this.options.baseDir,
      join(this.options.baseDir, PATHS.CACHE_DIR),
      join(this.options.baseDir, PATHS.STATE_DIR),
      join(this.options.baseDir, PATHS.PROJECTS_DIR),
    ];

    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Setup repository paths if in a valid repo
   */
  private setupRepoPaths(): void {
    if (!this.options.repoRoot) {
      return;
    }

    this.paths = {
      root: this.options.repoRoot,
      cli: join(this.options.repoRoot, 'cli'),
      kubernetes: join(this.options.repoRoot, 'kubernetes'),
      ansible: join(this.options.repoRoot, 'ansible'),
      charts: join(this.options.repoRoot, 'kubernetes', 'charts'),
      releases: join(this.options.repoRoot, 'kubernetes', 'releases'),
      appsRegistry: join(this.options.repoRoot, 'kubernetes', 'apps', '_others.yaml'),
      helmfile: join(this.options.repoRoot, 'kubernetes', '.helmfile'),
      inventory: join(this.options.repoRoot, 'ansible', 'inventory'),
      groupVars: join(this.options.repoRoot, 'ansible', 'group_vars'),
      docs: join(this.options.repoRoot, '.docs'),
    };

    this.projectHash = createHash('sha256')
      .update(this.options.repoRoot)
      .digest('hex')
      .slice(0, 12);

    // Ensure project directory exists
    const projectDir = this.getProjectDir();
    if (!existsSync(projectDir)) {
      mkdirSync(projectDir, { recursive: true });
    }
  }

  /**
   * Load or create configuration
   */
  private loadConfig(): void {
    const configPath = join(this.options.baseDir, PATHS.CONFIG_FILE);
    const loaded = loadYaml<AppConfig>(configPath);

    if (loaded) {
      this.config = appConfigSchema.parse(loaded);
    } else {
      this.config = appConfigSchema.parse({});
      this.saveConfig();
    }
  }

  /**
   * Save configuration to file
   */
  private saveConfig(): void {
    if (!this.config) return;
    const configPath = join(this.options.baseDir, PATHS.CONFIG_FILE);
    saveYaml(configPath, this.config);
  }

  // ==================== Public API ====================

  /**
   * Get base directory path
   */
  getBaseDir(): string {
    return this.options.baseDir;
  }

  /**
   * Get database file path
   */
  getDatabasePath(): string {
    return join(this.options.baseDir, PATHS.DATABASE_FILE);
  }

  /**
   * Get cache directory path
   */
  getCacheDir(): string {
    return join(this.options.baseDir, PATHS.CACHE_DIR);
  }

  /**
   * Get state directory path
   */
  getStateDir(): string {
    return join(this.options.baseDir, PATHS.STATE_DIR);
  }

  /**
   * Get projects directory path
   */
  getProjectsDir(): string {
    return join(this.options.baseDir, PATHS.PROJECTS_DIR);
  }

  /**
   * Get current project directory
   */
  getProjectDir(): string {
    if (!this.projectHash) {
      throw new Error('Not in a valid selfhost repository');
    }
    return join(this.getProjectsDir(), this.projectHash);
  }

  /**
   * Get facts cache directory
   */
  getFactsCacheDir(): string {
    return join(this.options.baseDir, PATHS.FACTS_CACHE_DIR);
  }

  /**
   * Check if we're in a valid repository
   */
  hasValidRepo(): boolean {
    return this.options.repoRoot !== undefined && this.paths !== null;
  }

  /**
   * Get repository root path
   */
  getRepoRoot(): string {
    if (!this.options.repoRoot) {
      throw new Error('Not in a valid selfhost repository');
    }
    return this.options.repoRoot;
  }

  /**
   * Get repository paths
   */
  getPaths(): RepoPaths {
    if (!this.paths) {
      throw new Error('Not in a valid selfhost repository');
    }
    return this.paths;
  }

  /**
   * Check if CLI is initialized
   */
  isInitialized(): boolean {
    return this.hasValidRepo() && this.config?.initialized === true;
  }

  /**
   * Get application configuration
   */
  getConfig(): AppConfig {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }
    return this.config;
  }

  /**
   * Update application configuration
   */
  updateConfig(updates: Partial<AppConfig>): void {
    if (!this.config) return;
    this.config = { ...this.config, ...updates };
    this.saveConfig();
  }

  /**
   * Mark CLI as initialized
   */
  markInitialized(): void {
    this.updateConfig({ initialized: true });
  }

  /**
   * Get cluster configuration
   */
  getClusterConfig(): ClusterConfig {
    return this.getConfig().cluster;
  }

  /**
   * Update cluster configuration
   */
  updateClusterConfig(cluster: Partial<ClusterConfig>): void {
    const config = this.getConfig();
    this.updateConfig({
      cluster: { ...config.cluster, ...cluster },
    });
  }

  /**
   * Set active deployment ID
   */
  setActiveDeployment(id: string | undefined): void {
    this.updateConfig({ activeDeploymentId: id });
  }

  /**
   * Set last deployment timestamp
   */
  setLastDeployment(timestamp: string): void {
    this.updateConfig({ lastDeployment: timestamp });
  }
}
