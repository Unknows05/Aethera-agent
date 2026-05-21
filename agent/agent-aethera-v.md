# Agent Guidelines — Aethera v2

## Overview
Autonomous AI crypto trading agent untuk Binance Futures Perpetual (USDT-M). TypeScript/Node.js runtime, self-learning via LLM orchestrator, quant screening engine.

| Item | Detail |
|------|--------|
| **Workspace** | `/home/febrian/Desktop/Aethera-project-v2/agent/` |
| **Hub** | `/home/febrian/Desktop/Aethera-project-v2/hub/` |
| **Runtime** | Node.js 20+ (Bun support via `globalThis.Bun` check) |
| **LLM** | OpenRouter (DeepSeek primary, Gemini fallback) |
| **Market** | Binance Futures USDT-M Perpetual (LONG + SHORT) |
| **Testing** | Vitest (48 tests, 4 test files) |
| **TUI** | TypeScript/Ink (React 18) di `tui/` |

---

## Conversation Flow — Cara Memulai Diskusi

Agar diskusi tidak hilang arah, ikuti flow ini setiap kali user memulai sesi baru:

### Step 1: Cek Status Proyek
```
□ Modul mana yang terakhir dikerjakan? (lihat Progress di bawah)
□ Ada error/test failure? → fix dulu sebelum lanjut
□ Ada PR/issue dari user? → prioritaskan
```

### Step 2: Tanya User
Kalau user bilang "continue" atau "lanjut" tanpa specify, tanya:
```
"Kita ada di <module terakhir>. Mau lanjut ke:
  1. <next task> — <alasan>
  2. <alternative> — <alasan>
  3. Yang lain?"
```

JANGAN langsung work tanpa konfirmasi — selalu tanya dulu.

### Step 3: Decision Tree
```
User request → Clarify scope? → Butuh review? → Review only → Lapor
                                         → Butuh fix? → Tanya item → Fix
                                         → New feature? → Tanya scope → Implement
```

### Step 4: Sebelum Edit
```
□ Jalankan npx vitest run → baseline tests
□ Jalankan npx tsc --noEmit → baseline typecheck
□ READ file yang akan diedit
□ Pahami konteks (import, pola, konvensi)
□ Jangan CODING sebelum ada approval eksplisit
```

### Step 5: Setelah Edit
```
□ npx vitest run → semua test masih pass
□ npx tsc --noEmit → typecheck clean
□ cd tui && npx tsc --noEmit && npm run build (jika ubah TUI)
□ curl test endpoint (jika ubah API)
□ Update todo/status
```

### Status Tracker — Selalu Update Setelah Kerja
```
## Session Log
| Tanggal | Durasi | Yang Dikerjakan | Status |
|---------|--------|-----------------|--------|
| -       | -      | -               | -      |
```

---

## Architecture

```
cli.tsx (entry) ──┬── aethera init   → Setup wizard
                   ├── aethera start  → API server (Hono :8000) + TUI subprocess
                   ├── aethera stop/status/scan/signals/positions/doctor
                   └── aethera daemon → Background autonomous mode

api/server.ts ──┬── REST: /api/status, /api/signals, /api/health, /api/config, /api/learning/*
                └── WebSocket /ws → real-time TUI updates

orchestrator/ ──┬── runHunterCycle (30min) → LLM decides: open_long/open_short/wait
                └── runHealerCycle (5min)  → LLM manages: close/partial_close/trail_sl

screening/ ──┬── Scanner multi-tier: 500 → 200 → 80 → 20 → 5
             ├── 7 indicators (RSI, MACD, Bollinger, ATR, ADX, Volume, EMA alignment)
             ├── TF-weighted scoring: 0.6×15m + 0.3×1h + 0.1×4h
             ├── Regime detection (ADX-based + microstructure override)
             └── Confidential calibration floor 40 cap 85

risk/ ──┬── Position sizing: Half Kelly f* = WR - (1-WR)/RR
        ├── Leverage: volatility-adjusted 1-5x
        ├── Circuit breaker: 5 proteksi
        ├── Daily goal: auto-calculate % + urgency multiplier
        └── Regime filter: block low-WR combos (SIDEWAYS+LONG, HIGH_VOL+SHORT)

learning/ ──┬── Lessons from closed positions (3-tier injection)
            ├── Pool memory: per-pair history + cooldown
            ├── Signal weights: Darwinian evolution ±5%
            └── Post-turn review: Hermes-style extract lessons

tui/ ────────┬── Ink+React Hermes-style: ChatPanel + StatusPanel + CommandInput
             ├── WebSocket connect → real-time updates
             └── Slash commands: /status /signals /scan /positions /health /filter
```

---

## Key Modules

