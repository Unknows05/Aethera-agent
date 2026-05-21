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

check_command() {
    if ! command -v "$1" &>/dev/null; then
        echo -e "${RED}✗ $1 not found. Please install it first.${NC}"
        return 1
    fi
    echo -e "${GREEN}✓ $1 found${NC}"
}

echo "Checking dependencies..."
check_command "git" || exit 1
check_command "node" || exit 1

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo -e "${RED}✗ Node.js 20+ required (found $(node -v))${NC}"
    echo -e "  Install via nvm: curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v | sed 's/v//')${NC}"
echo -e "${GREEN}✓ npm $(npm -v)${NC}"

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

echo -e "\n${CYAN}Setting up CLI...${NC}"
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"

cat > "$BIN_DIR/aethera" << WRAPPER
#!/usr/bin/env bash
AETHERA_ROOT="\${AETHERA_ROOT:-$INSTALL_DIR/agent}"
exec node "\$AETHERA_ROOT/dist/cli/index.js" "\$@"
WRAPPER
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

echo -e "\n${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Aethera v${VERSION} installed!           ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
echo -e ""
echo -e "  ${CYAN}Next steps:${NC}"
echo -e "    1. ${YELLOW}aethera init${NC}     — Setup wizard (Binance LLM config)"
echo -e "    2. ${YELLOW}aethera start${NC}    — Launch TUI"
echo -e "    3. ${YELLOW}aethera --help${NC}   — All commands"
echo -e ""
echo -e "  ${CYAN}Connect to Hivemind:${NC}"
echo -e "    Set in config.yaml:"
echo -e "      ${YELLOW}hivemind.enabled: true${NC}"
echo -e "      ${YELLOW}hivemind.hub: wss://hivemind.aethera-s1.com/api/hivemind/ws${NC}"
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
    exec node dist/cli/index.js init </dev/tty
fi

echo -e ""
echo -e "${CYAN}Note: If 'aethera' command not found, run:${NC}"
if [[ -f "$HOME/.zshrc" ]]; then
    echo -e "  ${CYAN}source ~/.zshrc${NC}"
else
    echo -e "  ${CYAN}source ~/.bashrc${NC}"
fi
