# QDrant (local vector DB for agent memory)

Local [QDrant](https://qdrant.tech/) instance used as the semantic-memory backend for
the **qdrant MCP server**. Agents (Claude Code, Cursor, …) store and recall context in
QDrant to reduce repeated re-reading of the codebase and thus optimise token usage.

> Reference / developer-tooling config only. This is **not** part of the production
> Kubernetes platform and is never deployed via Ansible/Helmfile.

## Run

```bash
cd docker/qdrant
docker compose up -d

# verify
curl -s http://localhost:6333/collections        # -> {"result":{"collections":[...]},...}
open http://localhost:6333/dashboard             # web UI
```

Ports:
- `6333` — REST API + Web UI
- `6334` — gRPC

Data persists in the `qdrant_storage` named volume.

## MCP wiring

The repo's `.mcp.json` registers `mcp-server-qdrant` (run via `uvx`, using **local
FastEmbed** embeddings — no API key) pointed at `http://localhost:6333`, collection
`self-hosted-memory`. MCP servers are loaded by the agent **at startup**, so changes
take effect in the next session.

```bash
# one-time: ensure uv/uvx is installed (https://docs.astral.sh/uv/)
uvx mcp-server-qdrant --help   # smoke-test the server binary resolves
```

## Stop / clean

```bash
docker compose down            # stop, keep data
docker compose down -v         # stop and delete the volume
```
