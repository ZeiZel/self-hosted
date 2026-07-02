---
sidebar_position: 5
---

# Basic Infrastructure Deployment

At this stage we will deploy the basic infrastructure components required for all other services to work: Traefik (Gateway API / GatewayClass controller), Consul (service discovery), and Vault (secrets management).

## Deployment Order

Helmfile automatically deploys the services in the correct order thanks to the dependencies defined in the application registry `kubernetes/apps/*.yaml` (for example, `_others.yaml`, `services.yaml`, `storage.yaml`). The order is as follows:

1. **Namespaces** - creation of all required namespaces
2. **Traefik** - Gateway API (GatewayClass) controller for traffic routing (by default via Gateway API / HTTPRoute)
3. **Consul** - service discovery and service mesh
4. **Vault** - secrets management system

All other services depend on these basic components.

## Deployment of Base Services

### Running the Deployment

Navigate to the directory with the Kubernetes configuration:

```bash
cd kubernetes
```

Make sure Helmfile is initialized (see [Deploying the Kubernetes Cluster](./kubernetes-deployment.md#helmfile-initialization)):

```bash
helmfile init --force
```

Run the deployment of the base infrastructure:

```bash
helmfile -e k8s apply
```

This command:
1. Reads all configurations from `releases/` and `envs/k8s/`
2. Applies the dependencies between services
3. Deploys the services in the correct order
4. Creates all required resources in Kubernetes

### Status Verification

Check the list of all releases:

```bash
helmfile -e k8s list
```

Check the status of the pods:

```bash
kubectl get pods --all-namespaces
```

Make sure all system pods are running:

```bash
kubectl get pods -n ingress
kubectl get pods -n service
```

## Traefik

Traefik is a modern reverse proxy and load balancer, used as the Gateway API controller (GatewayClass `traefik.io/gateway-controller`). By default, routing is done via the Gateway API (HTTPRoute) with a shared Gateway in the `ingress` namespace; the regular Ingress and Traefik IngressRoute are available as optional variants.

### Traefik Verification

Check the status of the Traefik pods:

```bash
kubectl get pods -n ingress -l app.kubernetes.io/name=traefik
```

Check the services:

```bash
kubectl get svc -n ingress
```

### Ingress Verification

After deploying the other services, check the routes:

```bash
kubectl get httproute --all-namespaces
```

## Consul

Consul provides service discovery, health checking, and service mesh functionality.

### Consul Verification

Check the status of the Consul pods:

```bash
kubectl get pods -n service -l app=consul
```

Check the Consul UI (if enabled):

```bash
kubectl get ingress -n service -l app=consul
```

Access to the Consul UI is usually at the address `consul.local` (depends on the configuration).

## Vault

Vault is a secrets management system with centralized storage and access policies.

### Vault Initialization

After deploying Vault, it needs to be initialized.

#### 1. Availability Verification

Make sure Vault is running:

```bash
kubectl get pods -n service -l app=vault
```

All pods must be in the `Running` status.

#### 2. Vault Initialization

Initialize Vault (performed only once):

```bash
kubectl exec -n service deployment/vault -- vault operator init
```

The command will return:
- **Unseal Keys** (5 keys) - use any 3 out of 5 to unseal
- **Initial Root Token** - the root token for the initial setup

**IMPORTANT:** Store these keys in a safe place! Without them you will not be able to access Vault.

Example output:

```
Unseal Key 1: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Unseal Key 2: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Unseal Key 3: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Unseal Key 4: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Unseal Key 5: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

Initial Root Token: s.xxxxxxxxxxxxxxxxxxxxx
```

#### 3. Unsealing Vault

For Vault to work it must be unsealed, using the unseal keys. You need to use at least 3 out of 5 keys.

For each Vault pod, perform an unseal:

```bash
# Get list of Vault pods
kubectl get pods -n service -l app=vault

# Execute unseal for each pod (at least 3 times with different keys)
kubectl exec -n service vault-0 -- vault operator unseal <unseal-key-1>
kubectl exec -n service vault-0 -- vault operator unseal <unseal-key-2>
kubectl exec -n service vault-0 -- vault operator unseal <unseal-key-3>

# Repeat for the other pods (vault-1, vault-2, if present)
```

Check the status:

```bash
kubectl exec -n service deployment/vault -- vault status
```

The status should show `Sealed: false`.

#### 4. Configuring Vault for Kubernetes

Run the Vault setup script:

```bash
cd kubernetes/scripts
chmod +x vault-setup.sh
./vault-setup.sh
```

This script automatically:
- Enables the Kubernetes auth method
- Configures the connection to the Kubernetes API
- Creates policies for all services
- Creates Kubernetes Auth roles for all services

#### 5. Logging In to Vault

Log in to Vault using the root token:

```bash
kubectl exec -n service deployment/vault -- vault login <initial-root-token>
```

Or via the UI:

```bash
# Get the URL for accessing the Vault UI
kubectl get ingress -n service -l app=vault
```

Open the URL in a browser (usually `vault.local`) and log in using the root token.

#### 6. Changing the Root Token (Recommended)

After the initial setup it is recommended to change the root token:

```bash
kubectl exec -n service deployment/vault -- vault auth enable userpass
kubectl exec -n service deployment/vault -- vault write auth/userpass/users/admin \
  password=<new-password> policies=root
```

Then use the new user to log in instead of the root token.

### Syncing Secrets with Vault

After configuring Vault, sync the secrets from `_all.yaml`:

```bash
cd kubernetes/scripts
./vault-sync-secrets.sh
```

To sync a specific service:

```bash
./vault-sync-secrets.sh authentik
./vault-sync-secrets.sh vaultwarden
```

For more details on working with secrets, see [Secrets Setup](./secrets-setup.md#synchronizing-secrets-with-vault).

## Automatic Vault Unsealing

For automatic Vault unsealing after a restart, you can use Vault Auto-unseal or store the unseal keys in Kubernetes Secrets (less secure, but simpler).

It is recommended to configure automatic unsealing for production environments.

## Verifying the Base Infrastructure

After deploying all components, check:

### Traefik

```bash
# Verify the pods
kubectl get pods -n ingress

# Verify the services
kubectl get svc -n ingress

# Verify the routes (by default Gateway API HTTPRoute)
kubectl get httproute --all-namespaces
```

### Consul

```bash
# Verify the pods
kubectl get pods -n service -l app=consul

# Verify the services in Consul
kubectl exec -n service deployment/consul -- consul members
```

### Vault

```bash
# Verify the status
kubectl exec -n service deployment/vault -- vault status

# Verify the list of secrets
kubectl exec -n service deployment/vault -- vault kv list secret/
```

## Troubleshooting

### Issue: Traefik does not start

Check the logs:

```bash
kubectl logs -n ingress -l app.kubernetes.io/name=traefik
```

Check the configuration:

```bash
kubectl get configmap -n ingress
kubectl describe pod -n ingress -l app.kubernetes.io/name=traefik
```

### Issue: Consul cannot connect to the nodes

Check the network policies:

```bash
kubectl get networkpolicies -n service
```

Check the logs:

```bash
kubectl logs -n service -l app=consul
```

### Issue: Vault is sealed

Perform an unseal:

```bash
kubectl exec -n service deployment/vault -- vault operator unseal <unseal-key>
```

You need to do this at least 3 times with different keys.

### Issue: Cannot sync secrets

Check that Vault is unsealed:

```bash
kubectl exec -n service deployment/vault -- vault status
```

Check the access permissions:

```bash
kubectl exec -n service deployment/vault -- vault auth list
```

## Next Steps

After successfully deploying the base infrastructure:

1. [Deploying Services](./services-deployment.md) - deploy all other services (databases, applications, monitoring)
