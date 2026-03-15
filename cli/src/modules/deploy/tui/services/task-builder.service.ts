/**
 * Task Builder Service
 *
 * Builds a DAG of deployment tasks from enabled services and infrastructure phases.
 * Responsible for:
 * - Creating tasks for each deployment phase
 * - Building dependencies based on service requirements
 * - Grouping tasks by phase and type
 * - Calculating task priorities and estimated durations
 */

import { Injectable } from '@nestjs/common';
import { ServicesService } from '../../../services/services.service';
import {
  DeployTask,
  TaskType,
  TaskStatus,
  LogLine,
} from '../interfaces/task.interface';
import { DeploymentPhase } from '../../../../interfaces/deployment.interface';
import { Service, CORE_SERVICES, SERVICE_DEPENDENCIES } from '../../../../interfaces/service.interface';

/**
 * Task template for creating deployment tasks
 */
interface TaskTemplate {
  id: string;
  name: string;
  description?: string;
  phase: DeploymentPhase;
  type: TaskType;
  dependencies: string[];
  mandatory: boolean;
  enabled?: boolean;
  service?: string;
  namespace?: string;
  ansibleTags?: string[];
  helmfileSelector?: string;
  estimatedDuration?: number;
  priority?: number;
}

/**
 * Estimated durations in seconds for different task types
 */
const ESTIMATED_DURATIONS: Record<string, number> = {
  // Infrastructure
  'infra/validate-inventory': 10,
  'infra/install-packages': 120,
  'infra/configure-firewall': 30,

  // Kubernetes
  'k8s/kubespray': 600,
  'k8s/configure-kubectl': 10,
  'k8s/deploy-cni': 60,

  // Storage
  'storage/prepare-nodes': 60,
  'storage/deploy-openebs': 120,
  'storage/verify': 30,

  // Backup
  'backup/prepare-node': 60,
  'backup/init-restic': 30,
  'backup/deploy-zerobyte': 60,
  'backup/verify': 30,

  // Core services
  'core/namespaces': 10,
  'core/traefik': 60,
  'core/consul': 60,
  'core/vault': 90,
  'core/cert-manager': 60,
  'core/authentik': 120,

  // Default for databases and apps
  'default/database': 90,
  'default/application': 60,

  // Verification
  'verify/pods': 30,
  'verify/ingress': 30,
  'verify/credentials': 10,
};

@Injectable()
export class TaskBuilderService {
  constructor(private servicesService: ServicesService) {}

  /**
   * Build complete task graph for deployment
   */
  buildTaskGraph(): DeployTask[] {
    const tasks: DeployTask[] = [];

    // Phase 1: Infrastructure Setup
    tasks.push(...this.buildInfrastructureTasks());

    // Phase 2: Kubernetes Bootstrap
    tasks.push(...this.buildKubernetesTasks());

    // Phase 3: Storage Layer
    tasks.push(...this.buildStorageTasks());

    // Phase 4: Backup Setup
    tasks.push(...this.buildBackupTasks());

    // Phase 5: Core Services
    tasks.push(...this.buildCoreServicesTasks());

    // Phase 6: Databases
    tasks.push(...this.buildDatabaseTasks());

    // Phase 7: Applications
    tasks.push(...this.buildApplicationTasks());

    // Phase 8: Network Gateway
    tasks.push(...this.buildNetworkGatewayTasks());

    // Phase 9: Verification
    tasks.push(...this.buildVerificationTasks());

    return tasks;
  }

  /**
   * Build infrastructure setup tasks
   */
  private buildInfrastructureTasks(): DeployTask[] {
    const templates: TaskTemplate[] = [
      {
        id: 'infra/validate-inventory',
        name: 'Validate inventory',
        description: 'Validate Ansible inventory and SSH connectivity',
        phase: DeploymentPhase.INFRASTRUCTURE_SETUP,
        type: TaskType.VALIDATION,
        dependencies: [],
        mandatory: true,
        priority: 0,
      },
      {
        id: 'infra/install-packages',
        name: 'Install base packages',
        description: 'Install Docker, containerd, and system packages',
        phase: DeploymentPhase.INFRASTRUCTURE_SETUP,
        type: TaskType.ANSIBLE,
        ansibleTags: ['server', 'docker'],
        dependencies: ['infra/validate-inventory'],
        mandatory: true,
        priority: 10,
      },
      {
        id: 'infra/configure-firewall',
        name: 'Configure firewall',
        description: 'Configure iptables and UFW rules',
        phase: DeploymentPhase.INFRASTRUCTURE_SETUP,
        type: TaskType.ANSIBLE,
        ansibleTags: ['server', 'firewall'],
        dependencies: ['infra/install-packages'],
        mandatory: true,
        priority: 20,
      },
    ];

    return templates.map((t) => this.createTask(t));
  }

