import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { ServicesParser } from './services.parser';
import {
  Service,
  ServiceConfig,
  ServiceDefinition,
  ServiceNamespace,
  CORE_SERVICES,
  SERVICE_DEPENDENCIES,
  getServiceTier,
} from '../../interfaces/service.interface';
import { parseCpuToMillicores, parseMemoryToBytes } from '../../utils/validation';

@Injectable()
export class ServicesService {
  private servicesCache: ServiceDefinition[] | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly parser: ServicesParser,
  ) {}

  /**
   * Get all available services
   */
  getAll(): Service[] {
    const definitions = this.getDefinitions();
    const configs = this.configService.loadServicesConfig();

    return definitions.map((def) => {
      const config = configs[def.name] ?? this.getDefaultConfig(def.name);
      const resources = this.parser.getResourceDefaults(def.name);

      return {
        ...def,
        config: {
          ...config,
          resources: config.resources ?? resources,
        },
        tier: getServiceTier(config.resources ?? resources),
      };
    });
  }

  /**
   * Get service definitions (from _others.yaml)
   */
  getDefinitions(): ServiceDefinition[] {
    if (!this.servicesCache) {
      this.servicesCache = this.parser.parseServicesRegistry();
    }
    return this.servicesCache;
  }

  /**
   * Get service by name
   */
  getByName(name: string): Service | undefined {
    return this.getAll().find((s) => s.name === name);
  }

  /**
   * Get services by namespace
   */
  getByNamespace(namespace: ServiceNamespace): Service[] {
    return this.getAll().filter((s) => s.namespace === namespace);
  }

  /**
   * Get enabled services
   */
  getEnabled(): Service[] {
    return this.getAll().filter((s) => s.config.enabled);
  }

  /**
   * Get core services (always required)
   */
  getCoreServices(): Service[] {
    return this.getAll().filter((s) => CORE_SERVICES.includes(s.name));
  }

  /**
   * Enable/disable a service
   */
  setEnabled(name: string, enabled: boolean): void {
    const configs = this.configService.loadServicesConfig();
    const definition = this.getDefinitions().find((d) => d.name === name);

    if (!definition) {
      throw new Error(`Service '${name}' not found`);
    }

    // Core services cannot be disabled
    if (!enabled && CORE_SERVICES.includes(name)) {
      throw new Error(`Core service '${name}' cannot be disabled`);
    }

    configs[name] = {
      ...this.getDefaultConfig(name),
      ...configs[name],
      enabled,
    };

    this.configService.saveServicesConfig(configs);
  }

  /**
   * Update service configuration
   */
  updateConfig(name: string, updates: Partial<ServiceConfig>): void {
    const configs = this.configService.loadServicesConfig();
    const definition = this.getDefinitions().find((d) => d.name === name);

    if (!definition) {
      throw new Error(`Service '${name}' not found`);
    }

    configs[name] = {
      ...this.getDefaultConfig(name),
      ...configs[name],
      ...updates,
    };

    this.configService.saveServicesConfig(configs);
  }

  /**
   * Get default configuration for a service
   */
  getDefaultConfig(name: string): ServiceConfig {
    const resources = this.parser.getResourceDefaults(name);
    const isCore = CORE_SERVICES.includes(name);

    return {
      enabled: isCore,
      replicas: 1,
      resources,
      expose: false,
    };
  }

  /**
   * Calculate total resource requirements
   */
  calculateTotalResources(): {
    cpu: number; // millicores
    memory: number; // bytes
    storage: number; // bytes
  } {
    const enabled = this.getEnabled();
    let totalCpu = 0;
    let totalMemory = 0;
    let totalStorage = 0;

    for (const service of enabled) {
      const { resources } = service.config;
      totalCpu += parseCpuToMillicores(resources.cpu) * service.config.replicas;
      totalMemory += parseMemoryToBytes(resources.memory) * service.config.replicas;
      totalStorage += parseMemoryToBytes(resources.storage);
    }

    return { cpu: totalCpu, memory: totalMemory, storage: totalStorage };
  }

  /**
   * Get service dependencies
   */
  getDependencies(name: string): string[] {
    const service = this.getByName(name);
    if (!service) return [];

    const deps = new Set<string>();

    // Add direct dependencies from definition
    service.needs.forEach((d) => deps.add(d));

    // Add dependencies from map
    const mapped = SERVICE_DEPENDENCIES[name];
    if (mapped) {
      mapped.forEach((d) => deps.add(d));
    }

    // Add global dependencies
    const global = SERVICE_DEPENDENCIES['*'];
    if (global) {
      global.forEach((d) => deps.add(d));
    }

    return Array.from(deps);
  }

  /**
   * Get services in deployment order
   */
  getDeploymentOrder(): Service[] {
    const enabled = this.getEnabled();
    const order: Service[] = [];
    const visited = new Set<string>();

    const visit = (service: Service) => {
      if (visited.has(service.name)) return;

      // Visit dependencies first
      const deps = this.getDependencies(service.name);
      for (const dep of deps) {
        // Parse namespace/name format
        const depName = dep.includes('/') ? dep.split('/')[1] : dep;
        const depService = enabled.find((s) => s.name === depName);
        if (depService) {
          visit(depService);
        }
      }

      visited.add(service.name);
      order.push(service);
    };

    for (const service of enabled) {
      visit(service);
    }

    return order;
  }

  /**
   * Validate service selection
   */
  validateSelection(): { valid: boolean; errors: string[]; warnings: string[] } {
    const enabled = this.getEnabled();
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check core services are enabled
    for (const coreName of CORE_SERVICES) {
      if (!enabled.some((s) => s.name === coreName)) {
        errors.push(`Core service '${coreName}' must be enabled`);
      }
    }

    // Check dependencies are met
    for (const service of enabled) {
      const deps = this.getDependencies(service.name);
      for (const dep of deps) {
        const depName = dep.includes('/') ? dep.split('/')[1] : dep;
        if (!enabled.some((s) => s.name === depName)) {
          errors.push(`Service '${service.name}' requires '${depName}' to be enabled`);
        }
      }
    }

    // Warnings for heavy services
    const heavy = enabled.filter((s) => s.tier === 'heavy');
    if (heavy.length > 5) {
      warnings.push(`${heavy.length} heavy services selected. Ensure sufficient resources.`);
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    total: number;
    enabled: number;
    byTier: { heavy: number; medium: number; light: number };
    byNamespace: Record<ServiceNamespace, number>;
  } {
    const all = this.getAll();
    const enabled = this.getEnabled();

    const byTier = { heavy: 0, medium: 0, light: 0 };
    const byNamespace: Record<ServiceNamespace, number> = {} as Record<ServiceNamespace, number>;

    for (const service of enabled) {
      byTier[service.tier]++;
      byNamespace[service.namespace] = (byNamespace[service.namespace] ?? 0) + 1;
    }

    return {
      total: all.length,
      enabled: enabled.length,
      byTier,
      byNamespace,
    };
  }

  /**
   * Clear service cache
   */
  clearCache(): void {
    this.servicesCache = null;
  }
}
