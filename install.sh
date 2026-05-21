#!/usr/bin/env bash
# Aethera v2.0 — Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/Unknows05/Aethera-agent/main/install.sh | bash

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

REPO="https://github.com/Unknows05/Aethera-agent.git"
INSTALL_DIR="${AETHERA_DIR:-$HOME/aethera-v2}"
VERSION="2.0.0"

echo -e "${CYAN}"
echo "  ╔══════════════════════════════════════╗"
echo "  ║   Aethera v${VERSION} — Installer        ║"
echo "  ║   Autonomous AI Trading Agent        ║"
echo "  ╚══════════════════════════════════════╝"
echo -e "${NC}"

# ── Runtime Detection ──────────────────────────────────
RUNTIME=""
RUNTIME_CMD=""

if command -v bun &>/dev/null; then
    BUN_VERSION=$(bun --version 2>/dev/null || echo "?")
    echo -e "${GREEN}✓ Bun $BUN_VERSION${NC}"
    RUNTIME="bun"
    RUNTIME_CMD="bun"
elif command -v node &>/dev/null; then
    NODE_VERSION=$(node -v | sed 's/v//')
    NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
    if [ "$NODE_MAJOR" -lt 20 ]; then
        echo -e "${RED}✗ Node.js 20+ required (found $NODE_VERSION)${NC}"
        echo -e "  Upgrade: https://nodejs.org/  or  https://github.com/nvm-sh/nvm"
        exit 1
    fi
    echo -e "${GREEN}✓ Node.js $NODE_VERSION${NC}"
    RUNTIME="node"
    RUNTIME_CMD="node"
else
    echo -e "${RED}✗ No supported runtime found. Install one:${NC}"
    echo -e "  • Node.js 20+  → ${CYAN}https://nodejs.org/${NC}"
    echo -e "  • Bun ≥1.0     → ${CYAN}https://bun.sh/${NC}"
    echo -e "  • nvm          → ${CYAN}https://github.com/nvm-sh/nvm${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Git${NC}"

# ── Install / Update ────────────────────────────────────

if [ -d "$INSTALL_DIR" ] && [ -d "$INSTALL_DIR/.git" ]; then
    echo -e "\n${YELLOW}Aethera already installed at $INSTALL_DIR${NC}"
    echo -e "Updating instead of fresh install..."
    cd "$INSTALL_DIR"
    git fetch origin main 2>/dev/null || true
    git reset --hard origin/main 2>/dev/null || git pull origin main 2>/dev/null || true
    echo -e "${GREEN}✓ Updated to latest${NC}"
else
    echo -e "\n${CYAN}Installing Aethera to $INSTALL_DIR...${NC}"
    git clone "$REPO" "$INSTALL_DIR" 2>/dev/null || {
        echo -e "${RED}✗ Clone failed. Check: internet? repo URL?${NC}"
        exit 1
    }
    cd "$INSTALL_DIR"
    echo -e "${GREEN}✓ Cloned repository${NC}"
fi

cd "$INSTALL_DIR/agent"

echo -e "\n${CYAN}Installing dependencies...${NC}"
npm install --silent 2>/dev/null || npm install
echo -e "${GREEN}✓ Dependencies installed${NC}"

echo -e "\n${CYAN}Building TypeScript...${NC}"
npm run build
echo -e "${GREEN}✓ TypeScript built${NC}"

if [ -d "tui" ]; then
    echo -e "\n${CYAN}Building TUI...${NC}"
    cd tui
    npm install --silent 2>/dev/null || npm install
    npm run build 2>/dev/null || echo -e "${YELLOW}⚠ TUI build skipped${NC}"
    cd ..
    echo -e "${GREEN}✓ TUI built${NC}"
fi

# ── CLI Wrapper ─────────────────────────────────────────

echo -e "\n${CYAN}Setting up CLI...${NC}"
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"

if [ "$RUNTIME" = "bun" ]; then
    cat > "$BIN_DIR/aethera" << WRAPPER
#!/usr/bin/env bash
AETHERA_ROOT="\${AETHERA_ROOT:-$INSTALL_DIR/agent}"
exec bun "\$AETHERA_ROOT/src/cli/index.ts" "\$@"
WRAPPER
else
    cat > "$BIN_DIR/aethera" << WRAPPER
#!/usr/bin/env bash
AETHERA_ROOT="\${AETHERA_ROOT:-$INSTALL_DIR/agent}"
exec node "\$AETHERA_ROOT/dist/cli/index.js" "\$@"
WRAPPER
fi
chmod +x "$BIN_DIR/aethera"

PATH_LINE='export PATH="$HOME/.local/bin:$PATH"'
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
    echo -e "${YELLOW}⚠ Adding ~/.local/bin to PATH...${NC}"
    if [[ -f "$HOME/.zshrc" ]]; then
        echo "$PATH_LINE" >> "$HOME/.zshrc"
        echo -e "${GREEN}✓ Added to ~/.zshrc${NC}"
    elif [[ -f "$HOME/.bashrc" ]]; then
        echo "$PATH_LINE" >> "$HOME/.bashrc"
        echo -e "${GREEN}✓ Added to ~/.bashrc${NC}"
    elif [[ -f "$HOME/.bash_profile" ]]; then
        echo "$PATH_LINE" >> "$HOME/.bash_profile"
        echo -e "${GREEN}✓ Added to ~/.bash_profile${NC}"
    else
        echo -e "${YELLOW}⚠ Could not auto-add to shell rc. Add manually:${NC}"
        echo -e "  ${CYAN}$PATH_LINE${NC}"
    fi
    export PATH="$HOME/.local/bin:$PATH"
fi

mkdir -p "$INSTALL_DIR/agent/data"

# ── Done ────────────────────────────────────────────────

echo -e "\n${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Aethera v${VERSION} installed!           ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
echo -e ""
echo -e "  ${CYAN}Next steps:${NC}"
echo -e "    1. ${YELLOW}aethera init${NC}     — Setup wizard (Binance LLM config)"
echo -e "    2. ${YELLOW}aethera start${NC}    — Launch TUI"
echo -e "    3. ${YELLOW}aethera --help${NC}   — All commands"
echo -e ""
echo -e "  ${CYAN}Connect to Hivemind network:${NC}"
echo -e "    ${YELLOW}aethera config${NC}  → set hivemind.enabled: true"
echo -e "    hub: wss://hivemind.aethera-s1.com/api/hivemind/ws"
echo -e ""
echo -e "  ${CYAN}Uninstall:${NC}"
echo -e "    ${YELLOW}aethera uninstall${NC}"
echo -e ""

if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
    export PATH="$HOME/.local/bin:$PATH"
fi

echo -ne "${CYAN}Run 'aethera init' now? [Y/n]: ${NC}"
if [[ -t 0 ]]; then
    read -r answer
elif [[ -c /dev/tty ]]; then
    read -r answer </dev/tty
else
    answer=""
fi
if [[ "$answer" =~ ^[Nn]$ ]]; then
    echo -e "${YELLOW}Run 'aethera init' when ready.${NC}"
else
    cd "$INSTALL_DIR/agent"
    if [ "$RUNTIME" = "bun" ]; then
        exec bun src/cli/index.ts init </dev/tty
    else
        exec node dist/cli/index.js init </dev/tty
    fi
fi

echo -e ""
echo -e "${CYAN}Note: If 'aethera' command not found, run:${NC}"
if [[ -f "$HOME/.zshrc" ]]; then
    echo -e "  ${CYAN}source ~/.zshrc${NC}"
else
    echo -e "  ${CYAN}source ~/.bashrc${NC}"
fi