  /**
   * Build Kubernetes bootstrap tasks
   */
  private buildKubernetesTasks(): DeployTask[] {
    const templates: TaskTemplate[] = [
      {
        id: 'k8s/kubespray',
        name: 'Deploy Kubernetes',
        description: 'Deploy Kubernetes cluster using Kubespray',
        phase: DeploymentPhase.KUBERNETES_BOOTSTRAP,
        type: TaskType.ANSIBLE,
        ansibleTags: ['kubespray'],
        dependencies: ['infra/configure-firewall'],
        mandatory: true,
        priority: 0,
      },
      {
        id: 'k8s/configure-kubectl',
        name: 'Configure kubectl',
        description: 'Copy kubeconfig and configure local access',
        phase: DeploymentPhase.KUBERNETES_BOOTSTRAP,
        type: TaskType.ANSIBLE,
        ansibleTags: ['kubernetes', 'kubeconfig'],
        dependencies: ['k8s/kubespray'],
        mandatory: true,
        priority: 10,
      },
      {
        id: 'k8s/deploy-cni',
        name: 'Deploy CNI',
        description: 'Deploy Cilium/Calico CNI plugin',
        phase: DeploymentPhase.KUBERNETES_BOOTSTRAP,
        type: TaskType.ANSIBLE,
        ansibleTags: ['kubernetes', 'cni'],
        dependencies: ['k8s/configure-kubectl'],
        mandatory: true,
        priority: 20,
      },
    ];

    return templates.map((t) => this.createTask(t));
  }

  /**
   * Build storage layer tasks
   */
  private buildStorageTasks(): DeployTask[] {
    const templates: TaskTemplate[] = [
      {
        id: 'storage/prepare-nodes',
        name: 'Prepare storage nodes',
        description: 'Install iSCSI packages and configure storage nodes',
        phase: DeploymentPhase.STORAGE_LAYER,
        type: TaskType.ANSIBLE,
        ansibleTags: ['storage', 'prepare'],
        dependencies: ['k8s/deploy-cni'],
        mandatory: true,
        priority: 0,
      },
      {
        id: 'storage/deploy-openebs',
        name: 'Deploy OpenEBS',
        description: 'Deploy OpenEBS storage provisioner',
        phase: DeploymentPhase.STORAGE_LAYER,
        type: TaskType.HELMFILE,
        helmfileSelector: 'name=openebs',
        dependencies: ['storage/prepare-nodes'],
        mandatory: true,
        priority: 10,
      },
      {
        id: 'storage/verify',
        name: 'Verify storage',
        description: 'Verify StorageClass and PVC provisioning',
        phase: DeploymentPhase.STORAGE_LAYER,
        type: TaskType.VALIDATION,
        dependencies: ['storage/deploy-openebs'],
        mandatory: true,
        priority: 20,
      },
    ];

    return templates.map((t) => this.createTask(t));
  }

  /**
   * Build backup setup tasks
   */
  private buildBackupTasks(): DeployTask[] {
    const templates: TaskTemplate[] = [
      {
        id: 'backup/prepare-node',
        name: 'Prepare backup node',
        description: 'Configure NFS server and backup storage',
        phase: DeploymentPhase.BACKUP_SETUP,
        type: TaskType.ANSIBLE,
        ansibleTags: ['backup-node'],
        dependencies: ['storage/verify'],
        mandatory: true,
        priority: 0,
      },
      {
        id: 'backup/init-restic',
        name: 'Initialize Restic',
        description: 'Initialize Restic backup repository',
        phase: DeploymentPhase.BACKUP_SETUP,
        type: TaskType.ANSIBLE,
        ansibleTags: ['backup', 'restic'],
        dependencies: ['backup/prepare-node'],
        mandatory: true,
        priority: 10,
      },
      {
        id: 'backup/deploy-zerobyte',
        name: 'Deploy Zerobyte',
        description: 'Deploy Zerobyte backup UI',
        phase: DeploymentPhase.BACKUP_SETUP,
        type: TaskType.HELMFILE,
        helmfileSelector: 'name=zerobyte',
        dependencies: ['backup/init-restic'],
        mandatory: false,
        priority: 20,
      },
      {
        id: 'backup/verify',
        name: 'Verify backup',
        description: 'Verify backup infrastructure is working',
        phase: DeploymentPhase.BACKUP_SETUP,
        type: TaskType.VALIDATION,
        dependencies: ['backup/init-restic'],
        mandatory: true,
        priority: 30,
      },
    ];

    return templates.map((t) => this.createTask(t));
  }

