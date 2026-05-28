# Aethera v2 — Autonomous AI Trading Agent

AI-powered perpetual futures trading agent for Binance. Self-learning via LLM orchestrator, quant screening, and swarm intelligence network.

## Prerequisites

- **Node.js** ≥20 ([nvm](https://github.com/nvm-sh/nvm) recommended)
- **Git**
- Binance Futures API key (testnet recommended first)
- OpenRouter API key ([openrouter.ai](https://openrouter.ai/keys))

## Install

```bash
git clone https://github.com/Unknows05/Aethera-agent
cd Aethera-agent/agent
npm install
```

## Setup

```bash
npm run setup
# or
npx aethera init
```

Wizard akan meminta:
1. Hivemind hub URL (opsional, enter untuk skip)
2. Binance API key + secret
3. OpenRouter API key + model
4. Telegram bot token (opsional)
5. Risk parameters (max drawdown, target equity, dll)

## Run

```bash
# Dry-run — tidak ada transaksi beneran
DRY_RUN=true npm start

# Live mode
npm start
```

### Mode

| Perintah | Keterangan |
|----------|------------|
| `npm start` | Hunter cycle (scan → LLM → buka) + Healer cycle (SL/TP/OOR) |
| `npm run dev` | Sama seperti start dengan development model |
| `npx aethera daemon start` | Background via PM2/systemd |

### Telegram Commands

Setelah setup Telegram, kirim ke bot:
- `/status` — balance + posisi
- `/positions` — detail posisi terbuka
- `/close ETHUSDT` — tutup posisi
- `/signals` — kandidat teratas
- `/network` — status hivemind

## Cara Kerja

```
Hunter cycle (30min)         Healer cycle (5min)
  Scan market                  Cek posisi terbuka
  Enrich (OI, funding, L/S)    Deterministic: SL/TP/OOR
  Hivemind consensus            LLM: hold/close/trail
  LLM → buka posisi             Telegram notifikasi
  Log + evolve threshold
```

Dua agen terpisah dengan tools berbeda:
- **Hunter**: scan_market, open_long, open_short, wait
- **Healer**: close_position, partial_close, trail_sl, wait

## Hivemind Network

Hubungkan ke swarm intelligence untuk berbagi sinyal dan pelajaran dengan agen lain.

```bash
curl -X POST https://hivemind.aethera-s1.com/api/hivemind/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"my-agent","apiKey":"my-secret-key"}'
```

## Uninstall

```bash
npx aethera uninstall
```

## Disclaimer

Risk tinggi. Mulai dengan `DRY_RUN=true` dan testnet. Bukan saran keuangan.
