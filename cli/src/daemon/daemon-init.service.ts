import { Injectable, Inject } from '@nestjs/common';
import { join } from 'path';
import { homedir } from 'os';
import { spawn } from 'child_process';
import {
  DaemonInitOptions,
  DaemonConfig,
  DEFAULT_DAEMON_CONFIG,
  DOCKER_COMPOSE_TEMPLATE,
} from './interfaces/daemon.interface';
import { DaemonClientService } from './daemon-client.service';
import { ConfigService } from '../modules/config/config.service';

/**
 * Service for initializing and managing daemon Docker container
 */
@Injectable()
export class DaemonInitService {
  private readonly daemonDir: string;
  private readonly composeFile: string;

  constructor(
    @Inject(DaemonClientService)
    private readonly daemonClient: DaemonClientService,
    @Inject(ConfigService)
    private readonly configService: ConfigService,
  ) {
    this.daemonDir = join(homedir(), '.selfhosted', 'daemon');
    this.composeFile = join(this.daemonDir, 'docker-compose.yaml');
  }

  /**
   * Check if daemon is initialized
   */
  async isInitialized(): Promise<boolean> {
    const markerPath = join(this.daemonDir, '.initialized');
    try {
      const file = Bun.file(markerPath);
      return await file.exists();
    } catch {
      return false;
    }
  }

  /**
   * Initialize daemon
   */
  async initialize(options: DaemonInitOptions = {}): Promise<void> {
    const config: DaemonConfig = {
      ...DEFAULT_DAEMON_CONFIG,
      checkInterval: options.checkInterval ?? DEFAULT_DAEMON_CONFIG.checkInterval,
    };

    // Check if already initialized
    if (!options.force && (await this.isInitialized())) {
      throw new Error('Daemon already initialized. Use --force to reinitialize.');
    }

    // Create daemon directory
    await this.createDaemonDirectory();

    // Generate docker-compose.yaml
    await this.generateDockerCompose(config);

    // Create marker file
    await this.createMarker();

    // Store config in daemon state
    this.daemonClient.setState('check_interval', String(config.checkInterval));
    this.daemonClient.setState('initialized_at', new Date().toISOString());
  }

  /**
   * Remove daemon completely
   */
  async remove(): Promise<void> {
    // Stop daemon first if running
    const isRunning = await this.isContainerRunning();
    if (isRunning) {
      await this.stopContainer();
    }

    // Remove daemon directory
    try {
      await Bun.$`rm -rf ${this.daemonDir}`;
    } catch {
      // Ignore errors
    }

    // Clean up state
    this.daemonClient.markStopped();
  }

  /**
   * Start daemon container
   */
  async start(): Promise<string> {
    if (!(await this.isInitialized())) {
      throw new Error('Daemon not initialized. Run `selfhost daemon init` first.');
    }

    // Check if already running
    if (await this.isContainerRunning()) {
      throw new Error('Daemon is already running.');
    }

    // Build image if needed
    await this.buildImage();

    // Start container
    const result = await this.runDockerCompose(['up', '-d']);

    if (!result.success) {
      throw new Error(`Failed to start daemon: ${result.stderr}`);
    }

    // Get container ID
    const containerId = await this.getContainerId();
    this.daemonClient.markRunning(containerId);

    return containerId || 'unknown';
  }

  /**
   * Stop daemon container
   */
  async stop(): Promise<void> {
    if (!(await this.isInitialized())) {
      throw new Error('Daemon not initialized.');
    }

    await this.stopContainer();
    this.daemonClient.markStopped();
  }

  /**
   * Restart daemon container
   */
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  /**
   * Get daemon logs
   */
  async getLogs(options: { follow?: boolean; tail?: number } = {}): Promise<string> {
    const args = ['logs'];

    if (options.follow) {
      args.push('-f');
    }

    if (options.tail) {
      args.push('--tail', String(options.tail));
    }

    args.push('selfhost-daemon');

    const result = await this.runDockerCompose(args);
    return result.stdout || result.stderr;
  }

  /**
   * Check if container is running
   */
  async isContainerRunning(): Promise<boolean> {
    const result = await this.runCommand('docker', [
      'ps',
      '--filter',
      'name=selfhost-daemon',
      '--filter',
      'status=running',
      '-q',
    ]);
    return result.success && result.stdout.trim().length > 0;
  }

  /**
   * Get container ID
   */
  private async getContainerId(): Promise<string | null> {
    const result = await this.runCommand('docker', [
      'ps',
      '--filter',
      'name=selfhost-daemon',
      '-q',
    ]);
    return result.success ? result.stdout.trim() || null : null;
  }

  /**
   * Create daemon directory
   */
  private async createDaemonDirectory(): Promise<void> {
    await Bun.$`mkdir -p ${this.daemonDir}`;
  }

  /**
   * Generate docker-compose.yaml
   */
  private async generateDockerCompose(config: DaemonConfig): Promise<void> {
    const kubeconfig = process.env.KUBECONFIG || join(homedir(), '.kube', 'config');
    const dataDir = join(homedir(), '.selfhosted');

    // Find repo root for building the image
    let repoRoot: string;
    try {
      repoRoot = this.configService.getRepoRoot();
    } catch {
      throw new Error('Not in a selfhost repository. Cannot build daemon image.');
    }

    const content = DOCKER_COMPOSE_TEMPLATE.replace(/\{\{imageName\}\}/g, 'selfhost-daemon')
      .replace(/\{\{imageTag\}\}/g, 'latest')
      .replace(/\{\{dataDir\}\}/g, dataDir)
      .replace(/\{\{kubeconfig\}\}/g, kubeconfig)
      .replace(/\{\{checkInterval\}\}/g, String(config.checkInterval));

    // Add build context
    const fullContent =
      content +
      `
    build:
      context: ${repoRoot}
      dockerfile: docker/selfhost-daemon/Dockerfile
`;

    await Bun.write(this.composeFile, fullContent);
  }

  /**
   * Create initialization marker
   */
  private async createMarker(): Promise<void> {
    const markerPath = join(this.daemonDir, '.initialized');
    await Bun.write(markerPath, new Date().toISOString());
  }

  /**
   * Build daemon Docker image
   */
  private async buildImage(): Promise<void> {
    const result = await this.runDockerCompose(['build']);
    if (!result.success) {
      throw new Error(`Failed to build daemon image: ${result.stderr}`);
    }
  }

  /**
   * Stop daemon container
   */
  private async stopContainer(): Promise<void> {
    await this.runDockerCompose(['down']);
  }

  /**
   * Run docker-compose command
   */
  private async runDockerCompose(args: string[]): Promise<{
    success: boolean;
    stdout: string;
    stderr: string;
  }> {
    return this.runCommand('docker-compose', ['-f', this.composeFile, ...args]);
  }

  /**
   * Run a command and capture output
   */
  private runCommand(
    command: string,
    args: string[],
  ): Promise<{ success: boolean; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const proc = spawn(command, args);
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
          success: code === 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        });
      });

      proc.on('error', (err) => {
        resolve({
          success: false,
          stdout: '',
          stderr: err.message,
        });
      });
    });
  }
}
