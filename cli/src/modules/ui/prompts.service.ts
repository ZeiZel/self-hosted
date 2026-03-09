import { Injectable } from '@nestjs/common';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { MachineRole } from '../../interfaces/machine.interface';

@Injectable()
export class PromptsService {
  /**
   * Confirm action
   */
  async confirm(message: string, defaultValue = false): Promise<boolean> {
    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message,
        default: defaultValue,
      },
    ]);
    return confirmed;
  }

  /**
   * Input text
   */
  async input(message: string, defaultValue?: string): Promise<string> {
    const { value } = await inquirer.prompt([
      {
        type: 'input',
        name: 'value',
        message,
        default: defaultValue,
      },
    ]);
    return value;
  }

  /**
   * Input number
   */
  async number(message: string, defaultValue?: number): Promise<number> {
    const { value } = await inquirer.prompt([
      {
        type: 'number',
        name: 'value',
        message,
        default: defaultValue,
      },
    ]);
    return value;
  }

  /**
   * Select from list
   */
  async select<T extends string>(
    message: string,
    choices: { name: string; value: T }[],
  ): Promise<T> {
    const { value } = await inquirer.prompt([
      {
        type: 'list',
        name: 'value',
        message,
        choices,
      },
    ]);
    return value;
  }

  /**
   * Multi-select from list
   */
  async multiSelect<T extends string>(
    message: string,
    choices: { name: string; value: T; checked?: boolean }[],
  ): Promise<T[]> {
    const { value } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'value',
        message,
        choices,
      },
    ]);
    return value;
  }

  /**
   * Password input
   */
  async password(message: string): Promise<string> {
    const { value } = await inquirer.prompt([
      {
        type: 'password',
        name: 'value',
        message,
        mask: '*',
      },
    ]);
    return value;
  }

  /**
   * Machine wizard prompts
   */
  async machineWizard(): Promise<{
    ip: string;
    label: string;
    roles: MachineRole[];
    sshUser: string;
    sshPort: number;
  }> {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'ip',
        message: 'Enter machine IP address:',
        validate: (input: string) => {
          const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
          if (!ipRegex.test(input)) {
            return 'Please enter a valid IP address';
          }
          return true;
        },
      },
      {
        type: 'input',
        name: 'label',
        message: 'Enter machine label (hostname):',
        validate: (input: string) => {
          const labelRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
          if (!labelRegex.test(input)) {
            return 'Label must be lowercase alphanumeric with hyphens';
          }
          return true;
        },
      },
      {
        type: 'checkbox',
        name: 'roles',
        message: 'Select machine roles:',
        choices: [
          { name: `${chalk.cyan('master')} - Kubernetes control plane`, value: MachineRole.MASTER },
          { name: `${chalk.green('worker')} - Kubernetes worker node`, value: MachineRole.WORKER },
          {
            name: `${chalk.yellow('gateway')} - Public internet gateway (VPN)`,
            value: MachineRole.GATEWAY,
          },
          {
            name: `${chalk.magenta('storage')} - OpenEBS storage node`,
            value: MachineRole.STORAGE,
          },
          { name: `${chalk.gray('backups')} - Backup target (Velero)`, value: MachineRole.BACKUPS },
        ],
        validate: (input: MachineRole[]) => {
          if (input.length === 0) {
            return 'Please select at least one role';
          }
          return true;
        },
      },
      {
        type: 'input',
        name: 'sshUser',
        message: 'SSH username:',
        default: 'root',
      },
      {
        type: 'number',
        name: 'sshPort',
        message: 'SSH port:',
        default: 22,
      },
    ]);

    return answers;
  }

  /**
   * Cluster configuration wizard
   */
  async clusterWizard(): Promise<{
    name: string;
    domain: string;
    localDomain: string;
  }> {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Cluster name:',
        default: 'selfhost',
        validate: (input: string) => {
          if (input.length < 1 || input.length > 63) {
            return 'Name must be 1-63 characters';
          }
          return true;
        },
      },
      {
        type: 'input',
        name: 'domain',
        message: 'Public domain (for external access):',
        default: 'example.com',
      },
      {
        type: 'input',
        name: 'localDomain',
        message: 'Local domain (for internal DNS):',
        default: 'homelab.local',
      },
    ]);

    return answers;
  }

  /**
   * Service configuration prompts
   */
  async serviceConfig(
    serviceName: string,
    current: { replicas: number; memory: string; cpu: string; expose: boolean },
  ): Promise<{
    replicas: number;
    memory: string;
    cpu: string;
    expose: boolean;
    localDomain?: string;
    publicDomain?: string;
  }> {
    const answers = await inquirer.prompt([
      {
        type: 'number',
        name: 'replicas',
        message: `${serviceName} - Number of replicas:`,
        default: current.replicas,
      },
      {
        type: 'input',
        name: 'memory',
        message: `${serviceName} - Memory (e.g., 512Mi, 2Gi):`,
        default: current.memory,
      },
      {
        type: 'input',
        name: 'cpu',
        message: `${serviceName} - CPU (e.g., 100m, 2):`,
        default: current.cpu,
      },
      {
        type: 'confirm',
        name: 'expose',
        message: `${serviceName} - Expose via Traefik ingress?`,
        default: current.expose,
      },
    ]);

    if (answers.expose) {
      const domainAnswers = await inquirer.prompt([
        {
          type: 'input',
          name: 'localDomain',
          message: `${serviceName} - Local domain:`,
          default: `${serviceName}.homelab.local`,
        },
        {
          type: 'input',
          name: 'publicDomain',
          message: `${serviceName} - Public domain (leave empty to skip):`,
        },
      ]);
      return { ...answers, ...domainAnswers };
    }

    return answers;
  }

  /**
   * Error action prompt
   */
  async errorAction(
    serviceName: string,
    error: string,
  ): Promise<'retry' | 'skip' | 'abort' | 'debug'> {
    console.log(chalk.red(`\n[!] Error deploying ${serviceName}`));
    console.log(chalk.gray(`    Error: ${error}\n`));

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Select action:',
        choices: [
          { name: '[R] Retry deployment', value: 'retry' },
          { name: '[S] Skip this service (continue)', value: 'skip' },
          { name: '[A] Abort deployment', value: 'abort' },
          { name: '[D] Debug (show logs)', value: 'debug' },
        ],
      },
    ]);

    return action;
  }
}
