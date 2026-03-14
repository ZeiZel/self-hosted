#!/usr/bin/env bash
# Self-Hosted CLI Wrapper
# Ensures Bun is available and runs the CLI

set -euo pipefail

# Ensure Bun is in PATH
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
if [[ -d "$BUN_INSTALL/bin" ]]; then
    export PATH="$BUN_INSTALL/bin:$PATH"
fi

# CLI directory
CLI_DIR="/Users/zeizel/projects/self-hosted/cli"

# Run the CLI with Bun from CLI directory
cd "$CLI_DIR" && exec bun run src/main.ts "$@"
