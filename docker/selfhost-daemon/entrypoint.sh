#!/bin/sh
set -e

echo "========================================"
echo "Selfhost Daemon"
echo "========================================"
echo "Check interval: ${CHECK_INTERVAL:-60}s"
echo "Data directory: ${DATA_DIR:-/data}"
echo "Retention days: ${RETENTION_DAYS:-7}"
echo "========================================"

# Verify kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "ERROR: kubectl not found in PATH"
    exit 1
fi

# Check cluster connectivity
if ! kubectl cluster-info > /dev/null 2>&1; then
    echo "WARNING: Cannot connect to Kubernetes cluster"
    echo "Ensure kubeconfig is mounted correctly at /root/.kube/config"
    echo "The daemon will retry on each health check"
fi

# Start the daemon
echo "Starting daemon..."
exec bun run src/daemon/daemon.runner.ts
