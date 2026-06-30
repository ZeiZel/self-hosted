#!/usr/bin/env bash
#
# Self-Hosted CLI installer (Go).
# Clones/updates the repo and builds the single `selfhost` Go binary.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/ZeiZel/self-hosted/main/scripts/install.sh | bash
#   scripts/install.sh --uninstall
#
set -euo pipefail

REPO_URL="https://github.com/ZeiZel/self-hosted.git"
INSTALL_DIR="${SELFHOST_INSTALL_DIR:-$HOME/.selfhost}"
BIN_DIR="${SELFHOST_BIN_DIR:-/usr/local/bin}"
CLI_NAME="selfhost"

RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
fatal()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }
has_cmd() { command -v "$1" >/dev/null 2>&1; }

uninstall() {
    info "Uninstalling ${CLI_NAME}…"
    if [ -L "$BIN_DIR/$CLI_NAME" ] || [ -f "$BIN_DIR/$CLI_NAME" ]; then
        if [ -w "$BIN_DIR" ]; then rm -f "$BIN_DIR/$CLI_NAME"; else sudo rm -f "$BIN_DIR/$CLI_NAME"; fi
    fi
    success "Removed $BIN_DIR/$CLI_NAME (left $INSTALL_DIR in place)"
    exit 0
}

[ "${1:-}" = "--uninstall" ] && uninstall

has_cmd go || fatal "Go toolchain not found. Install Go 1.26+ (https://go.dev/dl/) and retry."
has_cmd git || fatal "git not found."

# Build from the current checkout if present, otherwise clone/update.
if [ -d "cli/cmd/selfhost" ]; then
    SRC="$(pwd)"
    info "Building from current checkout: $SRC"
else
    if [ -d "$INSTALL_DIR/.git" ]; then
        info "Updating $INSTALL_DIR"; git -C "$INSTALL_DIR" pull --ff-only
    else
        info "Cloning into $INSTALL_DIR"; git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
    fi
    SRC="$INSTALL_DIR"
fi

info "Building $CLI_NAME…"
( cd "$SRC/cli" && CGO_ENABLED=0 go build -ldflags "-s -w" -o "$CLI_NAME" ./cmd/selfhost )

TARGET="$BIN_DIR/$CLI_NAME"
if [ -w "$BIN_DIR" ]; then
    install -m 0755 "$SRC/cli/$CLI_NAME" "$TARGET"
else
    info "Elevating to write $TARGET"; sudo install -m 0755 "$SRC/cli/$CLI_NAME" "$TARGET"
fi
success "Installed -> $TARGET"
"$TARGET" --version || true
echo
info "Run '${CLI_NAME} init' to get started."
