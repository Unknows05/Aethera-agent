# AGENTS.md — Aethera v2

## Repo Map

| Path | Role |
|------|------|
| `agent/` | Main app: CLI, exchange, LLM, screening, risk, learning, orchestrator, API, TUI, hivemind client |
| `hub/` | Hivemind hub server (WebSocket + REST, port 8900) |
| `landing/` | React 19 + Vite 8 + Tailwind 3.4 SPA |
| `guide/` | Step-by-step tutorial (11 modules, markdown) |
| `install.sh` / `install.ps1` | User-facing installers |

## Dev Commands (dari `agent/`)

- `npx vitest run` — semua test
- `npm run typecheck` — `tsc --noEmit`
- `npm run build` — `tsc` ke `dist/`
- `npm run build:tui` — `cd tui && npm run build`
- `npm start` / `npm run dev` — `tsx src/cli/index.ts`

**Order before commit**: `vitest run` → `typecheck` → `build`

## Architecture

- `src/cli/start.ts` boots API server (Hono :8000) + TUI subprocess + hunter/healer cycles + hivemind client
- Hunter (30min) screens & enters; Healer (5min) monitors & adjusts
- Secrets encrypted AES-256-GCM di `config.yaml`
- LLM 30s timeout, auto-fallback on 429

## Quirks

- **ESM only** (`"type": "module"`) — no `require()`, no CJS imports
- TypeScript strict, `moduleResolution: "bundler"`, target ES2022
- `tsx` runtime (not `ts-node`)
- better-sqlite3 native — needs build-essential / XCode CLI
- TUI is subprocess with own `package.json` di `agent/tui/`
- Agent + Hub standalone projects, same stack
- Installer CLI: `~/.local/bin/aethera` — PATH perlu di-source

## VPS

- `ssh febri@72.61.123.60` password `2902`
- Agent: systemd `aethera-agent.service` → port :8000
- Hub: systemd `aethera-hivemind.service` → port :8900
- Landing: Caddy file server, config at `conf.d/aethera-s1.com.caddy`
  `try_files {path}.html {path} {path}/index.html /index.html`

## Directory Structure

| Path | Role |
|------|------|
| `~/workspace/Aethera-project-v2/` | GitHub repo — source code, user-facing |
| `~/aethera-v2-VPS/` | VPS deployment — built dist, config.yaml, data |
| `~/hub/` | Hivemind hub — separate deployment |
| `~/apps/hivemind/` | Dashboard SPA — domain hivemind.aethera-s1.com |

## Deploy Agent (update dari repo)

```bash
cd ~/workspace/Aethera-project-v2 && git pull
rsync -av --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='*.md' ~/workspace/Aethera-project-v2/ ~/aethera-v2-VPS/
cd ~/aethera-v2-VPS/agent && npm install && npm run build
sudo systemctl restart aethera-agent
journalctl -u aethera-agent --since "1 min ago" --no-pager -n 30
```

## Workflow

- Bahasa Indonesia unless English
- Never code without approval
- Edit source di `~/workspace/Aethera-project-v2/`, deploy ke `~/aethera-v2-VPS/`
