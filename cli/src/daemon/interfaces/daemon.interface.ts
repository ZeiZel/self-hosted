import { z } from 'zod';
import { NodeHealth } from '../../interfaces/monitor.interface';

/**
 * Daemon check types
 */
export enum DaemonCheckType {
  NODE = 'node',
  SERVICE = 'service',
  API = 'api',
  RESOURCE = 'resource',
}

/**
 * Daemon health status
 */
export enum DaemonHealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  CRITICAL = 'critical',
  UNKNOWN = 'unknown',
}

/**
 * Daemon running state
 */
export enum DaemonState {
  STOPPED = 'stopped',
  RUNNING = 'running',
  STARTING = 'starting',
  STOPPING = 'stopping',
  ERROR = 'error',
}

/**
 * Health log entry
 */
export interface DaemonHealthLog {
  id?: number;
  checkType: DaemonCheckType;
  target: string;
  status: DaemonHealthStatus;
  message?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

/**
 * Daemon state entry
 */
export interface DaemonStateEntry {
  key: string;
  value: string;
  updatedAt: string;
}

/**
 * Daemon configuration
 */
export interface DaemonConfig {
  checkInterval: number; // seconds
  dataDir: string;
  kubeconfig?: string;
  retentionDays: number;
}

/**
 * Default daemon configuration
 */
export const DEFAULT_DAEMON_CONFIG: DaemonConfig = {
  checkInterval: 60,
  dataDir: '~/.selfhosted',
  retentionDays: 7,
};

/**
 * Daemon status response
 */
export interface DaemonStatus {
  state: DaemonState;
  containerId?: string;
  startedAt?: string;
  lastCheck?: string;
  checkInterval: number;
  healthSummary: {
    healthy: number;
    degraded: number;
    critical: number;
    unknown: number;
  };
  recentAlerts: DaemonHealthLog[];
}

/**
 * Health check result from daemon
 */
export interface HealthCheckResult {
  nodes: Array<{
    name: string;
    status: DaemonHealthStatus;
    cpu: number;
    memory: number;
    message?: string;
  }>;
  services: Array<{
    name: string;
    namespace: string;
    status: DaemonHealthStatus;
    restarts: number;
    message?: string;
  }>;
  apis: Array<{
    name: string;
    status: DaemonHealthStatus;
    responseTime?: number;
    message?: string;
  }>;
  timestamp: string;
}

/**
 * Daemon initialization options
 */
export interface DaemonInitOptions {
  checkInterval?: number;
  force?: boolean;
}

/**
 * Docker compose template variables
 */
export interface DockerComposeVars {
  dataDir: string;
  checkInterval: number;
  kubeconfig: string;
  imageName: string;
  imageTag: string;
}

/**
 * Zod schemas
 */
export const daemonConfigSchema = z.object({
  checkInterval: z.number().int().min(10).max(3600).default(60),
  dataDir: z.string().default('~/.selfhosted'),
  kubeconfig: z.string().optional(),
  retentionDays: z.number().int().min(1).max(365).default(7),
});

export const daemonHealthLogSchema = z.object({
  checkType: z.nativeEnum(DaemonCheckType),
  target: z.string(),
  status: z.nativeEnum(DaemonHealthStatus),
  message: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.string(),
});

/**
 * Map node health to daemon health status
 */
export function mapNodeHealthToDaemonStatus(health: NodeHealth): DaemonHealthStatus {
  switch (health) {
    case NodeHealth.HEALTHY:
      return DaemonHealthStatus.HEALTHY;
    case NodeHealth.WARNING:
      return DaemonHealthStatus.DEGRADED;
    case NodeHealth.CRITICAL:
      return DaemonHealthStatus.CRITICAL;
    default:
      return DaemonHealthStatus.UNKNOWN;
  }
}

/**
 * Docker compose template
 */
export const DOCKER_COMPOSE_TEMPLATE = `version: '3.8'

services:
  selfhost-daemon:
    image: {{imageName}}:{{imageTag}}
    container_name: selfhost-daemon
    restart: unless-stopped
    volumes:
      - {{dataDir}}:/data
      - {{kubeconfig}}:/root/.kube/config:ro
    environment:
      - CHECK_INTERVAL={{checkInterval}}
      - DATA_DIR=/data
      - KUBECONFIG=/root/.kube/config
    network_mode: host
    labels:
      - "com.selfhost.service=daemon"
      - "com.selfhost.version=1.0.0"
`;

/**
 * Dockerfile template
 */
export const DOCKERFILE_TEMPLATE = `FROM oven/bun:1.1-alpine

WORKDIR /app

# Copy package files
COPY cli/package.json cli/bun.lock ./
RUN bun install --production

# Copy source
COPY cli/src ./src
COPY cli/tsconfig.json ./

# Create data directory
RUN mkdir -p /data

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \\
  CMD bun run src/daemon/healthcheck.ts || exit 1

# Entry point
ENTRYPOINT ["bun", "run", "src/daemon/daemon.runner.ts"]
`;

/**
 * Entrypoint script template
 */
export const ENTRYPOINT_TEMPLATE = `#!/bin/sh
set -e

echo "Starting selfhost daemon..."
echo "Check interval: \${CHECK_INTERVAL:-60}s"
echo "Data directory: \${DATA_DIR:-/data}"

# Verify kubectl access
if ! kubectl cluster-info > /dev/null 2>&1; then
  echo "WARNING: Cannot connect to Kubernetes cluster"
  echo "Ensure kubeconfig is mounted correctly"
fi

# Start daemon
exec bun run src/daemon/daemon.runner.ts
`;
