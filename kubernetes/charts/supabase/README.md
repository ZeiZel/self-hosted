# Supabase Helm Chart

This Helm chart deploys [Supabase](https://supabase.com/) - The open source Firebase alternative - on a Kubernetes cluster.

## Overview

Supabase is a complete backend-as-a-service (BaaS) platform that provides:

- **PostgreSQL Database**: Full-featured SQL database with extensions
- **Authentication**: User management with JWT-based authentication
- **REST API**: Auto-generated REST API using PostgREST
- **Realtime**: WebSocket server for real-time subscriptions
- **Storage**: S3-compatible object storage
- **Edge Functions**: Serverless Deno functions
- **Studio**: Web-based management interface

## Architecture

This chart deploys the following components:

- **Kong Gateway**: API gateway that routes requests to appropriate services
- **GoTrue**: Authentication and user management service
- **PostgREST**: Automatic REST API for PostgreSQL
- **Realtime**: WebSocket server for real-time features
- **Storage API**: Object storage management
- **Meta API**: PostgreSQL metadata API
- **Studio**: Management dashboard UI
- **Edge Runtime**: Deno-based serverless functions
- **ImgProxy**: Image transformation service

## Prerequisites

- Kubernetes 1.19+
- Helm 3.8+
- External PostgreSQL database (v13+)
- External S3-compatible storage (MinIO, AWS S3, etc.)
- External Redis/Valkey (for Realtime subscriptions)

## Deployment Prerequisites

Supabase depends on several infrastructure services that must be deployed **before** installing Supabase:

### Required Services (must be running):

1. **Traefik** (namespace: `ingress`)
   - Ingress controller for routing traffic
   - Required for accessing Supabase API and Studio

2. **Vault** (namespace: `service`)
   - Secret management
   - Stores sensitive credentials

3. **PostgreSQL** (namespace: `db`)
   - Primary database for Supabase
   - Must be v13 or higher
   - Extensions will be installed automatically by init job

4. **MinIO** (namespace: `db`)
   - S3-compatible object storage
   - Used for file storage (avatars, documents, etc.)

5. **Valkey/Redis** (namespace: `db`)
   - Required for Realtime subscriptions
   - Used for pub/sub messaging

### Deployment Order

If deploying from scratch, follow this order:

```bash
# 1. Deploy Traefik
helmfile sync --selector name=traefik

# 2. Deploy Consul (for service discovery)
helmfile sync --selector name=consul

# 3. Deploy Vault (for secrets management)
helmfile sync --selector name=vault

# 4. Deploy databases in namespace db
helmfile sync --selector name=postgres
helmfile sync --selector name=valkey
helmfile sync --selector name=minio

# 5. Finally deploy Supabase
helmfile sync --selector name=supabase
```

**Note**: Using Helmfile with the configuration in `kubernetes/apps/_others.yaml`, dependencies are automatically handled:

```yaml
supabase:
  needs:
    - db/postgres
    - db/minio
    - db/valkey
    - ingress/traefik
    - service/vault
```

## Initial Setup

Before deploying Supabase, you need to prepare secrets and storage:

### 1. Generate JWT Secrets

Supabase requires JWT tokens for authentication. Generate secure secrets:

```bash
# Generate a strong JWT secret (32 characters minimum)
JWT_SECRET=$(openssl rand -base64 32)
echo "JWT Secret: $JWT_SECRET"

# Generate Anon Key (public API key)
# Use https://supabase.com/docs/guides/self-hosting/docker#api-keys
# or any JWT generator with the following payload:
# {
#   "role": "anon",
#   "iss": "supabase",
#   "iat": 1234567890,
#   "exp": 1983812996
# }

# Generate Service Role Key (admin API key)
# Payload:
# {
#   "role": "service_role",
#   "iss": "supabase",
#   "iat": 1234567890,
#   "exp": 1983812996
# }
```

### 2. Create Kubernetes Secrets

Create the required secrets in the `db` namespace:

```bash
# Create Supabase JWT secrets
kubectl create secret generic supabase-secrets -n db \
  --from-literal=jwt-secret="$JWT_SECRET" \
  --from-literal=anon-key="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJhbm9uIiwiZXhwIjoxOTgzODEyOTk2fQ.REPLACE_WITH_YOUR_ANON_KEY" \
  --from-literal=service-role-key="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJleHAiOjE5ODM4MTI5OTZ9.REPLACE_WITH_YOUR_SERVICE_KEY"

# Create PostgreSQL secret (if not using existing)
kubectl create secret generic postgres-secret -n db \
  --from-literal=postgres-password="your-secure-postgres-password"

# Create MinIO secret (if not using existing)
kubectl create secret generic minio-secret -n db \
  --from-literal=access-key="minio" \
  --from-literal=secret-key="your-secure-minio-password"
```

**Important**: Replace the JWT tokens with your own generated tokens using the secret from step 1.

### 3. Create MinIO Bucket

Supabase Storage requires a dedicated bucket in MinIO:

```bash
# Install MinIO client (if not already installed)
# macOS
brew install minio/stable/mc

# Linux
wget https://dl.min.io/client/mc/release/linux-amd64/mc
chmod +x mc
sudo mv mc /usr/local/bin/

# Configure MinIO alias (adjust endpoint and credentials)
mc alias set myminio http://minio.db.svc.cluster.local:9000 minio your-minio-secret-key

# Or if accessing from outside the cluster via port-forward:
kubectl port-forward -n db svc/minio 9000:9000 &
mc alias set myminio http://localhost:9000 minio your-minio-secret-key

# Create the bucket for Supabase Storage
mc mb myminio/supabase-storage

# Set bucket policy to allow uploads (optional, for development)
mc anonymous set download myminio/supabase-storage

# Verify bucket creation
mc ls myminio
```

### 4. Verify PostgreSQL Connectivity

Ensure PostgreSQL is accessible and ready:

```bash
# Test PostgreSQL connection
kubectl run -n db postgres-test --rm -it --restart=Never \
  --image=postgres:16-alpine \
  --env="PGPASSWORD=your-postgres-password" \
  -- psql -h postgres-postgresql.db.svc.cluster.local -U postgres -d postgres -c "SELECT version();"

# Create Supabase database manually (optional, init job will handle this)
kubectl run -n db postgres-test --rm -it --restart=Never \
  --image=postgres:16-alpine \
  --env="PGPASSWORD=your-postgres-password" \
  -- psql -h postgres-postgresql.db.svc.cluster.local -U postgres -d postgres -c "CREATE DATABASE supabase;"
```

## Installation

**Important**: Complete the [Initial Setup](#initial-setup) section above before proceeding with installation.

### 1. Verify Prerequisites

Ensure all required services are running:

```bash
# Check that required services are deployed
kubectl get pods -n ingress -l app.kubernetes.io/name=traefik
kubectl get pods -n service -l app.kubernetes.io/name=vault
kubectl get pods -n db -l app.kubernetes.io/name=postgresql
kubectl get pods -n db -l app.kubernetes.io/name=minio
kubectl get pods -n db -l app.kubernetes.io/name=valkey

# Verify secrets exist
kubectl get secret -n db supabase-secrets
kubectl get secret -n db postgres-secret
kubectl get secret -n db minio-secret

# Verify MinIO bucket exists
mc ls myminio/supabase-storage
```

### 2. Configure values

The release file at `kubernetes/releases/supabase.yaml.gotmpl` is already configured to use existing infrastructure.

If you need to customize, create a custom `values.yaml` file:

```yaml
namespace: db

postgresql:
  external: true
  host: "postgres-postgresql.db.svc.cluster.local"
  port: 5432
  database: "supabase"
  user: "postgres"
  existingSecret: "postgres-secret"

minio:
  external: true
  endpoint: "minio.db.svc.cluster.local:9000"
  bucket: "supabase-storage"
  existingSecret: "minio-secret"

redis:
  external: true
  host: "valkey-master.db.svc.cluster.local"
  port: 6379

ingress:
  api:
    enabled: true
    hosts:
      - host: supabase.example.com
        paths:
          - path: /
            pathType: Prefix
  studio:
    enabled: true
    hosts:
      - host: supabase-studio.example.com
        paths:
          - path: /
            pathType: Prefix
```

### 3. Deploy Supabase

#### Option A: Using Helmfile (Recommended)

With Helmfile, dependencies are automatically handled:

```bash
# Navigate to kubernetes directory
cd /Users/zeizel/projects/self-hosted/kubernetes

# Deploy Supabase (dependencies will be checked automatically)
helmfile sync --selector name=supabase

# Or deploy all services including dependencies
helmfile sync
```

Helmfile will automatically ensure that `postgres`, `minio`, `valkey`, `traefik`, and `vault` are deployed first based on the `needs` configuration in `kubernetes/apps/_others.yaml`.

#### Option B: Manual Step-by-Step Deployment

If deploying manually, follow this exact order:

```bash
# Step 1: Deploy infrastructure services first
helmfile sync --selector namespace=ingress   # Traefik
helmfile sync --selector namespace=service   # Consul, Vault

# Step 2: Deploy database services
helmfile sync --selector name=postgres
helmfile sync --selector name=minio
helmfile sync --selector name=valkey

# Step 3: Verify all dependencies are running
kubectl get pods -n db
kubectl get pods -n ingress
kubectl get pods -n service

# Step 4: Deploy Supabase
helmfile sync --selector name=supabase
```

#### Option C: Using Helm directly

```bash
helm install supabase ./charts/supabase \
  --namespace db \
  --create-namespace \
  -f kubernetes/releases/supabase.yaml.gotmpl
```

**Note**: When using Helm directly, you must manually ensure all dependencies are deployed first.

### 4. Verify Deployment

Check that all Supabase components are running:

```bash
# Check all Supabase pods
kubectl get pods -n db -l app.kubernetes.io/name=supabase

# Expected output should show:
# - supabase-kong (2 replicas)
# - supabase-auth (2 replicas)
# - supabase-rest (2 replicas)
# - supabase-realtime (2 replicas)
# - supabase-storage (2 replicas)
# - supabase-meta (2 replicas)
# - supabase-studio (1 replica)
# - supabase-edge-runtime (2 replicas)
# - supabase-imgproxy (2 replicas)

# Check ingress routes
kubectl get ingress -n db | grep supabase

# Check init job completion
kubectl get jobs -n db | grep supabase-init
```

### 5. Access Supabase

Once deployed, access the services:

```bash
# Get the ingress URLs
kubectl get ingress -n db -o wide

# Access via browser:
# - Studio: https://supabase-studio.zeizel.localhost
# - API: https://supabase.zeizel.localhost

# Or port-forward for local access
kubectl port-forward -n db svc/supabase-kong 8000:8000 &
kubectl port-forward -n db svc/supabase-studio 3000:3000 &
```

## Configuration

### PostgreSQL Configuration

The chart requires an external PostgreSQL database. The following extensions will be automatically installed:

- `uuid-ossp`: UUID generation
- `pg_stat_statements`: Query statistics
- `pgvector`: Vector similarity search
- `pgjwt`: JWT token generation/validation
- `pg_graphql`: GraphQL support
- `pg_net`: HTTP client for PostgreSQL

### JWT Configuration

Generate secure JWT secrets:

```bash
# Generate JWT secret
openssl rand -base64 32

# Generate service role key and anon key using JWT secret
# Use https://jwt.io/ or similar tool
```

Configure in your values:

```yaml
jwt:
  secret: "your-jwt-secret"
  anonKey: "eyJhbGci..."  # Public API key
  serviceRoleKey: "eyJhbGci..."  # Admin API key
  expiry: 3600
```

### Storage Backend

The chart supports S3-compatible storage:

```yaml
storage:
  config:
    backend: "s3"
    fileSizeLimit: 52428800  # 50MB
    imageTransformationEnabled: true

minio:
  endpoint: "minio.db.svc.cluster.local:9000"
  bucket: "supabase-storage"
  region: "us-east-1"
  useSSL: false
```

### Authentication Providers

Enable OAuth providers:

```yaml
auth:
  config:
    externalGoogleEnabled: true
    externalGithubEnabled: true
    smtp:
      enabled: true
      host: "smtp.example.com"
      port: 587
      user: "noreply@example.com"
```

### Scaling

Scale individual components:

```yaml
kong:
  replicaCount: 3

auth:
  replicaCount: 2

rest:
  replicaCount: 3

realtime:
  replicaCount: 2
```

## Usage

### Access the Services

After installation, access Supabase:

- **API Gateway**: `https://supabase.example.com`
- **Studio Dashboard**: `https://supabase-studio.example.com`

### API Endpoints

The Kong Gateway exposes the following endpoints:

- `/auth/v1/*` - Authentication API
- `/rest/v1/*` - REST API (PostgREST)
- `/realtime/v1/*` - Realtime WebSocket
- `/storage/v1/*` - Storage API
- `/functions/v1/*` - Edge Functions
- `/pg/*` - PostgreSQL Meta API

### Client SDKs

Use the official Supabase client libraries:

**JavaScript/TypeScript:**

```bash
npm install @supabase/supabase-js
```

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://supabase.example.com',
  'your-anon-key'
)
```

**Python:**

```bash
pip install supabase
```

```python
from supabase import create_client

supabase = create_client(
    "https://supabase.example.com",
    "your-anon-key"
)
```

## Monitoring

Enable Prometheus monitoring:

```yaml
monitoring:
  enabled: true
  serviceMonitor:
    enabled: true
    interval: 30s
```

## Troubleshooting

### Check pod status

```bash
kubectl get pods -n db -l app.kubernetes.io/name=supabase
```

### View logs

```bash
# Kong Gateway
kubectl logs -n db -l app.kubernetes.io/component=kong

# Auth Service
kubectl logs -n db -l app.kubernetes.io/component=auth

# PostgREST
kubectl logs -n db -l app.kubernetes.io/component=rest

# Realtime
kubectl logs -n db -l app.kubernetes.io/component=realtime
```

### Common Issues

#### 1. PostgreSQL Connection Failed

Ensure PostgreSQL is accessible and credentials are correct:

```bash
kubectl exec -n db deployment/supabase-auth -- \
  psql postgresql://postgres:password@postgres-postgresql:5432/supabase -c "SELECT version();"
```

#### 2. JWT Token Invalid

Verify JWT secret matches across all services and regenerate keys if needed.

#### 3. Storage Upload Failed

Check MinIO/S3 connectivity and bucket permissions:

```bash
kubectl exec -n db deployment/supabase-storage -- \
  curl -v http://minio.db.svc.cluster.local:9000
```

## Upgrading

```bash
# Using Helmfile
helmfile -f helmfile.yaml apply

# Using Helm
helm upgrade supabase ./charts/supabase \
  --namespace db \
  -f values.yaml
```

## Uninstallation

```bash
# Using Helmfile
helmfile -f helmfile.yaml destroy

# Using Helm
helm uninstall supabase --namespace db
```

**Note**: This will not delete the PostgreSQL database or storage buckets. Clean up manually if needed.

## Security Considerations

1. **Always use external secrets** for sensitive data (JWT secrets, database passwords)
2. **Enable TLS** for all ingress endpoints
3. **Restrict network policies** to limit inter-pod communication
4. **Regularly update** to the latest Supabase versions
5. **Use strong JWT secrets** (minimum 32 characters)
6. **Enable Row Level Security (RLS)** in PostgreSQL for data protection

## Quick Start Guide

Complete deployment workflow from scratch:

```bash
# ============================================
# STEP 1: Deploy Infrastructure Dependencies
# ============================================

cd /Users/zeizel/projects/self-hosted/kubernetes

# Deploy Traefik ingress controller
helmfile sync --selector name=traefik

# Deploy Consul for service discovery
helmfile sync --selector name=consul

# Deploy Vault for secrets management
helmfile sync --selector name=vault

# Verify infrastructure services are running
kubectl get pods -n ingress
kubectl get pods -n service

# ============================================
# STEP 2: Deploy Database Services
# ============================================

# Deploy PostgreSQL
helmfile sync --selector name=postgres

# Deploy MinIO (S3-compatible storage)
helmfile sync --selector name=minio

# Deploy Valkey (Redis-compatible)
helmfile sync --selector name=valkey

# Verify database services are running
kubectl get pods -n db
kubectl get svc -n db

# ============================================
# STEP 3: Initial Setup - Create Secrets
# ============================================

# Generate JWT secret
export JWT_SECRET=$(openssl rand -base64 32)
echo "Generated JWT Secret: $JWT_SECRET"

# Create Supabase secrets
kubectl create secret generic supabase-secrets -n db \
  --from-literal=jwt-secret="$JWT_SECRET" \
  --from-literal=anon-key="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJhbm9uIiwiZXhwIjoxOTgzODEyOTk2fQ.YOUR_ANON_KEY" \
  --from-literal=service-role-key="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJleHAiOjE5ODM4MTI5OTZ9.YOUR_SERVICE_KEY"

# Create PostgreSQL secret (adjust password)
kubectl create secret generic postgres-secret -n db \
  --from-literal=postgres-password="secure-postgres-password"

# Create MinIO secret (adjust credentials)
kubectl create secret generic minio-secret -n db \
  --from-literal=access-key="minio" \
  --from-literal=secret-key="secure-minio-password"

# Verify secrets are created
kubectl get secrets -n db | grep -E "supabase|postgres|minio"

# ============================================
# STEP 4: Setup MinIO Bucket
# ============================================

# Port-forward MinIO for local access
kubectl port-forward -n db svc/minio 9000:9000 &

# Configure MinIO client
mc alias set myminio http://localhost:9000 minio secure-minio-password

# Create Supabase storage bucket
mc mb myminio/supabase-storage

# Set bucket policy (optional, for development)
mc anonymous set download myminio/supabase-storage

# Verify bucket
mc ls myminio

# Stop port-forward when done
pkill -f "kubectl port-forward.*minio"

# ============================================
# STEP 5: Deploy Supabase
# ============================================

# Deploy Supabase (dependencies will be verified automatically)
helmfile sync --selector name=supabase

# Wait for all pods to be ready (may take 2-3 minutes)
kubectl wait --for=condition=ready pod -n db -l app.kubernetes.io/name=supabase --timeout=300s

# ============================================
# STEP 6: Verify Deployment
# ============================================

# Check all Supabase pods are running
kubectl get pods -n db -l app.kubernetes.io/name=supabase

# Check services
kubectl get svc -n db -l app.kubernetes.io/name=supabase

# Check ingress routes
kubectl get ingress -n db | grep supabase

# Check init job completed successfully
kubectl get jobs -n db | grep supabase-init
kubectl logs -n db job/supabase-init

# ============================================
# STEP 7: Access Supabase
# ============================================

# Get ingress URLs
echo "Studio UI: https://supabase-studio.zeizel.localhost"
echo "API Gateway: https://supabase.zeizel.localhost"

# Test API health
curl https://supabase.zeizel.localhost/health

# Access Studio in browser
open https://supabase-studio.zeizel.localhost

# ============================================
# STEP 8: Test with Client SDK (Optional)
# ============================================

# JavaScript/TypeScript example
cat > test-supabase.js << 'EOF'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://supabase.zeizel.localhost',
  'YOUR_ANON_KEY'
)

