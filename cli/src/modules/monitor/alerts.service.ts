import { Injectable } from '@nestjs/common';
import {
  Alert,
  AlertSeverity,
  AlertThresholds,
  DEFAULT_ALERT_THRESHOLDS,
  NodeMetrics,
  ServiceMetrics,
  NodeHealth,
  PodStatus,
} from '../../interfaces/monitor.interface';

/**
 * Service for generating and managing alerts
 */
@Injectable()
export class AlertsService {
  private thresholds: AlertThresholds = DEFAULT_ALERT_THRESHOLDS;
  private acknowledgedAlerts = new Set<string>();
  private alertHistory: Alert[] = [];

  /**
   * Set alert thresholds
   */
  setThresholds(thresholds: Partial<AlertThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  /**
   * Get current thresholds
   */
  getThresholds(): AlertThresholds {
    return { ...this.thresholds };
  }

  /**
   * Generate alerts based on current metrics
   */
  generateAlerts(nodes: NodeMetrics[], services: ServiceMetrics[]): Alert[] {
    const alerts: Alert[] = [];

    // Node alerts
    for (const node of nodes) {
      // CPU alerts
      if (node.cpu.percent >= this.thresholds.cpu.critical) {
        alerts.push(
          this.createAlert(
            AlertSeverity.CRITICAL,
            `Node ${node.name} CPU critical`,
            `CPU usage at ${node.cpu.percent}%, threshold: ${this.thresholds.cpu.critical}%`,
            node.name,
          ),
        );
      } else if (node.cpu.percent >= this.thresholds.cpu.warning) {
        alerts.push(
          this.createAlert(
            AlertSeverity.WARNING,
            `Node ${node.name} CPU warning`,
            `CPU usage at ${node.cpu.percent}%, threshold: ${this.thresholds.cpu.warning}%`,
            node.name,
          ),
        );
      }

      // Memory alerts
      if (node.memory.percent >= this.thresholds.memory.critical) {
        alerts.push(
          this.createAlert(
            AlertSeverity.CRITICAL,
            `Node ${node.name} memory critical`,
            `Memory usage at ${node.memory.percent}%, threshold: ${this.thresholds.memory.critical}%`,
            node.name,
          ),
        );
      } else if (node.memory.percent >= this.thresholds.memory.warning) {
        alerts.push(
          this.createAlert(
            AlertSeverity.WARNING,
            `Node ${node.name} memory warning`,
            `Memory usage at ${node.memory.percent}%, threshold: ${this.thresholds.memory.warning}%`,
            node.name,
          ),
        );
      }

      // Node health alerts
      if (node.health === NodeHealth.CRITICAL) {
        alerts.push(
          this.createAlert(
            AlertSeverity.CRITICAL,
            `Node ${node.name} unhealthy`,
            `Node is in critical health state`,
            node.name,
          ),
        );
      }

      // Failed pods on node
      if (node.pods.failed > 0) {
        alerts.push(
          this.createAlert(
            AlertSeverity.WARNING,
            `Failed pods on ${node.name}`,
            `${node.pods.failed} pod(s) in failed state`,
            node.name,
          ),
        );
      }
    }

    // Service alerts
    for (const service of services) {
      // Restart alerts
      if (service.restarts >= this.thresholds.restarts.critical) {
        alerts.push(
          this.createAlert(
            AlertSeverity.CRITICAL,
            `${service.name} restart loop`,
            `${service.restarts} restarts, threshold: ${this.thresholds.restarts.critical}`,
            service.name,
          ),
        );
      } else if (service.restarts >= this.thresholds.restarts.warning) {
        alerts.push(
          this.createAlert(
            AlertSeverity.WARNING,
            `${service.name} multiple restarts`,
            `${service.restarts} restarts, threshold: ${this.thresholds.restarts.warning}`,
            service.name,
          ),
        );
      }

      // Status alerts
      if (service.status === PodStatus.FAILED || service.status === PodStatus.ERROR) {
        alerts.push(
          this.createAlert(
            AlertSeverity.CRITICAL,
            `${service.name} failed`,
            `Service is in ${service.status} state`,
            service.name,
          ),
        );
      } else if (service.status === PodStatus.CRASH_LOOP) {
        alerts.push(
          this.createAlert(
            AlertSeverity.CRITICAL,
            `${service.name} crash looping`,
            `Service is in CrashLoopBackOff state`,
            service.name,
          ),
        );
      } else if (service.status === PodStatus.IMAGE_PULL) {
        alerts.push(
          this.createAlert(
            AlertSeverity.WARNING,
            `${service.name} image pull error`,
            `Unable to pull container image`,
            service.name,
          ),
        );
      } else if (service.status === PodStatus.PENDING) {
        alerts.push(
          this.createAlert(
            AlertSeverity.INFO,
            `${service.name} pending`,
            `Service is waiting to be scheduled`,
            service.name,
          ),
        );
      }

      // Replica alerts
      if (service.replicas.ready < service.replicas.desired) {
        const severity =
          service.replicas.ready === 0 ? AlertSeverity.CRITICAL : AlertSeverity.WARNING;
        alerts.push(
          this.createAlert(
            severity,
            `${service.name} replicas unavailable`,
            `${service.replicas.ready}/${service.replicas.desired} replicas ready`,
            service.name,
          ),
        );
      }
    }

    // Mark acknowledged alerts
    for (const alert of alerts) {
      alert.acknowledged = this.acknowledgedAlerts.has(alert.id);
    }

    // Update history
    this.alertHistory = alerts;

    return alerts;
  }

  /**
   * Create an alert
   */
  private createAlert(
    severity: AlertSeverity,
    title: string,
    message: string,
    source: string,
  ): Alert {
    // Generate consistent ID based on content (so same alert = same ID)
    const baseId = `${severity}-${title}-${source}`;
    const id = this.hashString(baseId);

    return {
      id,
      severity,
      title,
      message,
      source,
      timestamp: new Date().toISOString(),
      acknowledged: false,
    };
  }

  /**
   * Simple hash function for generating consistent IDs
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): void {
    this.acknowledgedAlerts.add(alertId);
  }

  /**
   * Unacknowledge an alert
   */
  unacknowledgeAlert(alertId: string): void {
    this.acknowledgedAlerts.delete(alertId);
  }

  /**
   * Clear all acknowledged alerts
   */
  clearAcknowledged(): void {
    this.acknowledgedAlerts.clear();
  }

  /**
   * Get alert counts by severity
   */
  getAlertCounts(alerts: Alert[]): {
    total: number;
    critical: number;
    warning: number;
    info: number;
    unacknowledged: number;
  } {
    return {
      total: alerts.length,
      critical: alerts.filter((a) => a.severity === AlertSeverity.CRITICAL).length,
      warning: alerts.filter((a) => a.severity === AlertSeverity.WARNING).length,
      info: alerts.filter((a) => a.severity === AlertSeverity.INFO).length,
      unacknowledged: alerts.filter((a) => !a.acknowledged).length,
    };
  }

  /**
   * Filter alerts
   */
  filterAlerts(
    alerts: Alert[],
    options: {
      severity?: AlertSeverity;
      source?: string;
      acknowledged?: boolean;
    },
  ): Alert[] {
    return alerts.filter((alert) => {
      if (options.severity && alert.severity !== options.severity) {
        return false;
      }
      if (options.source && alert.source !== options.source) {
        return false;
      }
      if (options.acknowledged !== undefined && alert.acknowledged !== options.acknowledged) {
        return false;
      }
      return true;
    });
  }

  /**
   * Get alert history
   */
  getHistory(): Alert[] {
    return [...this.alertHistory];
  }

  /**
   * Sort alerts by severity (critical first)
   */
  sortBySeverity(alerts: Alert[]): Alert[] {
    const severityOrder = {
      [AlertSeverity.CRITICAL]: 0,
      [AlertSeverity.WARNING]: 1,
      [AlertSeverity.INFO]: 2,
    };

    return [...alerts].sort((a, b) => {
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }
}
