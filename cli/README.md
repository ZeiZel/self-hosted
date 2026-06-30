# selfhost

The self-hosted infrastructure CLI and monitoring daemon — a single static Go
binary with a native (non-Docker) daemon. (Replaced the former Bun + NestJS +
Commander + Ink implementation, June 2026.)

Built on the [Charm](https://charm.land) stack:

- **bubbletea + lipgloss + bubbles** — the live `monitor` dashboard
- **ntcharts** — CPU/memory sparklines in the dashboard
- **huh** — interactive wizards & prompts (replaces inquirer)
- **lipgloss/table** — styled tables (replaces cli-table3)
- **cobra** — command tree (replaces commander)

> Note on `fang`: Charm's `fang` help-styler currently pulls the Bubble Tea **v2**
> pre-release stack, which is incompatible with the v1 stack `ntcharts`,
> `bubbles`, and `lipgloss/table` build on. To keep the dashboard and tables
> working we stay on the stable v1 stack and provide a small lipgloss-styled help
> banner instead. Revisit once the ecosystem converges on v2.

## Build

```bash
make build           # -> ./selfhost  (CGO_ENABLED=0, pure-Go sqlite)
make test            # unit tests
make install         # symlink into /usr/local/bin
```

## Layout

```
cmd/selfhost/        entrypoint
internal/core/       constants + repo/path discovery
internal/config/     ~/.selfhosted/config.yaml + deployment state
internal/db/         SQLite (modernc, bound params) — same schema as the Node CLI
internal/cluster/    kubectl wrapper + metrics model (+ explicit --mock)
internal/ansible/    ansible-playbook exec + 9-phase → tag mapping
internal/ui/         lipgloss styles, tables, status glyphs
internal/commands/   cobra command tree (status, deploy, inventory, …)
internal/tui/        bubbletea monitor dashboard + ntcharts sparklines
internal/telegram/   Telegram Bot API client + alerting (net/http)
internal/daemon/     native daemon: runloop, HTTP API, launchd/systemd lifecycle
```

## State compatibility

Reuses the Node CLI's on-disk layout so the binaries are interchangeable:
`~/.selfhosted/config.yaml`, `~/.selfhosted/selfhosted.db` (identical schema),
`~/.selfhosted/state/deployments.json`. Override the base dir with
`SELFHOST_CONFIG_DIR`.

## Daemon

The daemon is the same binary run as `selfhost daemon run`, supervised by
**launchd** (macOS) or **systemd --user** (Linux) — no Docker/Bun:

```bash
selfhost daemon init      # install the service unit
selfhost daemon start     # launchctl/systemctl start
selfhost daemon status    # read state from the shared SQLite DB
selfhost daemon logs      # recent health-check logs
selfhost daemon stop
```

It runs a health-check loop (`CHECK_INTERVAL`, default 60s), a metrics collector
(`METRICS_INTERVAL`, default 5s), an HTTP long-poll API on `127.0.0.1:8765`
(`/api/v1/health|metrics/current|metrics/poll`), and sends Telegram alerts for
non-healthy nodes.

## Offline / demo

Cluster commands take `--mock` to render a demo dataset without a reachable
cluster (the Node CLI did this silently on kubectl failure; here it is explicit):

```bash
selfhost status --mock
selfhost monitor --mock
selfhost monitor pods --mock --json
```
