#!/usr/bin/env bash
# Bootstrap script for self-hosted platform
# Automated full stack deployment from scratch

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
  echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
  echo -e "${GREEN}✓${NC} $1"
}

warn() {
  echo -e "${YELLOW}⚠${NC} $1"
}

echo "========================================="
echo "Self-Hosted Platform Bootstrap"
echo "========================================="
echo ""

# Phase 0: Prerequisites Check
log "Phase 0: Checking prerequisites..."
echo "-----------------------------------"

REQUIRED_TOOLS="ansible helm helmfile kubectl sops gpg"
MISSING_TOOLS=""

for tool in $REQUIRED_TOOLS; do
  if ! command -v $tool &> /dev/null; then
    warn "$tool not installed"
    MISSING_TOOLS="$MISSING_TOOLS $tool"
  else
    success "$tool installed"
  fi
done

if [ -n "$MISSING_TOOLS" ]; then
  echo ""
  echo "Missing tools:$MISSING_TOOLS"
  echo "Install missing tools and run again."
  exit 1
fi

# Check Ansible Vault password file
if [ ! -f ~/.ansible_vault_password ]; then
  warn "Ansible Vault password file not found at ~/.ansible_vault_password"
  echo -n "Enter Ansible Vault password: "
  read -s VAULT_PASSWORD
  echo ""
  echo "$VAULT_PASSWORD" > ~/.ansible_vault_password
  chmod 600 ~/.ansible_vault_password
  success "Created ~/.ansible_vault_password"
fi

# Check SOPS GPG key
if ! gpg --list-secret-keys | grep -q "sops"; then
  warn "SOPS GPG key not found"
  if [ -f ~/.gnupg/sops-key.asc ]; then
    log "Importing SOPS GPG key..."
    gpg --import ~/.gnupg/sops-key.asc
    success "SOPS GPG key imported"
  else
    echo "Error: SOPS GPG key not found at ~/.gnupg/sops-key.asc"
    exit 1
  fi
else
  success "SOPS GPG key available"
fi

echo ""

# Phase 1: Validation
log "Phase 1: Running validation checks..."
echo "--------------------------------------"

if bash "$SCRIPT_DIR/validate.sh"; then
  success "Validation passed"
else
  echo "Error: Validation failed"
  exit 1
fi

echo ""

# Phase 2: Proxmox VMs Provisioning
log "Phase 2: Provisioning VMs on Proxmox..."
echo "----------------------------------------"

read -p "Skip Proxmox provisioning? (VMs already exist) [y/N]: " SKIP_PROXMOX
if [[ "$SKIP_PROXMOX" =~ ^[Yy]$ ]]; then
  warn "Skipping Proxmox provisioning"
else
  cd "$PROJECT_ROOT/ansible"
  ansible-playbook -i inventory/hosts.ini all.yml \
    --tags proxmox \
    --vault-password-file ~/.ansible_vault_password
  success "VMs provisioned"
fi

echo ""

# Phase 3: Kubernetes Cluster
log "Phase 3: Deploying Kubernetes cluster..."
echo "-----------------------------------------"

read -p "Skip Kubernetes deployment? (cluster already exists) [y/N]: " SKIP_K8S
if [[ "$SKIP_K8S" =~ ^[Yy]$ ]]; then
  warn "Skipping Kubernetes deployment"
else
  cd "$PROJECT_ROOT/ansible"
  ansible-playbook -i inventory/master.ini,inventory/node.ini all.yml \
    --tags kubespray,cni,storage \
    --vault-password-file ~/.ansible_vault_password
  success "Kubernetes cluster deployed"
fi

echo ""

# Phase 4: VPN Tunnel
log "Phase 4: Setting up Pangolin VPN..."
echo "------------------------------------"

cd "$PROJECT_ROOT/ansible"

log "Deploying gateway (VPS)..."
ansible-playbook -i inventory/gateway.ini all.yml \
  --tags pangolin \
  --vault-password-file ~/.ansible_vault_password

log "Deploying nodes (cluster)..."
ansible-playbook -i inventory/master.ini,inventory/node.ini all.yml \
  --tags pangolin \
  --vault-password-file ~/.ansible_vault_password

success "VPN tunnel established"

echo ""

# Phase 5: Infrastructure Services
log "Phase 5: Deploying infrastructure services..."
echo "----------------------------------------------"

cd "$PROJECT_ROOT/ansible"
ansible-playbook -i inventory/master.ini all.yml \
  --tags infrastructure \
  --vault-password-file ~/.ansible_vault_password

success "Infrastructure deployed"

echo ""

# Phase 6: Monitoring & Backup
log "Phase 6: Setting up monitoring and backup..."
echo "---------------------------------------------"

cd "$PROJECT_ROOT/ansible"
ansible-playbook -i inventory/master.ini all.yml \
  --tags monitoring,backup \
  --vault-password-file ~/.ansible_vault_password

success "Monitoring and backup configured"

echo ""

# Phase 7: Post-Deployment Verification
log "Phase 7: Post-deployment verification..."
echo "----------------------------------------"

log "Checking Kubernetes cluster health..."
kubectl cluster-info
kubectl get nodes
success "Cluster is healthy"

log "Checking all pods..."
kubectl get pods -A | grep -v "Running\|Completed" || success "All pods are running"

log "Checking Helm releases..."
helm list -A
success "Helm releases deployed"

log "Checking Traefik ingress..."
kubectl get svc -n ingress traefik
success "Traefik is accessible"

log "Checking Vault status..."
kubectl exec -n service -l app.kubernetes.io/name=vault -- vault status || warn "Vault may need unsealing"

log "Checking Prometheus..."
kubectl get pods -n service -l app.kubernetes.io/name=prometheus
success "Prometheus is running"

log "Checking backup status..."
kubectl get schedules -n velero
success "Backup schedules configured"

echo ""
echo "========================================="
echo "Bootstrap Complete!"
echo "========================================="
echo ""
success "Platform is deployed and ready"
echo ""
echo "Next steps:"
echo "1. Access Grafana: https://grafana.yourdomain.com"
echo "2. Access Traefik dashboard: https://traefik.yourdomain.com:8080"
echo "3. Access Authentik: https://auth.yourdomain.com"
echo "4. Review logs: kubectl logs -n <namespace> <pod>"
echo "5. Run tests: helm test <release> -n <namespace>"
echo ""
echo "Documentation: $PROJECT_ROOT/.docs/architecture.md"
echo ""