  /**
   * Build core services tasks
   */
  private buildCoreServicesTasks(): DeployTask[] {
    const templates: TaskTemplate[] = [
      {
        id: 'core/namespaces',
        name: 'Create namespaces',
        description: 'Create all Kubernetes namespaces',
        phase: DeploymentPhase.CORE_SERVICES,
        type: TaskType.HELMFILE,
        helmfileSelector: 'name=namespaces',
        dependencies: ['backup/verify'],
        mandatory: true,
        priority: 0,
      },
      {
        id: 'core/traefik',
        name: 'Deploy Traefik',
        description: 'Deploy Traefik ingress controller',
        phase: DeploymentPhase.CORE_SERVICES,
        type: TaskType.HELMFILE,
        helmfileSelector: 'name=traefik',
        dependencies: ['core/namespaces'],
        mandatory: true,
        priority: 10,
      },
      {
        id: 'core/consul',
        name: 'Deploy Consul',
        description: 'Deploy Consul service mesh',
        phase: DeploymentPhase.CORE_SERVICES,
        type: TaskType.HELMFILE,
        helmfileSelector: 'name=consul',
        dependencies: ['core/traefik'],
        mandatory: true,
        priority: 20,
      },
      {
        id: 'core/vault',
        name: 'Deploy Vault',
        description: 'Deploy HashiCorp Vault for secrets management',
        phase: DeploymentPhase.CORE_SERVICES,
        type: TaskType.HELMFILE,
        helmfileSelector: 'name=vault',
        dependencies: ['core/consul'],
        mandatory: true,
        priority: 30,
      },
      {
        id: 'core/cert-manager',
        name: 'Deploy cert-manager',
        description: 'Deploy cert-manager for TLS certificates',
        phase: DeploymentPhase.CORE_SERVICES,
        type: TaskType.HELMFILE,
        helmfileSelector: 'name=cert-manager',
        dependencies: ['core/vault'],
        mandatory: true,
        priority: 40,
      },
      {
        id: 'core/authentik',
        name: 'Deploy Authentik',
        description: 'Deploy Authentik SSO provider',
        phase: DeploymentPhase.CORE_SERVICES,
        type: TaskType.HELMFILE,
        helmfileSelector: 'name=authentik',
        dependencies: ['core/cert-manager', 'db/postgresql', 'db/valkey'],
        mandatory: true,
        priority: 50,
      },
    ];

    return templates.map((t) => this.createTask(t));
  }

