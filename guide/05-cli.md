# 5 — CLI

Command-line interface dengan 10 commands menggunakan @clack/prompts.

## Files

```
src/cli/
├── index.ts    # Entry + command router
├── init.ts     # Setup wizard
└── start.ts    # Server + TUI bootstrapper
```

## Command List

| Command | Description |
|---------|-------------|
| `init` | Setup wizard: API keys, model, growth config, DB |
| `start` | Start API server + launch TUI |
| `stop` | Stop all processes |
| `status` | View system status |
| `scan` | Run manual screening |
| `signals` | View current signals |
| `positions` | View open positions |
| `doctor` | Full system diagnostic |
| `config` | View/edit config |
| `daemon <start\|stop\|status\|logs>` | Background daemon |

## Init Wizard Flow

Menggunakan `@clack/prompts`:

```
❓ IP Address whitelisted? (y/N)
  → Jika No: tampilkan instruksi whitelist, minta konfirmasi lagi

❓ Binance API Key: [hidden input]
❓ Binance API Secret: [hidden input]
  → Verifikasi: fetch balance, jika gagal → retry

❓ OpenRouter API Key: [hidden input]
  → Test connection: fetch model list

❓ Primary model: [select] → deepseek/deepseek-chat
❓ Fallback model: [select] → google/gemini-2.0-flash (free)

❓ Target equity: [$1000]
❓ Target days: [21]
❓ Risk profile: [aggressive | moderate(R) | conservative]

  → Generate equity tiers
  → Save encrypted config
  → Inisialisasi database
  → Ask: "Start now?" → Ya → launch start
```

## Start Server

```ts
export async function startServer(): Promise<void> {
  const cfg = loadConfig();
  const binance = new BinanceClient(cfg.binance.apiKey, cfg.binance.apiSecret);
  const scanner = new Scanner(binance, cfg.screening);
  const tradeHandler = new TradeHandler();
  tradeHandler.setBinance(binance);

  const { port } = createServer({ config: cfg, scanner, tradeHandler, ... });

  // Launch TUI as subprocess
  if (existsSync("tui/dist/cli.js")) {
    spawn("node", ["tui/dist/cli.js"], { stdio: "inherit" });
  }
}
```

## Doctor Diagnostic

Checklist:
1. Binance API ping → OK/FAIL
2. Balance fetch → $XXX.XX
3. OpenRouter model fetch → ✓ 200+ models
4. Config validity → Zod parse
5. Data directory → exists
6. TUI build → exists / missing
