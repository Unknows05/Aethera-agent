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
- Hub: manual, port :8900
- Landing: Caddy file server, config at `conf.d/aethera-s1.com.caddy`
  `try_files {path}.html {path} {path}/index.html /index.html`

## Workflow

- Bahasa Indonesia unless English
- Never code without approval
- Deploy landing: `npm run build` in `landing/` → tar dist → scp → VPS extract
- Deploy agent: `npm run build` in `agent/` → scp dist → restart systemd