  /**
   * Build database tasks
   */
  private buildDatabaseTasks(): DeployTask[] {
    const tasks: DeployTask[] = [];

    // Get enabled database services
    const enabledDatabases = this.servicesService
      .getEnabled()
      .filter((s) => s.namespace === 'db');

    // Database priority order
    const databasePriority: Record<string, number> = {
      postgresql: 0, // Deploy first (many services depend on it)
      postgres: 0,
      valkey: 10, // Second (used for caching)
      mongodb: 20,
      minio: 30,
      clickhouse: 40,
      mysql: 50,
      rabbitmq: 60,
    };

    // Add tasks for each enabled database
    for (const db of enabledDatabases) {
      const dbName = db.name.toLowerCase();
      const priority = databasePriority[dbName] ?? 100;

      tasks.push(
        this.createTask({
          id: `db/${db.name}`,
          name: `Deploy ${db.name}`,
          description: `Deploy ${db.name} database`,
          phase: DeploymentPhase.DATABASES,
          type: TaskType.HELMFILE,
          helmfileSelector: `name=${db.name}`,
          service: db.name,
          namespace: 'db',
          dependencies: ['core/vault', 'core/traefik'],
          mandatory: CORE_SERVICES.includes(db.name) || db.name === 'postgresql' || db.name === 'valkey',
          enabled: true,
          priority,
        }),
      );
    }

    // If no databases enabled, add core ones with disabled state
    if (tasks.length === 0) {
      tasks.push(
        this.createTask({
          id: 'db/postgresql',
          name: 'Deploy PostgreSQL',
          description: 'Deploy PostgreSQL database',
          phase: DeploymentPhase.DATABASES,
          type: TaskType.HELMFILE,
          helmfileSelector: 'name=postgresql',
          service: 'postgresql',
          namespace: 'db',
          dependencies: ['core/vault', 'core/traefik'],
          mandatory: true,
          enabled: false,
          priority: 0,
        }),
        this.createTask({
          id: 'db/valkey',
          name: 'Deploy Valkey',
          description: 'Deploy Valkey cache',
          phase: DeploymentPhase.DATABASES,
          type: TaskType.HELMFILE,
          helmfileSelector: 'name=valkey',
          service: 'valkey',
          namespace: 'db',
          dependencies: ['core/vault', 'core/traefik'],
          mandatory: true,
          enabled: false,
          priority: 10,
        }),
      );
    }

    return tasks;
  }

  /**
   * Build application tasks
   */
  private buildApplicationTasks(): DeployTask[] {
    const tasks: DeployTask[] = [];

    // Get enabled applications (non-db, non-core services)
    const coreNamespaces = ['ingress', 'service', 'db'];
    const enabledApps = this.servicesService
      .getEnabled()
      .filter((s) => !coreNamespaces.includes(s.namespace));

    // Application priority by namespace
    const namespacePriority: Record<string, number> = {
      infrastructure: 0, // Deploy infrastructure apps first
      code: 10, // Then dev tools
      data: 20, // Then data services
      productivity: 30, // Then productivity
      automation: 40, // Then automation
      social: 50, // Then social
      content: 60, // Then content
      utilities: 70, // Finally utilities
    };

    for (const app of enabledApps) {
      const deps = this.calculateAppDependencies(app);
      const basePriority = namespacePriority[app.namespace] ?? 50;

      tasks.push(
        this.createTask({
          id: `app/${app.name}`,
          name: `Deploy ${app.name}`,
          description: `Deploy ${app.name} application`,
          phase: DeploymentPhase.APPLICATION_SERVICES,
          type: TaskType.HELMFILE,
          helmfileSelector: `name=${app.name}`,
          service: app.name,
          namespace: app.namespace,
          dependencies: deps,
          mandatory: CORE_SERVICES.includes(app.name),
          enabled: true,
          priority: basePriority,
        }),
      );
    }

    return tasks;
  }

  /**
   * Build network gateway tasks
   */
  private buildNetworkGatewayTasks(): DeployTask[] {
    const templates: TaskTemplate[] = [
      {
        id: 'network/pangolin-server',
        name: 'Deploy Pangolin Server',
        description: 'Deploy Pangolin VPN server on gateway',
        phase: DeploymentPhase.NETWORK_GATEWAY,
        type: TaskType.ANSIBLE,
        ansibleTags: ['pangolin'],
        dependencies: ['core/traefik'],
        mandatory: true,
        priority: 0,
      },
      {
        id: 'network/pangolin',
        name: 'Deploy Pangolin Client',
        description: 'Deploy Pangolin VPN client in cluster',
        phase: DeploymentPhase.NETWORK_GATEWAY,
        type: TaskType.HELMFILE,
        helmfileSelector: 'name=pangolin',
        dependencies: ['network/pangolin-server'],
        mandatory: true,
        priority: 10,
      },
      {
        id: 'network/dns',
        name: 'Configure DNS',
        description: 'Configure DNS records for services',
        phase: DeploymentPhase.NETWORK_GATEWAY,
        type: TaskType.ANSIBLE,
        ansibleTags: ['pangolin', 'dns'],
        dependencies: ['network/pangolin'],
        mandatory: true,
        priority: 20,
      },
    ];

    return templates.map((t) => this.createTask(t));
  }

