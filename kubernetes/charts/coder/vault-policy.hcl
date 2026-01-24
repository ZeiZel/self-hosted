# Vault Policy for Coder
# This policy allows Coder to read secrets from Vault

# Read coder secrets
path "secret/data/coder/*" {
  capabilities = ["read", "list"]
}

# Read coder metadata
path "secret/metadata/coder/*" {
  capabilities = ["read", "list"]
}

# Allow token lookup (for validation)
path "auth/token/lookup-self" {
  capabilities = ["read"]
}

# Allow token renewal
path "auth/token/renew-self" {
  capabilities = ["update"]
}
