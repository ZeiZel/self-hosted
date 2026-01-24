#!/bin/bash
# Vault Setup Script for Coder
# This script configures Vault for use with Coder

set -e

echo "=== Coder Vault Setup ==="

# Check if VAULT_ADDR is set
if [ -z "$VAULT_ADDR" ]; then
  echo "Error: VAULT_ADDR is not set"
  echo "Example: export VAULT_ADDR=https://vault.zeizel.localhost"
  exit 1
fi

# Check if logged in
if ! vault token lookup > /dev/null 2>&1; then
  echo "Error: Not logged into Vault"
  echo "Please run: vault login"
  exit 1
fi

echo "✓ Connected to Vault at $VAULT_ADDR"

# Create Coder policy
echo ""
echo "Creating Coder policy..."
vault policy write coder - <<EOF
# Read coder secrets
path "secret/data/coder/*" {
  capabilities = ["read", "list"]
}

# Read coder metadata
path "secret/metadata/coder/*" {
  capabilities = ["read", "list"]
}

# Allow token lookup
path "auth/token/lookup-self" {
  capabilities = ["read"]
}

# Allow token renewal
path "auth/token/renew-self" {
  capabilities = ["update"]
}
EOF

echo "✓ Coder policy created"

# Enable Kubernetes auth if not already enabled
if ! vault auth list | grep -q "kubernetes/"; then
  echo ""
  echo "Enabling Kubernetes auth method..."
  vault auth enable kubernetes
  echo "✓ Kubernetes auth enabled"
else
  echo "✓ Kubernetes auth already enabled"
fi

# Configure Kubernetes auth
echo ""
echo "Configuring Kubernetes auth..."

# Get Kubernetes API address
K8S_HOST=$(kubectl config view --minify --output jsonpath='{.clusters[0].cluster.server}')

# Get ServiceAccount token and CA cert from Kubernetes
SA_TOKEN=$(kubectl get secret -n code $(kubectl get serviceaccount -n code coder -o jsonpath='{.secrets[0].name}' 2>/dev/null || echo "coder-token") -o jsonpath='{.data.token}' 2>/dev/null | base64 -d || echo "")
SA_CA_CERT=$(kubectl config view --raw --minify --flatten --output jsonpath='{.clusters[0].cluster.certificate-authority-data}' | base64 -d)

if [ -z "$SA_TOKEN" ]; then
  echo "⚠ ServiceAccount token not found. This is normal if Coder is not yet deployed."
  echo "  You can run this script again after deploying Coder."
else
  vault write auth/kubernetes/config \
    kubernetes_host="$K8S_HOST" \
    kubernetes_ca_cert="$SA_CA_CERT" \
    token_reviewer_jwt="$SA_TOKEN"
  
  echo "✓ Kubernetes auth configured"
fi

# Create Kubernetes auth role for Coder
echo ""
echo "Creating Kubernetes auth role for Coder..."
vault write auth/kubernetes/role/coder \
  bound_service_account_names=coder \
  bound_service_account_namespaces=code \
  policies=coder \
  ttl=24h

echo "✓ Kubernetes auth role created"

# Create sample secrets
echo ""
echo "Creating sample secrets structure..."
vault kv put secret/coder/secrets \
  postgres_password="changeme-postgres" \
  oidc_client_secret="changeme-oidc" \
  gitlab_client_secret="changeme-gitlab" \
  provisioner_psk="$(openssl rand -base64 32)"

echo "✓ Sample secrets created"

echo ""
echo "=== Vault Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Update the secrets in Vault with actual values:"
echo "   vault kv put secret/coder/secrets \\"
echo "     postgres_password='<actual-password>' \\"
echo "     oidc_client_secret='<authentik-secret>' \\"
echo "     gitlab_client_secret='<gitlab-secret>'"
echo ""
echo "2. Enable Vault in Coder release (kubernetes/releases/coder.yaml.gotmpl):"
echo "   vault:"
echo "     enabled: true"
echo ""
echo "3. Deploy Coder:"
echo "   cd kubernetes && helmfile -e k8s sync -l name=coder"
echo ""
