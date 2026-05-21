# Aethera v2 — Tutorial Lengkap

Panduan step-by-step membangun Autonomous AI Trading Agent untuk Binance Futures Perpetual dari nol.

## Daftar Isi

| # | Modul | File |
|---|-------|------|
| 1 | **Setup & Scaffolding** | [guide/01-scaffolding.md](./01-scaffolding.md) |
| 2 | **Config Module** | [guide/02-config.md](./02-config.md) |
| 3 | **Exchange (Binance)** | [guide/03-exchange.md](./03-exchange.md) |
| 4 | **LLM (OpenRouter)** | [guide/04-llm.md](./04-llm.md) |
| 5 | **CLI** | [guide/05-cli.md](./05-cli.md) |
| 6 | **Screening Engine** | [guide/06-screening.md](./06-screening.md) |
| 7 | **Risk Engine** | [guide/07-risk.md](./07-risk.md) |
| 8 | **Learning System** | [guide/08-learning.md](./08-learning.md) |
| 9 | **Orchestrator** | [guide/09-orchestrator.md](./09-orchestrator.md) |
| 10 | **API Server** | [guide/10-api.md](./10-api.md) |
| 11 | **TUI (Ink+React)** | [guide/11-tui.md](./11-tui.md) |

## Tech Stack

| Layer | Pilihan | Alasan |
|-------|---------|--------|
| Runtime | Node.js 20+ (juga support Bun) | `better-sqlite3` binding, ecosystem matang |
| Framework | Hono (REST + WS), Ink (TUI) | Ringan, cepat, type-safe |
| Language | TypeScript (strict) | Type safety kritis untuk financial logic |
| LLM | OpenRouter API | 200+ model, dynamic fetch, multi-tier routing |
| Database | better-sqlite3 (FTS5) | Embedded, zero config |
| Encryption | AES-256-GCM (Node crypto) | Secrets protection |
| Validation | Zod | Runtime + type safety |
| Testing | Vitest | Cepat, compatible TS |

## Summary Arsitektur

```
User ──► CLI ──► API (Hono :8000) ──► Scanner ──► Indicators
                │                           └──► Regime + Microstructure
                ├──► Orchestrator ──► LLM (OpenRouter)
                │         │
                │    ┌────┴────┐
                │    │         │
                │  Hunter    Healer
                │  (30min)   (5min)
                │    │         │
                │    ▼         ▼
                │  TradeHandler ──► Binance Futures API
                │
                ├──► Risk Engine (pre-trade gate)
                │
                └──► WebSocket ──► TUI (Ink+React)
```

Setiap modul dibangun independen, di-test dengan Vitest, dan diintegrasikan lewat `start.ts`.