| File | Purpose |
|------|---------|
| `src/config/schema.ts` | Zod config validation, equity tiers |
| `src/config/crypto.ts` | AES-256-GCM encrypt/decrypt secrets |
| `src/config/index.ts` | YAML loader/saver with encrypted secrets |
| `src/exchange/binance.ts` | Binance Futures REST client (16 methods) |
| `src/llm/client.ts` | OpenRouter client (200+ model fetch, auto-fallback 429) |
| `src/cli/init.ts` | @clack/prompts setup wizard |
| `src/cli/index.ts` | CLI entry 10 commands |
| `src/cli/start.ts` | Bootstrap server + dependencies |
| `src/orchestrator/context.ts` | Market+account+risk+screening+goal context |
| `src/orchestrator/tools.ts` | 8 tool definitions + hard rules |
| `src/orchestrator/tool-handlers/trade.ts` | Binance order execution |
| `src/orchestrator/index.ts` | Hunter + Healer cycles |
| `src/screening/scanner.ts` | Multi-tier pipeline |
| `src/screening/scorer.ts` | TF-weighted scoring |
| `src/screening/regime.ts` | ADX regime detection |
| `src/screening/microstructure.ts` | Orderbook + funding + L/S ratio |
| `src/screening/indicators/` | 7 indicator modules |
| `src/risk/position-sizing.ts` | Half Kelly calculator |
| `src/risk/leverage.ts` | Volatility-adjusted leverage |
| `src/risk/circuit-breaker.ts` | 5-layer protection |
| `src/risk/daily-goal.ts` | Target tracking |
| `src/risk/regime-filter.ts` | Low-WR blocklist |
| `src/risk/drawdown-recovery.ts` | 3-level recovery mode |
| `src/learning/lessons.ts` | Lesson engine |
| `src/learning/pool-memory.ts` | Per-pair memory + cooldown |
| `src/learning/signal-weights.ts` | Darwinian weights |
| `src/learning/curator.ts` | Skill lifecycle |
| `src/learning/post-turn-review.ts` | Hermes-style review |
| `src/api/server.ts` | Hono REST + WS |
| `tui/src/App.tsx` | TUI main app |

---

## Commands

### Developer
```bash
cd /home/febrian/Desktop/Aethera-project-v2/agent

# Core
npx tsx src/cli/index.ts init            # Setup wizard
npx tsx src/cli/index.ts start            # API server + TUI
npx tsx src/cli/index.ts stop             # Stop
npx tsx src/cli/index.ts status           # System status
npx tsx src/cli/index.ts scan             # Manual scan
npx tsx src/cli/index.ts signals          # View signals
npx tsx src/cli/index.ts positions        # Open positions
npx tsx src/cli/index.ts doctor           # Full diagnostic
npx tsx src/cli/index.ts daemon start     # Background daemon

# Dev
npm run dev            # tsx watch
npm run test           # vitest run
npm run typecheck      # tsc --noEmit
npm run build          # tsc build
npx vitest run         # 48 tests

# TUI
cd tui && npm run build   # Build TUI
cd tui && npx tsx src/cli.tsx  # Dev mode
```

---

## Critical Gotchas

### .env vs Config
- Secrets di-encrypt AES-256-GCM di `config.yaml`, bukan `.env`
- `config/crypto.ts` handles encrypt/decrypt dengan key dari `data/.key`

### Engine Initialization
- `start.ts` membuat Scanner, TradeHandler, dll — jangan buat instance baru
- Scanner butuh BinanceClient — passing dari start.ts
- TradeHandler.setBinance() harus dipanggil sebelum trade

### TUI Build Pipeline
- `tui/` uses TypeScript + Ink (React 18, NOT React 19)
- Must build: `cd tui && npm run build` sebelum start
- `start.ts` auto-launches TUI dari `tui/dist/cli.js`
- React 19 breaks Ink — keep `react@^18.3.1`

### WebSocket
- `/ws` endpoint di `api/server.ts` — real-time TUI updates
- TUI connects via WebSocket native API
- Ping every 30s
- Reconnect setiap 3s jika putus

### API Routes Typing
- Routes harus declare `Hono<{ Variables: { deps: AppContext } }>`
- `c.get("deps")` untuk akses dependencies

### Screening Pipeline
- Scanner multi-tier: discover → prefilter volume 200 → quickscore 80 → fullscore 20 → session filter
- Microstructure hanya fetch jika score 45-65 (borderline)
- Batch parallel 10 workers per chunk

### Risk Integration
- Circuit breaker cek SEBELUM trade execution
- Regime filter jalan di scoring, bukan post-trade
- Daily goal urgency multiplier: ahead 0.8×, behind 1.2×, critical 1.5×

### Learning Flow
- Lessons dari closed position (via `recordPerformance`)
- Signal weights recalc setiap 10 sample
- Post-turn review setelah hunter/healer cycle
- Pool memory cooldown mencegah repeated OOR dalam 7 hari

### Data Directory
- `data/` contains: DB, logs, PID, state, vault index
- All gitignored

---

## Testing Verification

```bash
# Quick
npx vitest run                         # 48 tests
npx tsc --noEmit                       # Root typecheck
cd tui && npx tsc --noEmit && npm run build  # TUI typecheck + build

# API
curl http://localhost:8000/api/health
curl http://localhost:8000/api/status
curl http://localhost:8000/api/signals

# TUI
cd tui && node dist/cli.js

# Import verification
npx tsx -e "import { Scanner } from './src/screening/scanner.js'; console.log('OK')"
npx tsx -e "import { createServer } from './src/api/server.js'; console.log('OK')"
```

---

## Version History
- **v2.0** — TypeScript rewrite: Binance Futures perpetual, LLM orchestrator, screening engine, risk engine, learning system (Hermes-style), Hono API + WebSocket, Ink TUI

---

## Checklist Sebelum Edit Code
- [ ] Apakah user minta review saja? → STOP, jangan edit
- [ ] Apakah user minta fix? → Tanya item mana
- [ ] Run `npx vitest run` sebelum commit
- [ ] Run `npx tsc --noEmit` untuk typecheck
- [ ] Jika ubah API → test endpoint dengan curl
- [ ] Jika ubah TUI → `cd tui && npm run build`
