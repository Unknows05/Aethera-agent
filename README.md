# Aethera v2 — Autonomous AI Trading Agent

AI-powered trading agent for Binance Futures Perpetual (USDT-M). Self-learning via LLM orchestrator, quant screening engine, and swarm intelligence network.

[Website](https://aethera-s1.com) · [Documentation](https://aethera-s1.com/docs/) · [Features](https://aethera-s1.com/features)

## Prerequisites

| Runtime | Minimum | Install |
|---------|---------|---------|
| **Node.js** | ≥20 | [nodejs.org](https://nodejs.org/) or [nvm](https://github.com/nvm-sh/nvm) |
| **Bun** | ≥1.0 | [bun.sh](https://bun.sh/) |
| **Git** | — | [git-scm.com](https://git-scm.com/) |

> **Note:** Only one runtime is needed. Bun is faster for development; Node.js is more widely supported.

## Install

### Linux / macOS

```bash
curl -fsSL https://raw.githubusercontent.com/Unknows05/Aethera-agent/main/install.sh | bash
```

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/Unknows05/Aethera-agent/main/install.ps1 | iex
```

The installer auto-detects Bun or Node.js, clones the repo, builds TypeScript, and creates the `aethera` CLI wrapper.

## Quick Start

```bash
aethera init           # Setup wizard: Binance API, LLM key, config
aethera start          # Launch trading (hunter + healer cycles)
aethera daemon start   # Background daemon (no TUI)
aethera status         # System status
aethera doctor         # Full system diagnostic
aethera --help         # All commands
```

## Architecture

```
LLM (OpenRouter) ──► Orchestrator ──► Hunter (30min) / Healer (5min)
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
      Screening Engine      Risk Engine
      7 indicators          Circuit breaker
      TF-weighted scoring   Kelly position sizing
      Regime detection      Volatility-adjusted leverage
              │                   │
              └─────────┬─────────┘
                        ▼
               TradeHandler ──► Binance Futures API
                        │
                        ▼
              Learning System
              Lessons from closed positions
              Darwinian signal weights
              Pool memory + cooldown
```

## Hivemind Network

Connect to the shared swarm intelligence network to share signals, lessons, and weights with other agents.

Configure in `agent/data/config.yaml`:

```yaml
hivemind:
  enabled: true
  hub: "wss://hivemind.aethera-s1.com/api/hivemind/ws"
  apiKey: "your-api-key"
  username: "your-agent-name"
```

Register an API key:

```bash
curl -X POST https://hivemind.aethera-s1.com/api/hivemind/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"my-agent","apiKey":"my-secret-key"}'
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `command not found: aethera` | Run `source ~/.zshrc` (or `source ~/.bashrc`) |
| `Node.js 20+ required` | Install via [nvm](https://github.com/nvm-sh/nvm): `curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh \| bash` |
| `npm install` fails | Check internet, try `npm install --no-optional` |
| Binance API error | Verify API keys in config. Ensure IP is whitelisted on Binance. |
| OpenRouter error | Check API key balance at [openrouter.ai](https://openrouter.ai/) |
| `aethera init` stuck | Press `Ctrl+C` and try `aethera doctor` to check connectivity |

## Uninstall

```bash
aethera uninstall
```

Removes the installation, data, config, and CLI wrapper.
