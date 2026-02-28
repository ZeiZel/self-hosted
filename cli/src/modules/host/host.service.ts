import { Injectable } from '@nestjs/common';
import { Client, ConnectConfig } from 'ssh2';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { MachineFacts, SshConfig } from '../../interfaces/machine.interface';

@Injectable()
export class HostService {
  /**
   * Test SSH connection to a machine
   */
  async testConnection(ssh: SshConfig): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const conn = new Client();
      const config = this.buildSshConfig(ssh);

      const timeout = setTimeout(() => {
        conn.end();
        resolve({ success: false, error: 'Connection timeout' });
      }, 10000);

      conn.on('ready', () => {
        clearTimeout(timeout);
        conn.end();
        resolve({ success: true });
      });

      conn.on('error', (err) => {
        clearTimeout(timeout);
        resolve({ success: false, error: err.message });
      });

      try {
        conn.connect(config);
      } catch (err) {
        clearTimeout(timeout);
        resolve({
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    });
  }

  /**
   * Gather facts from a remote machine
   */
  async gatherFacts(ssh: SshConfig): Promise<MachineFacts> {
    const commands = {
      hostname: 'hostname',
      os: 'cat /etc/os-release | grep "^ID=" | cut -d= -f2 | tr -d \'"\'',
      osVersion: 'cat /etc/os-release | grep "^VERSION_ID=" | cut -d= -f2 | tr -d \'"\'',
      kernel: 'uname -r',
      arch: 'uname -m',
      cpuCores: 'nproc',
      cpuModel: 'cat /proc/cpuinfo | grep "model name" | head -1 | cut -d: -f2 | xargs',
      memoryTotal: 'cat /proc/meminfo | grep MemTotal | awk \'{print $2}\'',
      memoryAvailable: 'cat /proc/meminfo | grep MemAvailable | awk \'{print $2}\'',
      diskTotal: 'df -B1 / | tail -1 | awk \'{print $2}\'',
      diskAvailable: 'df -B1 / | tail -1 | awk \'{print $4}\'',
      dockerVersion: 'docker --version 2>/dev/null | cut -d" " -f3 | tr -d ","|| echo ""',
      kubernetesVersion: 'kubectl version --client -o json 2>/dev/null | jq -r .clientVersion.gitVersion || echo ""',
    };

    const results: Record<string, string> = {};

    for (const [key, cmd] of Object.entries(commands)) {
      try {
        results[key] = await this.executeCommand(ssh, cmd);
      } catch {
        results[key] = '';
      }
    }

    return {
      hostname: results.hostname.trim(),
      os: results.os.trim(),
      osVersion: results.osVersion.trim(),
      kernel: results.kernel.trim(),
      arch: results.arch.trim(),
      cpuCores: parseInt(results.cpuCores, 10) || 0,
      cpuModel: results.cpuModel.trim(),
      memoryTotal: parseInt(results.memoryTotal, 10) * 1024 || 0, // KB to bytes
      memoryAvailable: parseInt(results.memoryAvailable, 10) * 1024 || 0,
      diskTotal: parseInt(results.diskTotal, 10) || 0,
      diskAvailable: parseInt(results.diskAvailable, 10) || 0,
      dockerVersion: results.dockerVersion.trim() || undefined,
      kubernetesVersion: results.kubernetesVersion.trim() || undefined,
    };
  }

  /**
   * Execute a command on remote machine
   */
  async executeCommand(ssh: SshConfig, command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      const config = this.buildSshConfig(ssh);

      conn.on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            reject(err);
            return;
          }

          let output = '';
          let errorOutput = '';

          stream.on('data', (data: Buffer) => {
            output += data.toString();
          });

          stream.stderr.on('data', (data: Buffer) => {
            errorOutput += data.toString();
          });

          stream.on('close', (code: number) => {
            conn.end();
            if (code === 0) {
              resolve(output.trim());
            } else {
              reject(new Error(errorOutput || `Command exited with code ${code}`));
            }
          });
        });
      });

      conn.on('error', reject);
      conn.connect(config);
    });
  }

  /**
   * Check if local machine has required dependencies
   */
  async checkLocalDependencies(): Promise<{
    available: string[];
    missing: string[];
  }> {
    const dependencies = [
      { name: 'ssh', cmd: 'which ssh' },
      { name: 'ansible', cmd: 'which ansible' },
      { name: 'ansible-playbook', cmd: 'which ansible-playbook' },
      { name: 'kubectl', cmd: 'which kubectl' },
      { name: 'helm', cmd: 'which helm' },
      { name: 'helmfile', cmd: 'which helmfile' },
      { name: 'sops', cmd: 'which sops' },
    ];

    const available: string[] = [];
    const missing: string[] = [];

    for (const dep of dependencies) {
      try {
        const proc = Bun.spawn(['sh', '-c', dep.cmd], {
          stdout: 'pipe',
          stderr: 'pipe',
        });
        const exitCode = await proc.exited;
        if (exitCode === 0) {
          available.push(dep.name);
        } else {
          missing.push(dep.name);
        }
      } catch {
        missing.push(dep.name);
      }
    }

    return { available, missing };
  }

  /**
   * Get local machine info
   */
  async getLocalInfo(): Promise<{
    os: string;
    arch: string;
    homeDir: string;
    sshKeyExists: boolean;
  }> {
    const sshKeyPath = join(homedir(), '.ssh', 'id_ed25519');

    return {
      os: process.platform,
      arch: process.arch,
      homeDir: homedir(),
      sshKeyExists: existsSync(sshKeyPath) || existsSync(join(homedir(), '.ssh', 'id_rsa')),
    };
  }

  /**
   * Build SSH2 connection config
   */
  private buildSshConfig(ssh: SshConfig): ConnectConfig {
    const config: ConnectConfig = {
      host: ssh.host,
      port: ssh.port,
      username: ssh.username,
      readyTimeout: 10000,
      keepaliveInterval: 5000,
    };

    if (ssh.privateKeyPath) {
      config.privateKey = readFileSync(ssh.privateKeyPath);
    } else if (ssh.password) {
      config.password = ssh.password;
    } else {
      // Try default SSH key locations
      const defaultKeys = [
        join(homedir(), '.ssh', 'id_ed25519'),
        join(homedir(), '.ssh', 'id_rsa'),
      ];

      for (const keyPath of defaultKeys) {
        if (existsSync(keyPath)) {
          config.privateKey = readFileSync(keyPath);
          break;
        }
      }
    }

    return config;
  }
}