  /**
   * Build verification tasks
   */
  private buildVerificationTasks(): DeployTask[] {
    const templates: TaskTemplate[] = [
      {
        id: 'verify/pods',
        name: 'Verify pods',
        description: 'Verify all pods are Running',
        phase: DeploymentPhase.VERIFICATION,
        type: TaskType.VALIDATION,
        dependencies: ['network/dns'],
        mandatory: true,
        priority: 0,
      },
      {
        id: 'verify/ingress',
        name: 'Test ingress',
        description: 'Test ingress endpoints are accessible',
        phase: DeploymentPhase.VERIFICATION,
        type: TaskType.VALIDATION,
        dependencies: ['verify/pods'],
        mandatory: true,
        priority: 10,
      },
      {
        id: 'verify/helm-tests',
        name: 'Run Helm tests',
        description: 'Run Helm test pods for all releases',
        phase: DeploymentPhase.VERIFICATION,
        type: TaskType.SHELL,
        dependencies: ['verify/ingress'],
        mandatory: false,
        priority: 20,
      },
      {
        id: 'verify/credentials',
        name: 'Generate credentials',
        description: 'Generate deployment report with credentials',
        phase: DeploymentPhase.VERIFICATION,
        type: TaskType.ANSIBLE,
        ansibleTags: ['validate', 'report'],
        dependencies: ['verify/ingress'],
        mandatory: true,
        priority: 30,
      },
    ];

    return templates.map((t) => this.createTask(t));
  }

  /**
   * Calculate dependencies for an application
   */
  private calculateAppDependencies(app: Service): string[] {
    const deps: string[] = [];

    // Base dependencies for all apps
    deps.push('core/vault', 'core/traefik');

    // Add dependencies from service definition
    if (app.needs && app.needs.length > 0) {
      for (const need of app.needs) {
        // Convert namespace/name format to task ID
        if (need.includes('/')) {
          const [namespace, name] = need.split('/');
          if (namespace === 'db') {
            deps.push(`db/${name}`);
          } else if (namespace === 'ingress' || namespace === 'service') {
            deps.push(`core/${name}`);
          }
        }
      }
    }

    // Add dependencies from static map
    const staticDeps = SERVICE_DEPENDENCIES[app.name];
    if (staticDeps) {
      for (const dep of staticDeps) {
        if (dep.includes('/')) {
          const [namespace, name] = dep.split('/');
          if (namespace === 'db') {
            deps.push(`db/${name}`);
          }
        }
      }
    }

    // Deduplicate
    return [...new Set(deps)];
  }

  /**
   * Create a DeployTask from a template
   */
  private createTask(template: TaskTemplate): DeployTask {
    const estimatedDuration = template.estimatedDuration
      ?? ESTIMATED_DURATIONS[template.id]
      ?? ESTIMATED_DURATIONS[`default/${template.type === TaskType.HELMFILE ? 'application' : 'database'}`]
      ?? 60;

    const task: DeployTask = {
      id: template.id,
      name: template.name,
      description: template.description ?? template.name,
      phase: template.phase,
      type: template.type,
      status: TaskStatus.PENDING,
      dependencies: template.dependencies,
      dependents: [], // Will be computed by DAGManager
      service: template.service,
      namespace: template.namespace,
      ansibleTags: template.ansibleTags,
      helmfileSelector: template.helmfileSelector,
      mandatory: template.mandatory,
      enabled: template.enabled ?? true,
      estimatedDuration,
      timing: {},
      logs: [] as LogLine[],
      priority: template.priority ?? 100,
      maxRetries: template.mandatory ? 2 : 1,
      allowConcurrent: true,
    };

    return task;
  }

  /**
   * Get tasks for a specific phase
   */
  getTasksForPhase(phase: DeploymentPhase): DeployTask[] {
    return this.buildTaskGraph().filter((t) => t.phase === phase);
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): DeployTask | undefined {
    return this.buildTaskGraph().find((t) => t.id === taskId);
  }

  /**
   * Get mandatory tasks
   */
  getMandatoryTasks(): DeployTask[] {
    return this.buildTaskGraph().filter((t) => t.mandatory);
  }

  /**
   * Get tasks for a specific service
   */
  getTasksForService(serviceName: string): DeployTask[] {
    return this.buildTaskGraph().filter((t) => t.service === serviceName);
  }
}
