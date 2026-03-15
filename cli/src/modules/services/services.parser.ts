import { Injectable } from '@nestjs/common';
import { join } from 'path';
import { existsSync } from 'fs';
import { ConfigService } from '../config/config.service';
import { loadYaml } from '../../utils/yaml';
import {
  ServiceDefinition,
  ServiceNamespace,
  ServiceResources,
  SERVICE_DEFAULTS,
} from '../../interfaces/service.interface';

interface AppEntry {
  repo: string;
  chart: string;
  namespace: string;
  version: string;
  installed?: boolean;
  mandatory?: boolean;
  tier?: 'core' | 'infrastructure' | 'database' | 'application';
  needs?: string[];
  createNamespace?: boolean;
}

interface AppsRegistry {
  apps: Record<string, AppEntry>;
}

interface ChartValues {
  resources?: {
    requests?: {
      cpu?: string;
      memory?: string;
    };
    limits?: {
      cpu?: string;
      memory?: string;
    };
  };
  persistence?: {
    size?: string;
  };
  [key: string]: unknown;
}

@Injectable()
export class ServicesParser {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Parse all services from _others.yaml
   */
  parseServicesRegistry(): ServiceDefinition[] {
    const paths = this.configService.getPaths();
    const registry = loadYaml<AppsRegistry>(paths.appsRegistry);

    if (!registry || !registry.apps) {
      throw new Error(`Failed to load apps registry: ${paths.appsRegistry}`);
    }

    const services: ServiceDefinition[] = [];

    for (const [name, entry] of Object.entries(registry.apps)) {
      const namespace = this.parseNamespace(entry.namespace);

      services.push({
        name,
        repo: entry.repo,
        chart: entry.chart,
        namespace,
        version: entry.version,
        installed: entry.installed !== false,
        mandatory: entry.mandatory ?? false,
        tier: entry.tier ?? 'application',
        needs: entry.needs ?? [],
        description: this.getServiceDescription(name),
      });
    }

    return services;
  }

  /**
   * Get resource defaults for a service
   */
  getResourceDefaults(serviceName: string): ServiceResources {
    // Check built-in defaults first
    if (SERVICE_DEFAULTS[serviceName]) {
      return SERVICE_DEFAULTS[serviceName];
    }

    // Try to parse from chart values.yaml
    const paths = this.configService.getPaths();
    const chartValuesPath = join(paths.charts, serviceName, 'values.yaml');

    if (existsSync(chartValuesPath)) {
      const values = loadYaml<ChartValues>(chartValuesPath);
      if (values?.resources?.requests) {
        return {
          cpu: values.resources.requests.cpu ?? '100m',
          memory: values.resources.requests.memory ?? '128Mi',
          storage: values.persistence?.size ?? '1Gi',
        };
      }
    }

    // Return generic defaults
    return { cpu: '100m', memory: '128Mi', storage: '1Gi' };
  }

  /**
   * Parse namespace string to enum
   */
  private parseNamespace(namespace: string): ServiceNamespace {
    const mapping: Record<string, ServiceNamespace> = {
      ingress: ServiceNamespace.INGRESS,
      service: ServiceNamespace.SERVICE,
      db: ServiceNamespace.DB,
      code: ServiceNamespace.CODE,
      productivity: ServiceNamespace.PRODUCTIVITY,
      social: ServiceNamespace.SOCIAL,
      data: ServiceNamespace.DATA,
      infrastructure: ServiceNamespace.INFRASTRUCTURE,
      automation: ServiceNamespace.AUTOMATION,
      content: ServiceNamespace.CONTENT,
      utilities: ServiceNamespace.UTILITIES,
    };

    return mapping[namespace] ?? ServiceNamespace.SERVICE;
  }

  /**
   * Get service description
   */
  private getServiceDescription(name: string): string {
    const descriptions: Record<string, string> = {
      // Databases
      postgresql: 'PostgreSQL relational database',
      mongodb: 'MongoDB document database',
      valkey: 'Valkey (Redis-compatible) cache',
      minio: 'MinIO S3-compatible object storage',
      clickhouse: 'ClickHouse OLAP database',
      mysql: 'MySQL relational database',
      rabbitmq: 'RabbitMQ message broker',

      // Core
      traefik: 'Traefik ingress controller',
      consul: 'Consul service mesh',
      vault: 'HashiCorp Vault secrets management',
      authentik: 'Authentik identity provider (SSO)',
      'cert-manager': 'TLS certificate management',
      monitoring: 'Prometheus + Grafana monitoring stack',
      logging: 'Loki log aggregation',
      namespaces: 'Kubernetes namespace configuration',

      // Code
      gitlab: 'GitLab DevOps platform',
      hub: 'JetBrains Hub user management',
      youtrack: 'YouTrack issue tracking',
      teamcity: 'TeamCity CI/CD server',
      coder: 'Coder cloud IDE',

      // Productivity
      affine: 'AFFiNE collaborative workspace',
      excalidraw: 'Excalidraw whiteboard',
      penpot: 'Penpot design tool',

      // Social
      stoat: 'Stoat (Revolt fork) chat platform',
      stalwart: 'Stalwart email server',

      // Data
      vaultwarden: 'Vaultwarden password manager',
      syncthing: 'Syncthing file synchronization',
      nextcloud: 'Nextcloud file sharing & collaboration',
      rybbit: 'Rybbit analytics platform',

      // Automation
      kestra: 'Kestra data orchestration',
      n8n: 'n8n workflow automation',
      openclaw: 'OpenClaw AI agent platform',

      // Infrastructure
      harbor: 'Harbor container registry',
      bytebase: 'Bytebase database schema management',
      glance: 'Glance dashboard',
      pangolin: 'Pangolin VPN/WireGuard gateway',
      remnawave: 'Remnawave infrastructure tools',

      // Content
      ghost: 'Ghost blogging platform',

      // Utilities
      vert: 'Vert URL shortener',
      metube: 'MeTube YouTube downloader',

      // Others
      supabase: 'Supabase Backend-as-a-Service',
      devtron: 'Devtron Kubernetes dashboard',
    };

    return descriptions[name] ?? `${name} service`;
  }

  /**
   * Get services grouped by namespace
   */
  getServicesByNamespace(): Map<ServiceNamespace, ServiceDefinition[]> {
    const services = this.parseServicesRegistry();
    const grouped = new Map<ServiceNamespace, ServiceDefinition[]>();

    for (const service of services) {
      const existing = grouped.get(service.namespace) ?? [];
      existing.push(service);
      grouped.set(service.namespace, existing);
    }

    return grouped;
  }
}
