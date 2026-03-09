import { Injectable, Inject } from '@nestjs/common';
import { join } from 'path';
import {
  PlacementPreset,
  PlacementConstraint,
  BalancingStrategy,
  placementPresetSchema,
} from '../../interfaces/placement.interface';
import { ConfigService } from '../config/config.service';
import { loadYaml, saveYaml } from '../../utils/yaml';
import { logger } from '../../utils/logger';

/**
 * Service for managing placement presets
 */
@Injectable()
export class PresetsService {
  private readonly PRESETS_FILE = 'placement-presets.yaml';

  constructor(@Inject(ConfigService) private configService: ConfigService) {}

  /**
   * Get presets file path
   */
  private getPresetsPath(): string {
    return join(this.configService.getProjectDir(), this.PRESETS_FILE);
  }

  /**
   * Get all saved presets
   */
  getAll(): PlacementPreset[] {
    const data = loadYaml<{ presets: PlacementPreset[] }>(this.getPresetsPath());
    return data?.presets || [];
  }

  /**
   * Get a preset by name
   */
  get(name: string): PlacementPreset | null {
    const presets = this.getAll();
    return presets.find((p) => p.name === name) || null;
  }

  /**
   * Save a new preset
   */
  save(preset: PlacementPreset): void {
    // Validate preset
    const validation = placementPresetSchema.safeParse(preset);
    if (!validation.success) {
      throw new Error(`Invalid preset: ${validation.error.message}`);
    }

    const presets = this.getAll();

    // Check if preset with same name exists
    const existingIndex = presets.findIndex((p) => p.name === preset.name);
    if (existingIndex >= 0) {
      presets[existingIndex] = preset;
      logger.info(`Updated preset: ${preset.name}`);
    } else {
      presets.push(preset);
      logger.info(`Created preset: ${preset.name}`);
    }

    saveYaml(this.getPresetsPath(), { presets });
  }

  /**
   * Delete a preset
   */
  delete(name: string): boolean {
    const presets = this.getAll();
    const index = presets.findIndex((p) => p.name === name);

    if (index < 0) {
      return false;
    }

    presets.splice(index, 1);
    saveYaml(this.getPresetsPath(), { presets });
    logger.info(`Deleted preset: ${name}`);
    return true;
  }

  /**
   * Create preset from current placement decisions
   */
  createFromPlacements(
    name: string,
    description: string,
    strategy: BalancingStrategy,
    placements: { service: string; node: string }[],
    constraints: PlacementConstraint[] = [],
  ): PlacementPreset {
    return {
      name,
      description,
      createdAt: new Date().toISOString(),
      strategy,
      placements,
      constraints,
    };
  }

  /**
   * Export preset to JSON
   */
  export(name: string): string {
    const preset = this.get(name);
    if (!preset) {
      throw new Error(`Preset not found: ${name}`);
    }
    return JSON.stringify(preset, null, 2);
  }

  /**
   * Import preset from JSON
   */
  import(json: string): PlacementPreset {
    const data = JSON.parse(json);
    const validation = placementPresetSchema.safeParse(data);

    if (!validation.success) {
      throw new Error(`Invalid preset JSON: ${validation.error.message}`);
    }

    const preset = validation.data as PlacementPreset;
    this.save(preset);
    return preset;
  }

  /**
   * List presets with summary info
   */
  list(): {
    name: string;
    description: string;
    strategy: BalancingStrategy;
    serviceCount: number;
    createdAt: string;
  }[] {
    return this.getAll().map((p) => ({
      name: p.name,
      description: p.description,
      strategy: p.strategy,
      serviceCount: p.placements.length,
      createdAt: p.createdAt,
    }));
  }

  /**
   * Clone a preset with a new name
   */
  clone(sourceName: string, newName: string): PlacementPreset {
    const source = this.get(sourceName);
    if (!source) {
      throw new Error(`Source preset not found: ${sourceName}`);
    }

    const clone: PlacementPreset = {
      ...source,
      name: newName,
      description: `Clone of ${sourceName}`,
      createdAt: new Date().toISOString(),
    };

    this.save(clone);
    return clone;
  }

  /**
   * Get built-in preset templates
   */
  getTemplates(): PlacementPreset[] {
    return [
      {
        name: 'high-availability',
        description: 'Spread services across nodes for maximum resilience',
        createdAt: new Date().toISOString(),
        strategy: BalancingStrategy.SPREAD,
        placements: [],
        constraints: [
          {
            type: 'service-anti-affinity' as any,
            service: '*',
            target: '*',
            hard: false,
          },
        ],
      },
      {
        name: 'resource-efficient',
        description: 'Pack services tightly to minimize node usage',
        createdAt: new Date().toISOString(),
        strategy: BalancingStrategy.BIN_PACKING,
        placements: [],
        constraints: [],
      },
      {
        name: 'database-isolated',
        description: 'Keep databases on dedicated storage nodes',
        createdAt: new Date().toISOString(),
        strategy: BalancingStrategy.AFFINITY,
        placements: [],
        constraints: [
          {
            type: 'role-requirement' as any,
            service: 'postgresql',
            roles: ['storage'] as any,
            hard: true,
          },
          {
            type: 'role-requirement' as any,
            service: 'mongodb',
            roles: ['storage'] as any,
            hard: true,
          },
          {
            type: 'role-requirement' as any,
            service: 'clickhouse',
            roles: ['storage'] as any,
            hard: true,
          },
        ],
      },
    ];
  }

  /**
   * Apply a template
   */
  applyTemplate(templateName: string, presetName: string): PlacementPreset {
    const templates = this.getTemplates();
    const template = templates.find((t) => t.name === templateName);

    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }

    const preset: PlacementPreset = {
      ...template,
      name: presetName,
      createdAt: new Date().toISOString(),
    };

    this.save(preset);
    return preset;
  }
}