// Test authentication
const { data, error } = await supabase.auth.signUp({
  email: 'test@example.com',
  password: 'secure-password'
})

console.log('Result:', data, error)
EOF

# Install and run
npm install @supabase/supabase-js
node test-supabase.js
```

### Troubleshooting Quick Start

If any step fails, check:

```bash
# 1. Check pod status
kubectl get pods -n db -l app.kubernetes.io/name=supabase
kubectl describe pod -n db <pod-name>

# 2. Check logs
kubectl logs -n db -l app.kubernetes.io/component=kong -f
kubectl logs -n db -l app.kubernetes.io/component=auth -f

# 3. Check secrets exist
kubectl get secret -n db supabase-secrets -o yaml

# 4. Check PostgreSQL connection
kubectl exec -n db deployment/supabase-auth -- \
  psql postgresql://postgres:password@postgres-postgresql:5432/supabase -c "SELECT version();"

# 5. Check MinIO bucket
kubectl exec -n db deployment/supabase-storage -- \
  curl -v http://minio.db.svc.cluster.local:9000

# 6. Re-run init job if needed
kubectl delete job -n db supabase-init
helmfile sync --selector name=supabase
```

## Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase GitHub](https://github.com/supabase/supabase)
- [Self-Hosting Guide](https://supabase.com/docs/guides/self-hosting)
- [API Reference](https://supabase.com/docs/reference)

## License

This Helm chart is provided under the Apache 2.0 license. Supabase itself is licensed under Apache 2.0.

## Maintainers

- Lvov Valery ([@ZeiZel](https://github.com/ZeiZel))

## Contributing

Contributions are welcome! Please submit issues and pull requests to the [repository](https://github.com/ZeiZel/self-hosted).
