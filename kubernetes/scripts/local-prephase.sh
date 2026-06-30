#!/usr/bin/env bash
#
# Local pre-phase verification: install cert-manager then the namespaces chart
# (incl. ClusterIssuers + shared Gateway) on a local cluster (e.g. Docker Desktop
# kubeadm), then verify reconciliation.
#
# IMPORTANT ordering: the namespaces chart renders cert-manager.io CRs, so
# cert-manager (which installs its CRDs) MUST be applied first.
#
# Prereqs: a reachable kube context (kubectl get nodes), helmfile + helm-diff.
#
set -euo pipefail
cd "$(dirname "$0")/.."   # kubernetes/

ctx="$(kubectl config current-context 2>/dev/null || true)"
[ -n "$ctx" ] || { echo "ERROR: no current kube context. Start Docker Desktop Kubernetes and run: kubectl config use-context docker-desktop"; exit 1; }
echo "[i] context: $ctx"
kubectl get nodes

echo "[1/3] installing Gateway API CRDs (standard channel)…"
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.1/standard-install.yaml

echo "[2/3] applying cert-manager (installs its CRDs)…"
helmfile -e k8s apply --selector name=cert-manager
kubectl -n service rollout status deploy/cert-manager --timeout=180s || true

echo "[3/3] applying namespaces (ClusterIssuers + shared Gateway)…"
helmfile -e k8s apply --selector name=namespaces

echo "=== verification ==="
kubectl get ns
kubectl get clusterissuers
kubectl get certificate -A
kubectl get gateway,gatewayclass -A
echo "[ok] pre-phase applied. The selfsigned-ca Certificate should reach Ready;"
echo "     ACME (letsencrypt) issuers will stay pending locally (no public DNS)."
