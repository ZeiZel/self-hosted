import { z } from 'zod';
import { MachineRole } from './machine.interface';

/**
 * Node health status
 */
export enum NodeHealth {
  HEALTHY = 'healthy',
  WARNING = 'warning',
  CRITICAL = 'critical',
  UNKNOWN = 'unknown',
}

/**
 * Pod/service status
 */
export enum PodStatus {
  RUNNING = 'Running',
  PENDING = 'Pending',
  SUCCEEDED = 'Succeeded',
  FAILED = 'Failed',
  UNKNOWN = 'Unknown',
  TERMINATING = 'Terminating',
  CRASH_LOOP = 'CrashLoopBackOff',
  IMAGE_PULL = 'ImagePullBackOff',
  ERROR = 'Error',
}

/**
 * Real-time node metrics
 */
export interface NodeMetrics {
  name: string;
  ip: string;
  roles: MachineRole[];
  health: NodeHealth;
  cpu: {
    total: number; // millicores
    used: number; // millicores
    percent: number;
  };
  memory: {
    total: number; // bytes
    used: number; // bytes
    percent: number;
  };
  pods: {
    total: number;
    running: number;
    pending: number;
    failed: number;
  };
  conditions: NodeCondition[];
  lastUpdated: string;
}

/**
 * Node condition from Kubernetes
 */
export interface NodeCondition {
  type: string;
  status: 'True' | 'False' | 'Unknown';
  reason?: string;
  message?: string;
}

/**
 * Service/pod metrics
 */
export interface ServiceMetrics {
  name: string;
  namespace: string;
  node: string;
  status: PodStatus;
  health: NodeHealth;
  replicas: {
    desired: number;
    ready: number;
    available: number;
  };
  cpu: {
    requested: number;
    limit: number;
    used: number;
  };
  memory: {
    requested: number;
    limit: number;
    used: number;
  };
  restarts: number;
  age: string;
  lastUpdated: string;
}

/**
 * Cluster summary metrics
 */
export interface ClusterSummary {
  nodes: {
    total: number;
    healthy: number;
    warning: number;
    critical: number;
  };
  pods: {
    total: number;
    running: number;
    pending: number;
    failed: number;
  };
  cpu: {
    total: number;
    used: number;
    percent: number;
  };
  memory: {
    total: number;
    used: number;
    percent: number;
  };
  namespaces: number;
  lastUpdated: string;
}

/**
 * Alert severity levels
 */
export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

/**
 * Alert definition
 */
export interface Alert {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  source: string; // node or service name
  timestamp: string;
  acknowledged: boolean;
}

/**
 * Alert thresholds configuration
 */
export interface AlertThresholds {
  cpu: {
    warning: number; // percentage
    critical: number;
  };
  memory: {
    warning: number;
    critical: number;
  };
  restarts: {
    warning: number; // count
    critical: number;
  };
  pendingPods: {
    warning: number; // duration in seconds
    critical: number;
  };
}

/**
 * Default alert thresholds
 */
export const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  cpu: {
    warning: 75,
    critical: 90,
  },
  memory: {
    warning: 80,
    critical: 95,
  },
  restarts: {
    warning: 3,
    critical: 10,
  },
  pendingPods: {
    warning: 60,
    critical: 300,
  },
};

/**
 * Monitor options
 */
export interface MonitorOptions {
  refreshInterval: number; // seconds
  headless: boolean; // JSON output instead of TUI
  showAlerts: boolean;
  alertThresholds: AlertThresholds;
  filterNamespace?: string;
  filterNode?: string;
}

/**
 * TUI panel types
 */
export enum TuiPanel {
  NODES = 'nodes',
  SERVICES = 'services',
  SUMMARY = 'summary',
  ALERTS = 'alerts',
  MIGRATION = 'migration',
  SETTINGS = 'settings',
}

/**
 * TUI state
 */
export interface TuiState {
  activePanel: TuiPanel;
  selectedNode?: string;
  selectedService?: string;
  scrollOffset: number;
  showHelp: boolean;
  showMigration: boolean;
}

/**
 * Keyboard shortcuts
 */
