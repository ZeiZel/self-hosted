import { Injectable, Inject } from '@nestjs/common';
import { ClusterClientService } from './cluster-client.service';
import { MetricsStreamService } from './metrics-stream.service';
import { AlertsService } from './alerts.service';
import { TuiService } from './tui/tui.service';
import {
  MonitorOptions,
  ClusterState,
  MigrationRequest,
  DEFAULT_ALERT_THRESHOLDS,
} from '../../interfaces/monitor.interface';
import { MigratorService } from '../balancing/migrator.service';
import { MigrationStatus } from '../../interfaces/placement.interface';
import { logger } from '../../utils/logger';

/**
 * Main monitor orchestration service
 */
@Injectable()
export class MonitorService {
  constructor(
    @Inject(ClusterClientService) private clusterClient: ClusterClientService,
    @Inject(MetricsStreamService) private metricsStream: MetricsStreamService,
    @Inject(AlertsService) private alertsService: AlertsService,
    @Inject(TuiService) private tuiService: TuiService,
    @Inject(MigratorService) private migratorService: MigratorService,
  ) {}

  /**
   * Start the monitor
   */
  async start(options: Partial<MonitorOptions> = {}): Promise<void> {
    const fullOptions: MonitorOptions = {
      refreshInterval: options.refreshInterval ?? 5,
      headless: options.headless ?? false,
      showAlerts: options.showAlerts ?? true,
      alertThresholds: options.alertThresholds ?? DEFAULT_ALERT_THRESHOLDS,
      filterNamespace: options.filterNamespace,
      filterNode: options.filterNode,
    };

    // Set alert thresholds
    this.alertsService.setThresholds(fullOptions.alertThresholds);

    // Check cluster connection
    const connection = await this.clusterClient.checkConnection();
    if (!connection.connected) {
      logger.error(`Cannot connect to cluster: ${connection.error}`);
      logger.info('Make sure kubectl is configured and the cluster is reachable');
      return;
    }

    if (fullOptions.headless) {
      // Headless mode - output JSON
      await this.runHeadless(fullOptions);
    } else {
      // TUI mode
      await this.runTui(fullOptions);
    }
  }

  /**
   * Run in headless mode (JSON output)
   */
  private async runHeadless(options: MonitorOptions): Promise<void> {
    const state = await this.metricsStream.getCurrentState();

    // Apply filters
    const filteredState = this.applyFilters(state, options);

    console.log(JSON.stringify(filteredState, null, 2));
  }

  /**
   * Run in TUI mode
   */
  private async runTui(options: MonitorOptions): Promise<void> {
    await this.tuiService.start({
      refreshInterval: options.refreshInterval,
      onMigrate: async (request) => {
        await this.handleMigration(request);
      },
    });
  }

  /**
   * Handle migration request from TUI
   */
  private async handleMigration(request: MigrationRequest): Promise<void> {
    logger.info(`Migrating ${request.service} from ${request.sourceNode} to ${request.targetNode}`);

    const migration = {
      id: crypto.randomUUID(),
      service: request.service,
      namespace: request.namespace,
      sourceNode: request.sourceNode,
      targetNode: request.targetNode,
      status: MigrationStatus.PENDING,
    };

    try {
      const result = await this.migratorService.executeMigration(migration);

      if (result.success) {
        logger.success(`Migration completed in ${result.duration}ms`);
      } else {
        logger.error(`Migration failed: ${result.error}`);
      }
    } catch (error) {
      logger.error(`Migration error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Apply filters to cluster state
   */
  private applyFilters(state: ClusterState, options: MonitorOptions): ClusterState {
    let services = state.services;
    let nodes = state.nodes;

    if (options.filterNamespace) {
      services = services.filter((s) => s.namespace === options.filterNamespace);
    }

    if (options.filterNode) {
      nodes = nodes.filter((n) => n.name === options.filterNode);
      services = services.filter((s) => s.node === options.filterNode);
    }

    return {
      ...state,
      nodes,
      services,
    };
  }

  /**
   * Get current cluster state (for external use)
   */
  async getClusterState(): Promise<ClusterState> {
    return this.metricsStream.getCurrentState();
  }

  /**
   * Stop the monitor
   */
  stop(): void {
    this.tuiService.stop();
  }
}
