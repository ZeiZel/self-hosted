import { describe, it, expect, beforeEach } from 'bun:test';
import { AlertsService } from '../../../modules/monitor/alerts.service';
import {
  AlertSeverity,
  NodeHealth,
  PodStatus,
  NodeMetrics,
  ServiceMetrics,
} from '../../../interfaces/monitor.interface';
import { MachineRole } from '../../../interfaces/machine.interface';

describe('AlertsService', () => {
  let alertsService: AlertsService;

  beforeEach(() => {
    alertsService = new AlertsService();
  });

  describe('setThresholds', () => {
    it('should update thresholds partially', () => {
      alertsService.setThresholds({
        cpu: { warning: 80, critical: 95 },
      });

      const thresholds = alertsService.getThresholds();
      expect(thresholds.cpu.warning).toBe(80);
      expect(thresholds.cpu.critical).toBe(95);
      // Memory should remain default
      expect(thresholds.memory.warning).toBe(80);
    });
  });

  describe('generateAlerts', () => {
    const createNode = (overrides: Partial<NodeMetrics> = {}): NodeMetrics => ({
      name: 'test-node',
      ip: '192.168.1.10',
      roles: [MachineRole.WORKER],
      health: NodeHealth.HEALTHY,
      cpu: { total: 8000, used: 2000, percent: 25 },
      memory: { total: 16 * 1024 * 1024 * 1024, used: 4 * 1024 * 1024 * 1024, percent: 25 },
      pods: { total: 10, running: 10, pending: 0, failed: 0 },
      conditions: [{ type: 'Ready', status: 'True' }],
      lastUpdated: new Date().toISOString(),
      ...overrides,
    });

    const createService = (overrides: Partial<ServiceMetrics> = {}): ServiceMetrics => ({
      name: 'test-service',
      namespace: 'default',
      node: 'test-node',
      status: PodStatus.RUNNING,
      health: NodeHealth.HEALTHY,
      replicas: { desired: 1, ready: 1, available: 1 },
      cpu: { requested: 500, limit: 1000, used: 200 },
      memory: { requested: 128 * 1024 * 1024, limit: 512 * 1024 * 1024, used: 100 * 1024 * 1024 },
      restarts: 0,
      age: '1d',
      lastUpdated: new Date().toISOString(),
      ...overrides,
    });

    it('should return no alerts for healthy cluster', () => {
      const nodes = [createNode()];
      const services = [createService()];

      const alerts = alertsService.generateAlerts(nodes, services);

      expect(alerts.length).toBe(0);
    });

    it('should generate CPU warning alert', () => {
      const nodes = [createNode({ cpu: { total: 8000, used: 6000, percent: 75 } })];
      const services: ServiceMetrics[] = [];

      const alerts = alertsService.generateAlerts(nodes, services);

      expect(alerts.length).toBe(1);
      expect(alerts[0].severity).toBe(AlertSeverity.WARNING);
      expect(alerts[0].title).toContain('CPU warning');
    });

    it('should generate CPU critical alert', () => {
      const nodes = [createNode({ cpu: { total: 8000, used: 7500, percent: 95 } })];
      const services: ServiceMetrics[] = [];

      const alerts = alertsService.generateAlerts(nodes, services);

      expect(alerts.length).toBe(1);
      expect(alerts[0].severity).toBe(AlertSeverity.CRITICAL);
      expect(alerts[0].title).toContain('CPU critical');
    });

    it('should generate memory warning alert', () => {
      const nodes = [createNode({
        memory: { total: 16 * 1024 * 1024 * 1024, used: 14 * 1024 * 1024 * 1024, percent: 87 },
      })];
      const services: ServiceMetrics[] = [];

      const alerts = alertsService.generateAlerts(nodes, services);

      expect(alerts.length).toBe(1);
      expect(alerts[0].severity).toBe(AlertSeverity.WARNING);
      expect(alerts[0].title).toContain('memory warning');
    });

    it('should generate restart warning alert', () => {
      const nodes: NodeMetrics[] = [];
      const services = [createService({ restarts: 5 })];

      const alerts = alertsService.generateAlerts(nodes, services);

      expect(alerts.length).toBe(1);
      expect(alerts[0].severity).toBe(AlertSeverity.WARNING);
      expect(alerts[0].title).toContain('restarts');
    });

    it('should generate crash loop critical alert', () => {
      const nodes: NodeMetrics[] = [];
      const services = [createService({ status: PodStatus.CRASH_LOOP })];

      const alerts = alertsService.generateAlerts(nodes, services);

      const crashLoopAlert = alerts.find((a) => a.title.includes('crash looping'));
      expect(crashLoopAlert).toBeDefined();
      expect(crashLoopAlert?.severity).toBe(AlertSeverity.CRITICAL);
    });

    it('should generate replicas unavailable alert', () => {
      const nodes: NodeMetrics[] = [];
      const services = [createService({
        replicas: { desired: 3, ready: 1, available: 1 },
      })];

      const alerts = alertsService.generateAlerts(nodes, services);

      expect(alerts.some((a) => a.title.includes('replicas unavailable'))).toBe(true);
    });

    it('should generate critical alert when all replicas are down', () => {
      const nodes: NodeMetrics[] = [];
      const services = [createService({
        replicas: { desired: 3, ready: 0, available: 0 },
      })];

      const alerts = alertsService.generateAlerts(nodes, services);

      const replicaAlert = alerts.find((a) => a.title.includes('replicas unavailable'));
      expect(replicaAlert?.severity).toBe(AlertSeverity.CRITICAL);
    });

    it('should generate failed pods alert', () => {
      const nodes = [createNode({
        pods: { total: 10, running: 8, pending: 0, failed: 2 },
      })];
      const services: ServiceMetrics[] = [];

      const alerts = alertsService.generateAlerts(nodes, services);

      expect(alerts.some((a) => a.title.includes('Failed pods'))).toBe(true);
    });
  });

  describe('acknowledgeAlert', () => {
    it('should mark alert as acknowledged', () => {
      const nodes = [
        {
          name: 'test-node',
          ip: '192.168.1.10',
          roles: [MachineRole.WORKER],
          health: NodeHealth.HEALTHY,
          cpu: { total: 8000, used: 7500, percent: 95 },
          memory: { total: 16 * 1024 * 1024 * 1024, used: 4 * 1024 * 1024 * 1024, percent: 25 },
          pods: { total: 10, running: 10, pending: 0, failed: 0 },
          conditions: [{ type: 'Ready', status: 'True' as const }],
          lastUpdated: new Date().toISOString(),
        },
      ];

      // Generate initial alerts
      let alerts = alertsService.generateAlerts(nodes, []);
      expect(alerts[0].acknowledged).toBe(false);

      // Acknowledge the alert
      alertsService.acknowledgeAlert(alerts[0].id);

      // Regenerate alerts
      alerts = alertsService.generateAlerts(nodes, []);
      expect(alerts[0].acknowledged).toBe(true);
    });
  });

  describe('getAlertCounts', () => {
    it('should count alerts correctly', () => {
      const alerts = [
        { id: '1', severity: AlertSeverity.CRITICAL, title: 'Test', message: '', source: '', timestamp: '', acknowledged: false },
        { id: '2', severity: AlertSeverity.CRITICAL, title: 'Test', message: '', source: '', timestamp: '', acknowledged: true },
        { id: '3', severity: AlertSeverity.WARNING, title: 'Test', message: '', source: '', timestamp: '', acknowledged: false },
        { id: '4', severity: AlertSeverity.INFO, title: 'Test', message: '', source: '', timestamp: '', acknowledged: false },
      ];

      const counts = alertsService.getAlertCounts(alerts);

      expect(counts.total).toBe(4);
      expect(counts.critical).toBe(2);
      expect(counts.warning).toBe(1);
      expect(counts.info).toBe(1);
      expect(counts.unacknowledged).toBe(3);
    });
  });

  describe('filterAlerts', () => {
    const alerts = [
      { id: '1', severity: AlertSeverity.CRITICAL, title: 'Test', message: '', source: 'node-1', timestamp: '', acknowledged: false },
      { id: '2', severity: AlertSeverity.WARNING, title: 'Test', message: '', source: 'node-1', timestamp: '', acknowledged: true },
      { id: '3', severity: AlertSeverity.WARNING, title: 'Test', message: '', source: 'node-2', timestamp: '', acknowledged: false },
    ];

    it('should filter by severity', () => {
      const filtered = alertsService.filterAlerts(alerts, { severity: AlertSeverity.WARNING });
      expect(filtered.length).toBe(2);
    });

    it('should filter by source', () => {
      const filtered = alertsService.filterAlerts(alerts, { source: 'node-1' });
      expect(filtered.length).toBe(2);
    });

    it('should filter by acknowledged status', () => {
      const filtered = alertsService.filterAlerts(alerts, { acknowledged: false });
      expect(filtered.length).toBe(2);
    });

    it('should combine filters', () => {
      const filtered = alertsService.filterAlerts(alerts, {
        severity: AlertSeverity.WARNING,
        acknowledged: false,
      });
      expect(filtered.length).toBe(1);
      expect(filtered[0].source).toBe('node-2');
    });
  });

  describe('sortBySeverity', () => {
    it('should sort alerts with critical first', () => {
      const alerts = [
        { id: '1', severity: AlertSeverity.INFO, title: 'Info', message: '', source: '', timestamp: '', acknowledged: false },
        { id: '2', severity: AlertSeverity.CRITICAL, title: 'Critical', message: '', source: '', timestamp: '', acknowledged: false },
        { id: '3', severity: AlertSeverity.WARNING, title: 'Warning', message: '', source: '', timestamp: '', acknowledged: false },
      ];

      const sorted = alertsService.sortBySeverity(alerts);

      expect(sorted[0].severity).toBe(AlertSeverity.CRITICAL);
      expect(sorted[1].severity).toBe(AlertSeverity.WARNING);
      expect(sorted[2].severity).toBe(AlertSeverity.INFO);
    });
  });
});
