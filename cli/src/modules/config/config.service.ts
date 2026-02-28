import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { join } from 'path';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { homedir } from 'os';
import { createHash } from 'crypto';
import { loadYaml, saveYaml } from '../../utils/yaml';
import { findRepoRoot, getRepoPaths, RepoPaths } from '../../utils/paths';
import { Machine } from '../../interfaces/machine.interface';
import { ServiceConfig } from '../../interfaces/service.interface';
import { ClusterConfig, DeploymentPhase } from '../../interfaces/deployment.interface';

/**
 * Base directory for all selfhost CLI data
 */
const SELFHOSTED_DIR = join(homedir(), '.selfhosted');

/**
 * CLI configuration schema
 */
const cliConfigSchema = z.object({
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

export type CliConfig = z.infer<typeof cliConfigSchema>;

/**
 * Inventory configuration schema
 */
const inventoryConfigSchema = z.object({
  machines: z.array(z.any()).default([]),
});

export type InventoryConfig = z.infer<typeof inventoryConfigSchema>;

/**
 * Services configuration schema
 */
const servicesConfigSchema = z.object({
  services: z.record(z.string(), z.any()).default({}),
});

export type ServicesConfig = z.infer<typeof servicesConfigSchema>;

/**
 * Deployment state schema for resume functionality
 */
const deploymentStateSchema = z.object({
  id: z.string(),
  repoPath: z.string(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  status: z.enum(['pending', 'running', 'success', 'failed', 'cancelled']),
  currentPhase: z.number(),
  completedPhases: z.array(z.number()),
  failedPhases: z.array(z.number()),
  skippedPhases: z.array(z.number()),
  config: z.any(),
  logs: z.array(z.object({
    timestamp: z.string(),
    phase: z.number(),
    level: z.enum(['info', 'warn', 'error']),
    message: z.string(),
  })).default([]),
});

export type DeploymentStateData = z.infer<typeof deploymentStateSchema>;

@Injectable()
export class ConfigService {
  private repoRoot: string | null = null;
  private paths: RepoPaths | null = null;
  private config: CliConfig | null = null;
  private projectHash: string | null = null;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    // Ensure base directory exists
    this.ensureDir(SELFHOSTED_DIR);
    this.ensureDir(this.getCacheDir());
    this.ensureDir(this.getStateDir());
    this.ensureDir(this.getProjectsDir());

    // Find and setup repo
    this.repoRoot = findRepoRoot();
    if (this.repoRoot) {
      this.paths = getRepoPaths(this.repoRoot);
      this.projectHash = this.hashPath(this.repoRoot);
      this.ensureDir(this.getProjectDir());
    }

    this.loadConfig();
  }

  private ensureDir(path: string): void {
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true });
    }
  }

  /**
   * Create a hash of the repo path for project-specific storage
   */
  private hashPath(path: string): string {
    return createHash('sha256').update(path).digest('hex').slice(0, 12);
  }

  // ==================== Directory Paths ====================

  /**
   * Get base selfhosted directory (~/.selfhosted)
   */
  getBaseDir(): string {
    return SELFHOSTED_DIR;
  }

  /**
   * Get cache directory (~/.selfhosted/cache)
   */
  getCacheDir(): string {
    return join(SELFHOSTED_DIR, 'cache');
  }

  /**
   * Get state directory for deployments (~/.selfhosted/state)
   */
  getStateDir(): string {
    return join(SELFHOSTED_DIR, 'state');
  }

  /**
   * Get projects directory (~/.selfhosted/projects)
   */
  getProjectsDir(): string {
    return join(SELFHOSTED_DIR, 'projects');
  }

  /**
   * Get current project directory (~/.selfhosted/projects/<hash>)
   */
  getProjectDir(): string {
    if (!this.projectHash) {
      throw new Error('Not in a valid selfhost repository.');
    }
    return join(this.getProjectsDir(), this.projectHash);
  }

  /**
   * Get machine facts cache directory
   */
  getFactsCacheDir(): string {
    return join(this.getCacheDir(), 'facts');
  }

  // ==================== Config Management ====================

  private loadConfig(): void {
    const configPath = join(SELFHOSTED_DIR, 'config.yaml');
    const loaded = loadYaml<CliConfig>(configPath);

    if (loaded) {
      this.config = cliConfigSchema.parse(loaded);
    } else {
      this.config = cliConfigSchema.parse({});
      this.saveConfig();
    }
  }

  private saveConfig(): void {
    if (!this.config) return;
    const configPath = join(SELFHOSTED_DIR, 'config.yaml');
    saveYaml(configPath, this.config);
  }

  /**
   * Check if CLI is properly initialized
   */
  isInitialized(): boolean {
    return this.repoRoot !== null && this.config?.initialized === true;
  }

  /**
   * Check if we're in a valid repository
   */
  hasValidRepo(): boolean {
    return this.repoRoot !== null;
  }

  /**
   * Get repository root path
   */
  getRepoRoot(): string {
    if (!this.repoRoot) {
      throw new Error('Not in a valid selfhost repository. Run from repository root.');
    }
    return this.repoRoot;
  }

  /**
   * Get repository paths
   */
  getPaths(): RepoPaths {
    if (!this.paths) {
      throw new Error('Not in a valid selfhost repository.');
    }
    return this.paths;
  }

  /**
   * Get CLI configuration
   */
  getConfig(): CliConfig {
    if (!this.config) {
      throw new Error('Configuration not loaded.');
    }
    return this.config;
  }

  /**
   * Update CLI configuration
   */
  updateConfig(updates: Partial<CliConfig>): void {
    if (!this.config) return;
    this.config = { ...this.config, ...updates };
    this.saveConfig();
  }

  /**
   * Mark as initialized
   */
  markInitialized(): void {
    this.updateConfig({ initialized: true });
  }

  /**
   * Get cluster configuration
   */
  getClusterConfig(): ClusterConfig {
    const config = this.getConfig();
    return config.cluster;
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

  // ==================== Inventory Management ====================

  /**
   * Get inventory file path
   */
  getInventoryPath(): string {
    return join(this.getProjectDir(), 'inventory.yaml');
  }

  /**
   * Load inventory
   */
  loadInventory(): Machine[] {
    const data = loadYaml<InventoryConfig>(this.getInventoryPath());
    return data?.machines ?? [];
  }

  /**
   * Save inventory
   */
  saveInventory(machines: Machine[]): void {
    saveYaml(this.getInventoryPath(), { machines });
  }

  // ==================== Services Configuration ====================

  /**
   * Get services config file path
   */
  getServicesConfigPath(): string {
    return join(this.getProjectDir(), 'services.yaml');
  }

  /**
   * Load services configuration
   */
  loadServicesConfig(): Record<string, ServiceConfig> {
    const data = loadYaml<ServicesConfig>(this.getServicesConfigPath());
    return data?.services ?? {};
  }

  /**
   * Save services configuration
   */
  saveServicesConfig(services: Record<string, ServiceConfig>): void {
    saveYaml(this.getServicesConfigPath(), { services });
  }

  // ==================== Deployment State (Resume Support) ====================

  /**
   * Create a new deployment state
   */
  createDeploymentState(config: unknown): DeploymentStateData {
    const id = `deploy-${Date.now()}`;
    const state: DeploymentStateData = {
      id,
      repoPath: this.getRepoRoot(),
      startedAt: new Date().toISOString(),
      status: 'pending',
      currentPhase: DeploymentPhase.INFRASTRUCTURE_SETUP,
      completedPhases: [],
      failedPhases: [],
      skippedPhases: [],
      config,
      logs: [],
    };

    this.saveDeploymentState(state);
    this.updateConfig({ activeDeploymentId: id });

    return state;
  }

  /**
   * Get deployment state by ID
   */
  getDeploymentState(id: string): DeploymentStateData | null {
    const statePath = join(this.getStateDir(), `${id}.yaml`);
    return loadYaml<DeploymentStateData>(statePath);
  }

  /**
   * Get active deployment state
   */
  getActiveDeployment(): DeploymentStateData | null {
    const config = this.getConfig();
    if (!config.activeDeploymentId) return null;
    return this.getDeploymentState(config.activeDeploymentId);
  }

  /**
   * Save deployment state
   */
  saveDeploymentState(state: DeploymentStateData): void {
    const statePath = join(this.getStateDir(), `${state.id}.yaml`);
    saveYaml(statePath, state);
  }

  /**
   * Update deployment state
   */
  updateDeploymentState(id: string, updates: Partial<DeploymentStateData>): DeploymentStateData | null {
    const state = this.getDeploymentState(id);
    if (!state) return null;

    const updated = { ...state, ...updates };
    this.saveDeploymentState(updated);
    return updated;
  }

  /**
   * Mark phase as completed
   */
  markPhaseCompleted(id: string, phase: DeploymentPhase): void {
    const state = this.getDeploymentState(id);
    if (!state) return;

    if (!state.completedPhases.includes(phase)) {
      state.completedPhases.push(phase);
    }
    state.currentPhase = phase + 1;
    this.saveDeploymentState(state);
  }

  /**
   * Mark phase as failed
   */
  markPhaseFailed(id: string, phase: DeploymentPhase, error: string): void {
    const state = this.getDeploymentState(id);
    if (!state) return;

    if (!state.failedPhases.includes(phase)) {
      state.failedPhases.push(phase);
    }
    state.logs.push({
      timestamp: new Date().toISOString(),
      phase,
      level: 'error',
      message: error,
    });
    this.saveDeploymentState(state);
  }

  /**
   * Mark phase as skipped
   */
  markPhaseSkipped(id: string, phase: DeploymentPhase): void {
    const state = this.getDeploymentState(id);
    if (!state) return;

    if (!state.skippedPhases.includes(phase)) {
      state.skippedPhases.push(phase);
    }
    state.currentPhase = phase + 1;
    this.saveDeploymentState(state);
  }

  /**
   * Add log entry to deployment
   */
  addDeploymentLog(id: string, phase: DeploymentPhase, level: 'info' | 'warn' | 'error', message: string): void {
    const state = this.getDeploymentState(id);
    if (!state) return;

    state.logs.push({
      timestamp: new Date().toISOString(),
      phase,
      level,
      message,
    });
    this.saveDeploymentState(state);
  }

  /**
   * Complete deployment
   */
  completeDeployment(id: string, status: 'success' | 'failed' | 'cancelled'): void {
    const state = this.getDeploymentState(id);
    if (!state) return;

    state.status = status;
    state.completedAt = new Date().toISOString();
    this.saveDeploymentState(state);

    if (status === 'success') {
      this.updateConfig({
        lastDeployment: state.completedAt,
        activeDeploymentId: undefined,
      });
    }
  }

  /**
   * Clear active deployment (for fresh start)
   */
  clearActiveDeployment(): void {
    this.updateConfig({ activeDeploymentId: undefined });
  }

  /**
   * List all deployment states
   */
  listDeployments(): DeploymentStateData[] {
    const stateDir = this.getStateDir();
    if (!existsSync(stateDir)) return [];

    const files = readdirSync(stateDir).filter((f) => f.endsWith('.yaml'));
    return files
      .map((f) => loadYaml<DeploymentStateData>(join(stateDir, f)))
      .filter((s): s is DeploymentStateData => s !== null)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  /**
   * Clean old deployment states (keep last N)
   */
  cleanOldDeployments(keepCount = 10): void {
    const deployments = this.listDeployments();
    const toDelete = deployments.slice(keepCount);

    for (const deployment of toDelete) {
      const statePath = join(this.getStateDir(), `${deployment.id}.yaml`);
      if (existsSync(statePath)) {
        rmSync(statePath);
      }
    }
  }

  // ==================== Facts Cache ====================

  /**
   * Get cached machine facts
   */
  getCachedFacts(machineId: string): unknown | null {
    const cachePath = join(this.getFactsCacheDir(), `${machineId}.yaml`);
    return loadYaml(cachePath);
  }

  /**
   * Save machine facts to cache
   */
  saveCachedFacts(machineId: string, facts: unknown): void {
    this.ensureDir(this.getFactsCacheDir());
    const cachePath = join(this.getFactsCacheDir(), `${machineId}.yaml`);
    saveYaml(cachePath, { facts, cachedAt: new Date().toISOString() });
  }

  /**
   * Clear facts cache
   */
  clearFactsCache(): void {
    const cacheDir = this.getFactsCacheDir();
    if (existsSync(cacheDir)) {
      rmSync(cacheDir, { recursive: true });
      mkdirSync(cacheDir, { recursive: true });
    }
  }
}
