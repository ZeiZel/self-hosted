#!/usr/bin/env bash
#
# Install the Go `selfhost` binary.
#
# Usage:
#   cli-go/install.sh                 # build from source and symlink into /usr/local/bin
#   SELFHOST_BIN_DIR=~/bin cli-go/install.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="${SELFHOST_BIN_DIR:-/usr/local/bin}"
BINARY="selfhost"

info()  { printf '\033[0;34m[INFO]\033[0m %s\n' "$*"; }
ok()    { printf '\033[0;32m[OK]\033[0m %s\n' "$*"; }
fatal() { printf '\033[0;31m[ERROR]\033[0m %s\n' "$*" >&2; exit 1; }

command -v go >/dev/null 2>&1 || fatal "Go toolchain not found. Install Go 1.26+ first (https://go.dev/dl/)."

info "Building $BINARY ..."
( cd "$SCRIPT_DIR" && CGO_ENABLED=0 go build -ldflags "-s -w" -o "$BINARY" ./cmd/selfhost )
ok "built $SCRIPT_DIR/$BINARY"

TARGET="$BIN_DIR/$BINARY"
if [ -w "$BIN_DIR" ]; then
    install -m 0755 "$SCRIPT_DIR/$BINARY" "$TARGET"
else
    info "Elevating to write $TARGET"
    sudo install -m 0755 "$SCRIPT_DIR/$BINARY" "$TARGET"
fi
ok "installed -> $TARGET"
"$TARGET" --version || true