export const KEYBOARD_SHORTCUTS: Record<string, string> = {
  q: 'Quit',
  r: 'Refresh',
  h: 'Toggle help',
  Tab: 'Switch panel',
  'Up/Down': 'Navigate',
  Enter: 'Select/Migrate',
  Esc: 'Cancel',
  '1-5': 'Quick select node',
  n: 'Nodes panel',
  s: 'Services panel',
  a: 'Alerts panel',
  m: 'Migration panel',
  g: 'Settings panel',
};

/**
 * Cluster state snapshot
 */
export interface ClusterState {
  summary: ClusterSummary;
  nodes: NodeMetrics[];
  services: ServiceMetrics[];
  alerts: Alert[];
  timestamp: string;
}

/**
 * Migration request from TUI
 */
export interface MigrationRequest {
  service: string;
  namespace: string;
  sourceNode: string;
  targetNode: string;
  force: boolean;
}

/**
 * Zod schemas
 */
export const monitorOptionsSchema = z.object({
  refreshInterval: z.number().int().min(1).max(60).default(5),
  headless: z.boolean().default(false),
  showAlerts: z.boolean().default(true),
  alertThresholds: z
    .object({
      cpu: z.object({
        warning: z.number().min(0).max(100),
        critical: z.number().min(0).max(100),
      }),
      memory: z.object({
        warning: z.number().min(0).max(100),
        critical: z.number().min(0).max(100),
      }),
      restarts: z.object({
        warning: z.number().int().min(0),
        critical: z.number().int().min(0),
      }),
      pendingPods: z.object({
        warning: z.number().int().min(0),
        critical: z.number().int().min(0),
      }),
    })
    .default(DEFAULT_ALERT_THRESHOLDS),
  filterNamespace: z.string().optional(),
  filterNode: z.string().optional(),
});

/**
 * Helper functions
 */

/**
 * Determine health from CPU/memory usage
 */
export function calculateHealth(
  cpuPercent: number,
  memoryPercent: number,
  thresholds: AlertThresholds = DEFAULT_ALERT_THRESHOLDS,
): NodeHealth {
  if (cpuPercent >= thresholds.cpu.critical || memoryPercent >= thresholds.memory.critical) {
    return NodeHealth.CRITICAL;
  }
  if (cpuPercent >= thresholds.cpu.warning || memoryPercent >= thresholds.memory.warning) {
    return NodeHealth.WARNING;
  }
  return NodeHealth.HEALTHY;
}

/**
 * Format bytes to human-readable
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'Ki', 'Mi', 'Gi', 'Ti'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Format millicores to human-readable
 */
export function formatCpu(millicores: number): string {
  if (millicores >= 1000) {
    return `${(millicores / 1000).toFixed(1)}`;
  }
  return `${millicores}m`;
}

/**
 * Create progress bar string
 */
export function createProgressBar(percent: number, width: number = 10): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

/**
 * Get status color hint
 */
export function getStatusColor(status: PodStatus): 'green' | 'yellow' | 'red' | 'gray' {
  switch (status) {
    case PodStatus.RUNNING:
    case PodStatus.SUCCEEDED:
      return 'green';
    case PodStatus.PENDING:
      return 'yellow';
    case PodStatus.FAILED:
    case PodStatus.CRASH_LOOP:
    case PodStatus.IMAGE_PULL:
    case PodStatus.ERROR:
      return 'red';
    default:
      return 'gray';
  }
}

/**
 * Get health color hint
 */
export function getHealthColor(health: NodeHealth): 'green' | 'yellow' | 'red' | 'gray' {
  switch (health) {
    case NodeHealth.HEALTHY:
      return 'green';
    case NodeHealth.WARNING:
      return 'yellow';
    case NodeHealth.CRITICAL:
      return 'red';
    default:
      return 'gray';
  }
}

/**
 * Parse Kubernetes resource age string
 */
export function parseAge(ageString: string): number {
  // Parses strings like "5d", "2h", "30m", "10s"
  const match = ageString.match(/(\d+)([dhms])/);
  if (!match) return 0;

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'd':
      return value * 86400;
    case 'h':
      return value * 3600;
    case 'm':
      return value * 60;
    case 's':
      return value;
    default:
      return 0;
  }
}
