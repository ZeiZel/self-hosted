import { Injectable, Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database.service';
import {
  ServiceConfig,
  ServiceTier,
  ServiceNamespace,
  ServiceResources,
} from '../entities/service-config.entity';
import { createTimestamps, updateTimestamp } from '../entities/base.entity';

/**
 * Row type returned from SQLite
 */
interface ServiceConfigRow {
  id: string;
  name: string;
  enabled: number;
  tier: string;
  namespace: string;
  resources: string;
  placement: string | null;
  overrides: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Input for creating service config
 */
export interface CreateServiceConfigInput {
  name: string;
  enabled?: boolean;
  tier: ServiceTier;
  namespace: ServiceNamespace;
  resources?: Partial<ServiceResources>;
  placement?: string[];
  overrides?: Record<string, unknown>;
}

/**
 * Input for updating service config
 */
export interface UpdateServiceConfigInput {
  enabled?: boolean;
  resources?: Partial<ServiceResources>;
  placement?: string[];
  overrides?: Record<string, unknown>;
}

/**
 * Repository for service configuration CRUD operations
 */
@Injectable()
export class ServiceConfigRepository {
  constructor(
    @Inject(DatabaseService)
    private readonly db: DatabaseService,
  ) {}

  /**
   * Find all service configs
   */
  findAll(): ServiceConfig[] {
    const rows = this.db.query<ServiceConfigRow>('SELECT * FROM service_configs ORDER BY name');
    return rows.map((row) => this.rowToServiceConfig(row));
  }

  /**
   * Find enabled service configs
   */
  findEnabled(): ServiceConfig[] {
    const rows = this.db.query<ServiceConfigRow>(
      'SELECT * FROM service_configs WHERE enabled = 1 ORDER BY name',
    );
    return rows.map((row) => this.rowToServiceConfig(row));
  }

  /**
   * Find by ID
   */
  findById(id: string): ServiceConfig | null {
    const row = this.db.queryOne<ServiceConfigRow>('SELECT * FROM service_configs WHERE id = ?', [
      id,
    ]);
    return row ? this.rowToServiceConfig(row) : null;
  }

  /**
   * Find by name
   */
  findByName(name: string): ServiceConfig | null {
    const row = this.db.queryOne<ServiceConfigRow>('SELECT * FROM service_configs WHERE name = ?', [
      name,
    ]);
    return row ? this.rowToServiceConfig(row) : null;
  }

  /**
   * Find by namespace
   */
  findByNamespace(namespace: ServiceNamespace): ServiceConfig[] {
    const rows = this.db.query<ServiceConfigRow>(
      'SELECT * FROM service_configs WHERE namespace = ? ORDER BY name',
      [namespace],
    );
    return rows.map((row) => this.rowToServiceConfig(row));
  }

  /**
   * Find by tier
   */
  findByTier(tier: ServiceTier): ServiceConfig[] {
    const rows = this.db.query<ServiceConfigRow>(
      'SELECT * FROM service_configs WHERE tier = ? ORDER BY name',
      [tier],
    );
    return rows.map((row) => this.rowToServiceConfig(row));
  }

  /**
   * Create or update service config
   */
  upsert(input: CreateServiceConfigInput): ServiceConfig {
    const existing = this.findByName(input.name);

    if (existing) {
      return this.update(existing.id, {
        enabled: input.enabled,
        resources: input.resources,
        placement: input.placement,
        overrides: input.overrides,
      })!;
    }

    return this.create(input);
  }

  /**
   * Create new service config
   */
  create(input: CreateServiceConfigInput): ServiceConfig {
    const id = randomUUID();
    const timestamps = createTimestamps();
    const defaultResources: ServiceResources = {
      cpu: 100,
      memory: 128 * 1024 * 1024,
      storage: 0,
    };

    const stmt = this.db.prepare(`
      INSERT INTO service_configs (
        id, name, enabled, tier, namespace, resources, placement, overrides,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.name,
      input.enabled ? 1 : 0,
      input.tier,
      input.namespace,
      JSON.stringify({ ...defaultResources, ...input.resources }),
      input.placement ? JSON.stringify(input.placement) : null,
      input.overrides ? JSON.stringify(input.overrides) : null,
      timestamps.createdAt,
      timestamps.updatedAt,
    );

    return this.findById(id)!;
  }

  /**
   * Update service config
   */
  update(id: string, input: UpdateServiceConfigInput): ServiceConfig | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: unknown[] = [];

    if (input.enabled !== undefined) {
      updates.push('enabled = ?');
      values.push(input.enabled ? 1 : 0);
    }

    if (input.resources !== undefined) {
      const newResources = { ...existing.resources, ...input.resources };
      updates.push('resources = ?');
      values.push(JSON.stringify(newResources));
    }

    if (input.placement !== undefined) {
      updates.push('placement = ?');
      values.push(JSON.stringify(input.placement));
    }

    if (input.overrides !== undefined) {
      updates.push('overrides = ?');
      values.push(JSON.stringify(input.overrides));
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push('updated_at = ?');
    values.push(updateTimestamp().updatedAt);
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE service_configs SET ${updates.join(', ')} WHERE id = ?
    `);
    stmt.run(...values);

    return this.findById(id);
  }

  /**
   * Enable a service
   */
  enable(name: string): ServiceConfig | null {
    const config = this.findByName(name);
    if (!config) return null;
    return this.update(config.id, { enabled: true });
  }

  /**
   * Disable a service
   */
  disable(name: string): ServiceConfig | null {
    const config = this.findByName(name);
    if (!config) return null;
    return this.update(config.id, { enabled: false });
  }

  /**
   * Toggle service enabled state
   */
  toggle(name: string): ServiceConfig | null {
    const config = this.findByName(name);
    if (!config) return null;
    return this.update(config.id, { enabled: !config.enabled });
  }

  /**
   * Delete service config
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM service_configs WHERE id = ?');
    stmt.run(id);
    return this.db.getConnection().changes > 0;
  }

  /**
   * Delete by name
   */
  deleteByName(name: string): boolean {
    const stmt = this.db.prepare('DELETE FROM service_configs WHERE name = ?');
    stmt.run(name);
    return this.db.getConnection().changes > 0;
  }

  /**
   * Count configs
   */
  count(): { total: number; enabled: number } {
    const row = this.db.queryOne<{ total: number; enabled: number }>(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) as enabled
      FROM service_configs
    `);
    return {
      total: row?.total ?? 0,
      enabled: row?.enabled ?? 0,
    };
  }

  /**
   * Count by tier
   */
  countByTier(): Record<ServiceTier, number> {
    const rows = this.db.query<{ tier: string; count: number }>(`
      SELECT tier, COUNT(*) as count
      FROM service_configs
      WHERE enabled = 1
      GROUP BY tier
    `);

    const result: Record<ServiceTier, number> = {
      [ServiceTier.HEAVY]: 0,
      [ServiceTier.MEDIUM]: 0,
      [ServiceTier.LIGHT]: 0,
    };

    for (const row of rows) {
      result[row.tier as ServiceTier] = row.count;
    }

    return result;
  }

  /**
   * Calculate total resources for enabled services
   */
  calculateTotalResources(): ServiceResources {
    const configs = this.findEnabled();

    return configs.reduce(
      (total, config) => ({
        cpu: total.cpu + config.resources.cpu,
        memory: total.memory + config.resources.memory,
        storage: total.storage + config.resources.storage,
      }),
      { cpu: 0, memory: 0, storage: 0 },
    );
  }

  /**
   * Convert SQLite row to ServiceConfig model
   */
  private rowToServiceConfig(row: ServiceConfigRow): ServiceConfig {
    return {
      id: row.id,
      name: row.name,
      enabled: row.enabled === 1,
      tier: row.tier as ServiceTier,
      namespace: row.namespace as ServiceNamespace,
      resources: JSON.parse(row.resources),
      placement: row.placement ? JSON.parse(row.placement) : undefined,
      overrides: row.overrides ? JSON.parse(row.overrides) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
