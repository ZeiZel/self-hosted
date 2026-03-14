import { describe, test, expect } from 'bun:test';
import {
  NodeHealth,
  PodStatus,
  AlertSeverity,
  TuiPanel,
  PanelFocusMode,
  DEFAULT_ALERT_THRESHOLDS,
  calculateHealth,
  formatBytes,
  formatCpu,
  createProgressBar,
  getStatusColor,
  getHealthColor,
  parseAge,
  monitorOptionsSchema,
  KEYBOARD_SHORTCUTS,
} from '../../../interfaces/monitor.interface';

describe('monitor interface', () => {
  describe('enums', () => {
    test('NodeHealth has expected values', () => {
      expect(NodeHealth.HEALTHY).toBe('healthy' as NodeHealth);
      expect(NodeHealth.WARNING).toBe('warning' as NodeHealth);
      expect(NodeHealth.CRITICAL).toBe('critical' as NodeHealth);
      expect(NodeHealth.UNKNOWN).toBe('unknown' as NodeHealth);
    });

    test('PodStatus has expected values', () => {
      expect(PodStatus.RUNNING).toBe('Running' as PodStatus);
      expect(PodStatus.PENDING).toBe('Pending' as PodStatus);
      expect(PodStatus.FAILED).toBe('Failed' as PodStatus);
      expect(PodStatus.CRASH_LOOP).toBe('CrashLoopBackOff' as PodStatus);
      expect(PodStatus.IMAGE_PULL).toBe('ImagePullBackOff' as PodStatus);
    });

    test('AlertSeverity has expected values', () => {
      expect(AlertSeverity.INFO).toBe('info' as AlertSeverity);
      expect(AlertSeverity.WARNING).toBe('warning' as AlertSeverity);
      expect(AlertSeverity.CRITICAL).toBe('critical' as AlertSeverity);
    });

    test('TuiPanel has expected values', () => {
      expect(TuiPanel.NODES).toBe('nodes' as TuiPanel);
      expect(TuiPanel.SERVICES).toBe('services' as TuiPanel);
      expect(TuiPanel.SUMMARY).toBe('summary' as TuiPanel);
      expect(TuiPanel.ALERTS).toBe('alerts' as TuiPanel);
    });

    test('PanelFocusMode has expected values', () => {
      expect(PanelFocusMode.COMPACT).toBe('compact' as PanelFocusMode);
      expect(PanelFocusMode.EXPANDED).toBe('expanded' as PanelFocusMode);
    });
  });

  describe('DEFAULT_ALERT_THRESHOLDS', () => {
    test('has CPU thresholds', () => {
      expect(DEFAULT_ALERT_THRESHOLDS.cpu.warning).toBe(75);
      expect(DEFAULT_ALERT_THRESHOLDS.cpu.critical).toBe(90);
    });

    test('has memory thresholds', () => {
      expect(DEFAULT_ALERT_THRESHOLDS.memory.warning).toBe(80);
      expect(DEFAULT_ALERT_THRESHOLDS.memory.critical).toBe(95);
    });

    test('has restart thresholds', () => {
      expect(DEFAULT_ALERT_THRESHOLDS.restarts.warning).toBe(3);
      expect(DEFAULT_ALERT_THRESHOLDS.restarts.critical).toBe(10);
    });

    test('has pending pods thresholds', () => {
      expect(DEFAULT_ALERT_THRESHOLDS.pendingPods.warning).toBe(60);
      expect(DEFAULT_ALERT_THRESHOLDS.pendingPods.critical).toBe(300);
    });
  });

  describe('calculateHealth', () => {
    test('returns HEALTHY for low usage', () => {
      expect(calculateHealth(30, 40)).toBe(NodeHealth.HEALTHY);
      expect(calculateHealth(0, 0)).toBe(NodeHealth.HEALTHY);
      expect(calculateHealth(74, 79)).toBe(NodeHealth.HEALTHY);
    });

    test('returns WARNING for medium usage', () => {
      expect(calculateHealth(75, 40)).toBe(NodeHealth.WARNING);
      expect(calculateHealth(40, 80)).toBe(NodeHealth.WARNING);
      expect(calculateHealth(75, 80)).toBe(NodeHealth.WARNING);
    });

    test('returns CRITICAL for high CPU', () => {
      expect(calculateHealth(90, 40)).toBe(NodeHealth.CRITICAL);
      expect(calculateHealth(95, 40)).toBe(NodeHealth.CRITICAL);
    });

    test('returns CRITICAL for high memory', () => {
      expect(calculateHealth(40, 95)).toBe(NodeHealth.CRITICAL);
      expect(calculateHealth(40, 99)).toBe(NodeHealth.CRITICAL);
    });

    test('CRITICAL takes precedence over WARNING', () => {
      expect(calculateHealth(75, 95)).toBe(NodeHealth.CRITICAL);
      expect(calculateHealth(90, 80)).toBe(NodeHealth.CRITICAL);
    });

    test('respects custom thresholds', () => {
      const customThresholds = {
        ...DEFAULT_ALERT_THRESHOLDS,
        cpu: { warning: 50, critical: 80 },
      };

      expect(calculateHealth(55, 40, customThresholds)).toBe(NodeHealth.WARNING);
      expect(calculateHealth(85, 40, customThresholds)).toBe(NodeHealth.CRITICAL);
    });
  });

  describe('formatBytes', () => {
    test('formats 0 bytes', () => {
      expect(formatBytes(0)).toBe('0 B');
    });

    test('formats bytes', () => {
      expect(formatBytes(512)).toContain('512');
      expect(formatBytes(512)).toContain('B');
    });

    test('formats KiB', () => {
      expect(formatBytes(1024)).toBe('1 Ki');
      expect(formatBytes(2048)).toBe('2 Ki');
      expect(formatBytes(1536)).toBe('1.5 Ki');
    });

    test('formats MiB', () => {
      expect(formatBytes(1024 * 1024)).toBe('1 Mi');
      expect(formatBytes(512 * 1024 * 1024)).toBe('512 Mi');
    });

    test('formats GiB', () => {
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1 Gi');
      expect(formatBytes(16 * 1024 * 1024 * 1024)).toBe('16 Gi');
    });

    test('formats TiB', () => {
      expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe('1 Ti');
    });
  });

  describe('formatCpu', () => {
    test('formats millicores below 1000', () => {
      expect(formatCpu(100)).toBe('100m');
      expect(formatCpu(500)).toBe('500m');
      expect(formatCpu(999)).toBe('999m');
    });

    test('formats whole cores', () => {
      expect(formatCpu(1000)).toBe('1.0');
      expect(formatCpu(2000)).toBe('2.0');
      expect(formatCpu(4000)).toBe('4.0');
    });

    test('formats fractional cores', () => {
      expect(formatCpu(1500)).toBe('1.5');
      expect(formatCpu(2500)).toBe('2.5');
      expect(formatCpu(3750)).toBe('3.8');
    });
  });

  describe('createProgressBar', () => {
    test('creates empty bar at 0%', () => {
      const bar = createProgressBar(0, 10);
      expect(bar).toBe('[░░░░░░░░░░]');
    });

    test('creates full bar at 100%', () => {
      const bar = createProgressBar(100, 10);
      expect(bar).toBe('[██████████]');
    });

    test('creates half-filled bar at 50%', () => {
      const bar = createProgressBar(50, 10);
      expect(bar).toBe('[█████░░░░░]');
    });

    test('respects custom width', () => {
      const bar = createProgressBar(50, 20);
      expect(bar.length).toBe(22); // 20 chars + 2 brackets
      expect(bar).toContain('██████████');
      expect(bar).toContain('░░░░░░░░░░');
    });

    test('rounds correctly', () => {
      const bar = createProgressBar(25, 10);
      expect(bar).toContain('███');
    });
  });

  describe('getStatusColor', () => {
    test('returns green for running/succeeded', () => {
      expect(getStatusColor(PodStatus.RUNNING)).toBe('green');
      expect(getStatusColor(PodStatus.SUCCEEDED)).toBe('green');
    });

    test('returns yellow for pending', () => {
      expect(getStatusColor(PodStatus.PENDING)).toBe('yellow');
    });

    test('returns red for failed states', () => {
      expect(getStatusColor(PodStatus.FAILED)).toBe('red');
      expect(getStatusColor(PodStatus.CRASH_LOOP)).toBe('red');
      expect(getStatusColor(PodStatus.IMAGE_PULL)).toBe('red');
      expect(getStatusColor(PodStatus.ERROR)).toBe('red');
    });

    test('returns gray for unknown states', () => {
      expect(getStatusColor(PodStatus.UNKNOWN)).toBe('gray');
    });
  });

  describe('getHealthColor', () => {
    test('returns green for healthy', () => {
      expect(getHealthColor(NodeHealth.HEALTHY)).toBe('green');
    });

    test('returns yellow for warning', () => {
      expect(getHealthColor(NodeHealth.WARNING)).toBe('yellow');
    });

    test('returns red for critical', () => {
      expect(getHealthColor(NodeHealth.CRITICAL)).toBe('red');
    });

    test('returns gray for unknown', () => {
      expect(getHealthColor(NodeHealth.UNKNOWN)).toBe('gray');
    });
  });

  describe('parseAge', () => {
    test('parses days', () => {
      expect(parseAge('1d')).toBe(86400);
      expect(parseAge('5d')).toBe(5 * 86400);
      expect(parseAge('30d')).toBe(30 * 86400);
    });

    test('parses hours', () => {
      expect(parseAge('1h')).toBe(3600);
      expect(parseAge('12h')).toBe(12 * 3600);
      expect(parseAge('24h')).toBe(24 * 3600);
    });

    test('parses minutes', () => {
      expect(parseAge('1m')).toBe(60);
      expect(parseAge('30m')).toBe(30 * 60);
      expect(parseAge('60m')).toBe(60 * 60);
    });

    test('parses seconds', () => {
      expect(parseAge('1s')).toBe(1);
      expect(parseAge('30s')).toBe(30);
      expect(parseAge('300s')).toBe(300);
    });

    test('returns 0 for invalid format', () => {
      expect(parseAge('')).toBe(0);
      expect(parseAge('invalid')).toBe(0);
      expect(parseAge('5x')).toBe(0);
    });
  });

  describe('monitorOptionsSchema', () => {
    test('accepts valid options', () => {
      const result = monitorOptionsSchema.safeParse({
        refreshInterval: 5,
        headless: false,
        showAlerts: true,
      });
      expect(result.success).toBe(true);
    });

    test('applies defaults', () => {
      const result = monitorOptionsSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.refreshInterval).toBe(5);
        expect(result.data.headless).toBe(false);
        expect(result.data.showAlerts).toBe(true);
        expect(result.data.alertThresholds).toEqual(DEFAULT_ALERT_THRESHOLDS);
      }
    });

    test('validates refresh interval range', () => {
      expect(monitorOptionsSchema.safeParse({ refreshInterval: 0 }).success).toBe(false);
      expect(monitorOptionsSchema.safeParse({ refreshInterval: 61 }).success).toBe(false);
      expect(monitorOptionsSchema.safeParse({ refreshInterval: 1 }).success).toBe(true);
      expect(monitorOptionsSchema.safeParse({ refreshInterval: 60 }).success).toBe(true);
    });

    test('validates alert threshold percentages', () => {
      expect(
        monitorOptionsSchema.safeParse({
          alertThresholds: {
            ...DEFAULT_ALERT_THRESHOLDS,
            cpu: { warning: 101, critical: 90 },
          },
        }).success,
      ).toBe(false);

      expect(
        monitorOptionsSchema.safeParse({
          alertThresholds: {
            ...DEFAULT_ALERT_THRESHOLDS,
            memory: { warning: -1, critical: 90 },
          },
        }).success,
      ).toBe(false);
    });

    test('accepts optional namespace filter', () => {
      const result = monitorOptionsSchema.safeParse({
        filterNamespace: 'kube-system',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.filterNamespace).toBe('kube-system');
      }
    });

    test('accepts optional node filter', () => {
      const result = monitorOptionsSchema.safeParse({
        filterNode: 'master-01',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.filterNode).toBe('master-01');
      }
    });
  });

  describe('KEYBOARD_SHORTCUTS', () => {
    test('has quit shortcut', () => {
      expect(KEYBOARD_SHORTCUTS['q, Ctrl+C']).toBe('Quit');
    });

    test('has refresh shortcut', () => {
      expect(KEYBOARD_SHORTCUTS['r']).toBe('Refresh metrics');
    });

    test('has help shortcut', () => {
      expect(KEYBOARD_SHORTCUTS['?']).toBe('Toggle help');
    });

    test('has navigation shortcuts', () => {
      expect(KEYBOARD_SHORTCUTS['Tab']).toBeDefined();
      expect(KEYBOARD_SHORTCUTS['h/j/k/l']).toBeDefined();
      expect(KEYBOARD_SHORTCUTS['↑/↓ or j/k']).toBeDefined();
    });
  });
});
