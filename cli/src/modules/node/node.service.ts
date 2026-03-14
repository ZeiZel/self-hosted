import { Injectable, Inject } from '@nestjs/common';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { ConfigService } from '../config/config.service';
import { MachineRole } from '../../interfaces/machine.interface';

/**
 * SSH connection options
 */
export interface SshConnectionOptions {
  hostname: string;
  user: string;
  port: number;
  keyPath?: string;
}

/**
 * Node inventory entry
 */
export interface NodeInventoryEntry {
  hostname: string;
  role: MachineRole;
  user: string;
  port: number;
  sshKeyPath?: string;
}

/**
 * Node configuration (labels, taints)
 */
export interface NodeConfig {
  labels?: Record<string, string>;
  taints?: string[];
}

/**
 * Drain options
 */
export interface DrainOptions {
  deleteLocalData?: boolean;
  force?: boolean;
  gracePeriod?: number;
}

/**
 * Command result
 */
interface CommandResult {
  success: boolean;
  output?: string;
  error?: string;
}

/**
 * Service for managing Kubernetes nodes
 */
@Injectable()
export class NodeService {
  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService,
  ) {}

  /**
   * Test SSH connectivity to a host
   */
  async testSshConnection(options: SshConnectionOptions): Promise<CommandResult> {
    const args = this.buildSshArgs(options);
    args.push('echo', 'ok');

    return this.runCommand('ssh', args, { timeout: 10000 });
  }

  /**
   * Add node to Ansible inventory
   */
  async addToInventory(entry: NodeInventoryEntry): Promise<void> {
    const repoRoot = this.configService.getRepoRoot();
    const inventoryPath = join(repoRoot, 'ansible', 'inventory', 'hosts.ini');

    let content = await fs.readFile(inventoryPath, 'utf-8');

    // Determine which section to add to
    const section = entry.role === MachineRole.MASTER ? '[kube_control_plane]' : '[kube_node]';

    // Build inventory line
    const sshKey = entry.sshKeyPath ? `ansible_ssh_private_key_file=${entry.sshKeyPath}` : '';
    const line = `${entry.hostname} ansible_host=${entry.hostname} ansible_user=${entry.user} ansible_port=${entry.port} ${sshKey}`.trim();

    // Check if already exists
    if (content.includes(entry.hostname)) {
      throw new Error(`Node ${entry.hostname} already exists in inventory`);
    }

    // Find section and add entry
    const sectionIndex = content.indexOf(section);
    if (sectionIndex === -1) {
      // Add section if not exists
      content += `\n\n${section}\n${line}\n`;
    } else {
      // Find next section or end of file
      const nextSectionMatch = content.slice(sectionIndex + section.length).match(/\n\[/);
      const insertIndex = nextSectionMatch
        ? sectionIndex + section.length + nextSectionMatch.index!
        : content.length;

      content =
        content.slice(0, insertIndex) +
        `${line}\n` +
        content.slice(insertIndex);
    }

    await fs.writeFile(inventoryPath, content);
  }

  /**
   * Remove node from Ansible inventory
   */
  async removeFromInventory(hostname: string): Promise<void> {
    const repoRoot = this.configService.getRepoRoot();
    const inventoryPath = join(repoRoot, 'ansible', 'inventory', 'hosts.ini');

    let content = await fs.readFile(inventoryPath, 'utf-8');

    // Remove line containing hostname
    const lines = content.split('\n');
    const filtered = lines.filter(line => !line.includes(hostname));

    await fs.writeFile(inventoryPath, filtered.join('\n'));
  }

  /**
   * Run Kubespray scale playbook to add node
   */
  async runKubesprayScale(hostname: string): Promise<CommandResult> {
    const repoRoot = this.configService.getRepoRoot();
    const playbookPath = join(repoRoot, 'ansible', 'all.yml');
    const inventoryPath = join(repoRoot, 'ansible', 'inventory', 'hosts.ini');

    const args = [
      '-i', inventoryPath,
      playbookPath,
      '--tags', 'kubespray',
      '--limit', hostname,
    ];

    // Check for vault password file from environment or default path
    const vaultPasswordFile = process.env.ANSIBLE_VAULT_PASSWORD_FILE ||
      `${process.env.HOME}/.ansible_vault_password`;
    const { existsSync } = require('fs');
    if (existsSync(vaultPasswordFile)) {
      args.push('--vault-password-file', vaultPasswordFile);
    }

    return this.runCommand('ansible-playbook', args, { timeout: 1800000 }); // 30 minutes
  }

  /**
   * Apply labels and taints to a node
   */
  async applyNodeConfig(nodename: string, config: NodeConfig): Promise<void> {
    // Apply labels
    if (config.labels && Object.keys(config.labels).length > 0) {
      const labelStr = Object.entries(config.labels)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ');

      const result = await this.runKubectl(['label', 'node', nodename, ...labelStr.split(' ')]);
      if (!result.success) {
        throw new Error(`Failed to apply labels: ${result.error}`);
      }
    }

    // Apply taints
    if (config.taints && config.taints.length > 0) {
      for (const taint of config.taints) {
        const result = await this.runKubectl(['taint', 'node', nodename, taint]);
        if (!result.success) {
          throw new Error(`Failed to apply taint ${taint}: ${result.error}`);
        }
      }
    }
  }

  /**
   * Wait for node to become ready
   */
  async waitForNodeReady(nodename: string, timeoutSeconds: number): Promise<{ ready: boolean; error?: string }> {
    const startTime = Date.now();
    const timeoutMs = timeoutSeconds * 1000;

    while (Date.now() - startTime < timeoutMs) {
      const result = await this.runKubectl([
        'get', 'node', nodename,
        '-o', 'jsonpath={.status.conditions[?(@.type=="Ready")].status}',
      ]);

      if (result.success && result.output?.trim() === 'True') {
        return { ready: true };
      }

      // Wait 10 seconds before next check
      await new Promise(resolve => setTimeout(resolve, 10000));
    }

    return { ready: false, error: 'Timeout waiting for node to become ready' };
  }

  /**
   * Drain a node
   */
  async drainNode(nodename: string, options: DrainOptions = {}): Promise<CommandResult> {
    const args = ['drain', nodename, '--ignore-daemonsets'];

    if (options.deleteLocalData) {
      args.push('--delete-emptydir-data');
    }

    if (options.force) {
      args.push('--force');
    }

    if (options.gracePeriod !== undefined) {
      args.push(`--grace-period=${options.gracePeriod}`);
    }

    return this.runKubectl(args, { timeout: 600000 }); // 10 minutes
  }

  /**
   * Delete a node from the cluster
   */
  async deleteNode(nodename: string): Promise<CommandResult> {
    return this.runKubectl(['delete', 'node', nodename]);
  }

  /**
   * Cordon a node (mark as unschedulable)
   */
  async cordonNode(nodename: string): Promise<CommandResult> {
    return this.runKubectl(['cordon', nodename]);
  }

  /**
   * Uncordon a node (mark as schedulable)
   */
  async uncordonNode(nodename: string): Promise<CommandResult> {
    return this.runKubectl(['uncordon', nodename]);
  }

  /**
   * Run kubectl command
   */
  private async runKubectl(
    args: string[],
    options: { timeout?: number } = {},
  ): Promise<CommandResult> {
    return this.runCommand('kubectl', args, options);
  }

  /**
   * Build SSH command arguments
   */
  private buildSshArgs(options: SshConnectionOptions): string[] {
    const args = [
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-o', 'ConnectTimeout=10',
      '-p', String(options.port),
    ];

    if (options.keyPath) {
      args.push('-i', options.keyPath);
    }

    args.push(`${options.user}@${options.hostname}`);

    return args;
  }

  /**
   * Run a command and return result
   */
  private runCommand(
    command: string,
    args: string[],
    options: { timeout?: number } = {},
  ): Promise<CommandResult> {
    return new Promise((resolve) => {
      const timeout = options.timeout || 30000;
      let stdout = '';
      let stderr = '';

      const proc = spawn(command, args, {
        env: {
          ...process.env,
          // Disable proxy for kubectl
          HTTP_PROXY: '',
          HTTPS_PROXY: '',
          http_proxy: '',
          https_proxy: '',
          NO_PROXY: '*',
        },
      });

      const timer = setTimeout(() => {
        proc.kill();
        resolve({
          success: false,
          error: 'Command timed out',
        });
      }, timeout);

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          success: code === 0,
          output: stdout.trim(),
          error: code !== 0 ? stderr.trim() || `Exit code: ${code}` : undefined,
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          success: false,
          error: err.message,
        });
      });
    });
  }
}
