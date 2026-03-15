# CLI Agent Context

**Module**: CLI (selfhost)
**Path**: `cli/`
**Framework**: NestJS with Commander.js
**Purpose**: User interface for deployment orchestration and monitoring

---

## Architecture Overview

The CLI is a **wrapper around Ansible** that provides:
- Interactive deployment prompts
- Phase-based deployment management
- Monitoring daemon with Telegram alerts
- Service selection and configuration

```
User → CLI (selfhost deploy) → Ansible (all.yml) → Helmfile → Kubernetes
```

**The CLI does NOT directly interact with Kubernetes or Helm.**

---

## Module Structure

```
cli/
├── src/
│   ├── app.module.ts              # Root module
│   ├── commands/                  # CLI commands
│   │   ├── deploy.command.ts      # Main deployment command
│   │   ├── services.command.ts    # Service management
│   │   ├── inventory.command.ts   # Host inventory
│   │   ├── monitor.command.ts     # TUI monitoring
│   │   ├── bot.command.ts         # Telegram bot
│   │   └── ...
│   ├── modules/
│   │   ├── services/              # Service configuration
│   │   ├── inventory/             # Host inventory management
│   │   ├── config/                # CLI configuration
│   │   ├── monitor/               # Monitoring TUI
│   │   ├── ui/                    # Prompts and UI helpers
│   │   └── balancing/             # Load balancing strategies
│   ├── telegram/                  # Telegram bot handlers
│   └── daemon/                    # Background daemon service
```

---

## Key Commands

### `selfhost deploy`

Main deployment command that orchestrates Ansible execution.

```bash
selfhost deploy                    # Full interactive deployment
selfhost deploy --tags databases   # Run specific Ansible tags
selfhost deploy --dry-run          # Preview without changes
selfhost deploy --resume           # Resume incomplete deployment
selfhost deploy --bypass-permissions  # Skip confirmations
```

**Phase-to-Tags mapping** (from `deploy.command.ts`):

| Phase | Ansible Tags |
|-------|--------------|
| INFRASTRUCTURE_SETUP | server, docker |
| KUBERNETES_BOOTSTRAP | kubespray, kubernetes |
| STORAGE_LAYER | storage, openebs |
| BACKUP_SETUP | backup, backup-node, zerobyte |
| CORE_SERVICES | infrastructure, base |
| DATABASES | infrastructure, databases |
| APPLICATION_SERVICES | infrastructure, apps |
| NETWORK_GATEWAY | pangolin |
| VERIFICATION | validate, verify |

### `selfhost services`

Manage service selection for deployment.

```bash
selfhost services list             # Show all services
selfhost services enable <name>    # Enable service
selfhost services disable <name>   # Disable service
```

### `selfhost inventory`

Manage host inventory.

```bash
selfhost inventory list            # Show hosts
selfhost inventory add             # Add new host
selfhost inventory validate        # Validate configuration
```

### `selfhost monitor`

TUI monitoring interface.

```bash
selfhost monitor                   # Launch TUI
selfhost monitor start             # Start daemon
selfhost monitor stop              # Stop daemon
```

---

## Service Selection

Services are defined in `kubernetes/apps/_others.yaml` and parsed by `ServicesService`.

**Service tiers**:
- **Tier 0 (Core)**: Always deployed, non-selectable
- **Tier 1 (Infrastructure)**: Recommended, selectable
- **Tier 2 (Databases)**: Selectable based on app needs
- **Tier 3 (Applications)**: Fully user-selectable

The CLI presents a multi-select prompt for non-core services.

---

## Configuration Storage

CLI stores state in `~/.selfhost/`:
- `config.json` — CLI configuration
- `deployment-state.json` — Active deployment tracking
- `services.json` — Enabled services cache

---

## Development Guidelines

### Adding a New Command

1. Create `cli/src/commands/<name>.command.ts`
2. Export a `create<Name>Command(app: INestApplicationContext)` function
3. Register in `cli/src/main.ts`

### Working with Services

```typescript
// Get service by name
const service = servicesService.getByName('gitlab');

// Get enabled services
const enabled = servicesService.getEnabled();

// Enable/disable
servicesService.setEnabled('gitlab', true);
```

### Ansible Execution

```typescript
import { executeAnsible } from './commands/deploy.command';

const result = await executeAnsible(
  ansiblePath,
  ['infrastructure', 'databases'],  // tags
  'hosts.ini',                       // inventory file
  false                              // dryRun
);
```

---

## Testing

```bash
cd cli
npm run test              # Unit tests
npm run test:e2e          # E2E tests
npm run lint              # Lint check
```

---

## Common Issues

### "CLI not initialized"
Run `selfhost init` first to create configuration.

### "Could not find repository root"
Ensure you're running from within the self-hosted directory.

### "Inventory validation failed"
Check that `ansible/inventory/hosts.ini` exists and is properly formatted.

---

## Integration Points

| System | Integration |
|--------|-------------|
| Ansible | Spawns `ansible-playbook` subprocess |
| Kubernetes | Reads service definitions from `apps/_others.yaml` |
| Telegram | Bot handlers in `telegram/handlers/` |
| Prometheus | API client in `modules/monitor/apis/` |
