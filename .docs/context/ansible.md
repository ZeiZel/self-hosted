# Ansible Agent Context

**Module**: Ansible
**Path**: `ansible/`
**Purpose**: Infrastructure provisioning, configuration, and deployment orchestration

---

## Architecture Overview

Ansible is the **only tool for server provisioning and configuration**. All deployments run through:

```bash
ansible-playbook -i inventory/hosts.ini all.yml --vault-password-file ~/.ansible_vault_password
```

The `infrastructure` role calls Helmfile with appropriate selectors for Kubernetes deployments.

```
CLI → Ansible → Helmfile → Kubernetes
```

---

## Directory Structure

```
ansible/
├── all.yml                        # Main playbook entry point
├── inventory/
│   ├── hosts.ini                  # Main inventory (gitignored)
│   ├── hosts.example.ini          # Template
│   ├── master.ini                 # Control plane only
│   ├── gateway.ini                # Gateway VPS only
│   └── node.ini                   # Worker nodes only
├── group_vars/
│   └── all/
│       ├── vault.yml              # ENCRYPTED secrets
│       └── vault.example.yml      # Template
├── roles/
│   ├── docker/                    # Docker installation
│   ├── security/                  # Firewall, hardening
│   ├── kubespray/                 # Kubernetes deployment
│   ├── infrastructure/            # Helmfile execution
│   ├── pangolin/                  # VPN setup
│   ├── validate/                  # Verification tests
│   └── ...
└── .credentials/                  # Generated credentials (gitignored)
```

---

## Key Tags

| Tag | Description | Roles |
|-----|-------------|-------|
| `server` | Base server preparation | docker, security |
| `docker` | Docker runtime | docker |
| `kubespray` | Kubernetes cluster | kubespray |
| `kubernetes` | K8s configuration | kubespray |
| `storage` | Storage provisioner | storage, openebs |
| `openebs` | OpenEBS operators | openebs |
| `infrastructure` | All Helmfile services | infrastructure |
| `base` | Core services only | infrastructure (subset) |
| `databases` | Database services | infrastructure (subset) |
| `apps` | Application services | infrastructure (subset) |
| `pangolin` | VPN configuration | pangolin |
| `validate` | Verification tests | validate |

---

## Inventory Format

```ini
[all:vars]
ansible_user=admin
ansible_python_interpreter=/usr/bin/python3
ansible_ssh_private_key_file=~/.ssh/id_ed25519

[master]
local-server ansible_host=192.168.100.2 node_role=master

[workers]
# worker01 ansible_host=192.168.100.3 node_role=worker

[gateway]
gateway01 ansible_host=80.90.178.207 ansible_user=root node_role=gateway

[k8s:children]
master
workers

[infrastructure:children]
k8s
gateway
```

---

## Vault Variables

All secrets are stored in `group_vars/all/vault.yml` (encrypted).

**Structure**:
```yaml
user:
  name: 'admin'
  password: '$6$...'       # mkpasswd --method=sha-512
  ssh_keys:
    - 'ssh-ed25519 ...'
  email: 'admin@example.com'

databases:
  postgresql:
    admin_password: '...'
    replication_password: '...'
  mongodb:
    admin_password: '...'
  valkey:
    password: '...'
  minio:
    root_user: 'minio-admin'
    root_password: '...'

oauth:
  authentik:
    bootstrap_password: '...'
    secret_key: '...'
  gitlab:
    root_password: '...'

monitoring:
  grafana:
    admin_password: '...'

vpn:
  pangolin:
    # WireGuard keys
```

**Commands**:
```bash
# Encrypt
ansible-vault encrypt group_vars/all/vault.yml

# Edit
ansible-vault edit group_vars/all/vault.yml --vault-password-file ~/.ansible_vault_password

# View
ansible-vault view group_vars/all/vault.yml --vault-password-file ~/.ansible_vault_password
```

---

## Infrastructure Role

The `infrastructure` role (`roles/infrastructure/`) is the bridge to Helmfile:

```yaml
# roles/infrastructure/tasks/main.yml
- name: Generate Helmfile inventory values
  template:
    src: inventory-values.yaml.j2
    dest: "{{ kubernetes_path }}/envs/k8s/inventory-values.yaml"

- name: Run Helmfile apply
  command: >
    helmfile -e k8s apply
    {% if helmfile_selector is defined %}--selector {{ helmfile_selector }}{% endif %}
  args:
    chdir: "{{ kubernetes_path }}"
  environment:
    KUBECONFIG: "{{ kubeconfig_path }}"
```

**Tag-based execution**:
- `--tags infrastructure,base` → Deploys core services
- `--tags infrastructure,databases` → Deploys databases
- `--tags infrastructure,apps` → Deploys applications

---

## Pangolin VPN Role

Sets up WireGuard tunnel between gateway VPS and cluster:

**Gateway** (`roles/pangolin/tasks/gateway.yml`):
- Installs WireGuard
- Configures Pangolin server
- Sets up Traefik edge router
- Enables IP forwarding and NAT

**Cluster** (`roles/pangolin/tasks/cluster.yml`):
- Deploys Pangolin client in Kubernetes
- Establishes VPN tunnel to gateway
- Registers routes with gateway Traefik

---

## Development Guidelines

### Adding a New Role

1. Create `ansible/roles/<name>/`
2. Structure:
   ```
   roles/<name>/
   ├── defaults/main.yml      # Default variables
   ├── tasks/main.yml         # Main tasks
   ├── handlers/main.yml      # Event handlers
   ├── templates/             # Jinja2 templates
   ├── files/                 # Static files
   └── meta/main.yml          # Dependencies
   ```
3. Add tag to `all.yml`

### Task Best Practices

```yaml
- name: Descriptive task name
  module:
    param: value
  become: true                 # When root needed
  when: condition              # Conditional execution
  notify: Handler name         # Trigger handler
  tags: [tag1, tag2]          # For selective execution
  register: result             # Capture output
  changed_when: false          # Mark idempotent
```

### Handler Pattern

```yaml
# handlers/main.yml
- name: Restart service
  systemd:
    name: myservice
    state: restarted
```

---

## Testing

```bash
# Syntax check
ansible-playbook --syntax-check all.yml

# Dry run (check mode)
ansible-playbook -i inventory/hosts.ini all.yml --check

# Lint
ansible-lint *.yml

# Run specific tags
ansible-playbook -i inventory/hosts.ini all.yml --tags validate
```

---

## Common Issues

### "Vault password required"
Ensure `~/.ansible_vault_password` exists with the decryption password.

### "SSH connection failed"
Check SSH key path in inventory and that the key is loaded (`ssh-add`).

### "No hosts matched"
Verify inventory file path and host group names.

---

## Integration Points

| System | Integration |
|--------|-------------|
| CLI | Spawned by `deploy.command.ts` |
| Helmfile | Called by `infrastructure` role |
| Vault (Ansible) | Encrypts `group_vars/all/vault.yml` |
| Kubernetes | Kubeconfig path configured in role |
