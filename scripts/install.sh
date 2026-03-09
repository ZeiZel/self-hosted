#!/usr/bin/env bash
#
# Self-Hosted CLI Installation Script
# Installs the selfhost CLI tool for managing self-hosted infrastructure
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/ZeiZel/self-hosted/main/scripts/install.sh | bash
#
# Requirements:
#   - macOS or Linux
#   - curl or wget
#   - sudo access (for /usr/local/bin installation)
#

set -euo pipefail

# Configuration
REPO_URL="https://github.com/ZeiZel/self-hosted.git"
INSTALL_DIR="${SELFHOST_INSTALL_DIR:-$HOME/.selfhost}"
BIN_DIR="${SELFHOST_BIN_DIR:-/usr/local/bin}"
CLI_NAME="selfhost"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
info() { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
fatal() { error "$*"; exit 1; }

# Detect OS
detect_os() {
    case "$(uname -s)" in
        Linux*)  OS="linux" ;;
        Darwin*) OS="darwin" ;;
        *)       fatal "Unsupported operating system: $(uname -s)" ;;
    esac

    case "$(uname -m)" in
        x86_64|amd64) ARCH="x64" ;;
        arm64|aarch64) ARCH="arm64" ;;
        *)            fatal "Unsupported architecture: $(uname -m)" ;;
    esac

    info "Detected: ${OS} (${ARCH})"
}

# Check if command exists
has_cmd() {
    command -v "$1" &>/dev/null
}

# Install Bun if not present
install_bun() {
    if has_cmd bun; then
        local bun_version
        bun_version=$(bun --version 2>/dev/null || echo "unknown")
        success "Bun is already installed (v${bun_version})"
        return 0
    fi

    info "Installing Bun runtime..."

    if has_cmd curl; then
        curl -fsSL https://bun.sh/install | bash
    elif has_cmd wget; then
        wget -qO- https://bun.sh/install | bash
    else
        fatal "Neither curl nor wget found. Please install one of them."
    fi

    # Source bun into current shell
    export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
    export PATH="$BUN_INSTALL/bin:$PATH"

    if has_cmd bun; then
        success "Bun installed successfully (v$(bun --version))"
    else
        fatal "Bun installation failed. Please install manually: https://bun.sh"
    fi
}

# Clone or update repository
setup_repository() {
    if [[ -d "$INSTALL_DIR" ]]; then
        info "Updating existing installation..."
        cd "$INSTALL_DIR"
        git fetch origin
        git reset --hard origin/main
        success "Repository updated"
    else
        info "Cloning repository..."
        git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
        success "Repository cloned to $INSTALL_DIR"
    fi
}

# Install dependencies
build_cli() {
    info "Installing dependencies..."
    cd "$INSTALL_DIR/cli"

    bun install --frozen-lockfile 2>/dev/null || bun install
    success "Dependencies installed"

    # Note: No build step needed - CLI runs directly with Bun
    info "CLI ready (runs directly with Bun runtime)"
}

# Create wrapper script and install to bin
install_binary() {
    info "Installing CLI to ${BIN_DIR}..."

    # Create wrapper script
    local wrapper_script="$INSTALL_DIR/cli/selfhost-wrapper.sh"
    cat > "$wrapper_script" << 'WRAPPER'
#!/usr/bin/env bash
# Self-Hosted CLI Wrapper
# Ensures Bun is available and runs the CLI

set -euo pipefail

# Ensure Bun is in PATH
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
if [[ -d "$BUN_INSTALL/bin" ]]; then
    export PATH="$BUN_INSTALL/bin:$PATH"
fi

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Run the CLI with Bun
exec bun run "$SCRIPT_DIR/src/main.ts" "$@"
WRAPPER

    chmod +x "$wrapper_script"

    # Install to bin directory
    if [[ -w "$BIN_DIR" ]]; then
        ln -sf "$wrapper_script" "$BIN_DIR/$CLI_NAME"
    else
        info "Requesting sudo access to install to ${BIN_DIR}..."
        sudo ln -sf "$wrapper_script" "$BIN_DIR/$CLI_NAME"
    fi

    success "CLI installed to ${BIN_DIR}/${CLI_NAME}"
}

# Verify installation
verify_installation() {
    info "Verifying installation..."

    if has_cmd "$CLI_NAME"; then
        success "Installation complete!"
        echo ""
        echo -e "${GREEN}You can now use the CLI:${NC}"
        echo "  selfhost --help"
        echo ""
        echo -e "${BLUE}Quick start:${NC}"
        echo "  selfhost status        # Check cluster status"
        echo "  selfhost deploy        # Deploy services"
        echo "  selfhost monitor       # Open monitoring TUI"
        echo ""
    else
        warn "CLI installed but not found in PATH"
        echo "Add ${BIN_DIR} to your PATH or restart your terminal"
    fi
}

# Uninstall function
uninstall() {
    info "Uninstalling selfhost CLI..."

    # Remove binary/symlink
    if [[ -L "$BIN_DIR/$CLI_NAME" ]] || [[ -f "$BIN_DIR/$CLI_NAME" ]]; then
        if [[ -w "$BIN_DIR" ]]; then
            rm -f "$BIN_DIR/$CLI_NAME"
        else
            sudo rm -f "$BIN_DIR/$CLI_NAME"
        fi
        success "Removed ${BIN_DIR}/${CLI_NAME}"
    fi

    # Remove installation directory
    if [[ -d "$INSTALL_DIR" ]]; then
        rm -rf "$INSTALL_DIR"
        success "Removed ${INSTALL_DIR}"
    fi

    success "Uninstallation complete"
}

# Print usage
usage() {
    cat << EOF
Self-Hosted CLI Installer

Usage:
    install.sh [OPTIONS]

Options:
    --uninstall     Remove selfhost CLI from the system
    --help          Show this help message

Environment Variables:
    SELFHOST_INSTALL_DIR    Installation directory (default: ~/.selfhost)
    SELFHOST_BIN_DIR        Binary directory (default: /usr/local/bin)

Examples:
    # Install
    curl -fsSL https://raw.githubusercontent.com/ZeiZel/self-hosted/main/scripts/install.sh | bash

    # Install to custom directory
    SELFHOST_INSTALL_DIR=/opt/selfhost ./install.sh

    # Uninstall
    curl -fsSL https://raw.githubusercontent.com/ZeiZel/self-hosted/main/scripts/install.sh | bash -s -- --uninstall
EOF
}

# Main
main() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}   Self-Hosted CLI Installer${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --uninstall)
                uninstall
                exit 0
                ;;
            --help|-h)
                usage
                exit 0
                ;;
            *)
                warn "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
        shift
    done

    # Check for git
    if ! has_cmd git; then
        fatal "Git is required but not installed"
    fi

    detect_os
    install_bun
    setup_repository
    build_cli
    install_binary
    verify_installation
}

main "$@"
