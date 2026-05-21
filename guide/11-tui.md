# 11 — TUI (Ink + React)

Terminal User Interface dengan layout Hermes-style: agent chat log + status panel + command input.

## File Structure

```
tui/
├── package.json
├── tsconfig.json
└── src/
    ├── cli.tsx              # Entry point (Ink render)
    ├── App.tsx              # Main app: Header + Chat + Status + Input
    ├── types.ts             # TypeScript interfaces
    ├── api.ts               # HTTP + WebSocket helpers
    └── components/
        ├── header.tsx       # Top bar: mode, balance, cycles
        ├── chat-panel.tsx   # Left panel: agent log
        ├── status-panel.tsx # Right panel: status + positions
        └── input.tsx        # Bottom: command input
```

## Package.json

```json
{
  "name": "aethera-tui",
  "type": "module",
  "dependencies": {
    "ink": "^5.0.1",
    "react": "^18.3.1",
    "meow": "^13.2.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@inkjs/ui": "^2.0.0",
    "typescript": "~5.8.0",
    "tsx": "^4.21.0"
  }
}
```

## Entry Point (`cli.tsx`)

```tsx
import { render } from "ink";
import meow from "meow";
import App from "./App.js";

const cli = meow(`...`, {
  flags: { baseUrl: { type: "string", default: "http://127.0.0.1:8000" } },
});

render(<App baseUrl={cli.flags.baseUrl} />);
```

## App Component Layout

```
┌──────────────────────────────────────────────────┐
│ Header: "Aethera v2 [LIVE] ● $1,234.56 Cycles:5" │
├────────────────────────┬─────────────────────────┤
│    Agent Log           │    Status Panel          │
│                        │                         │
│  [HUNTER] BTC LONG     │  Balance: $1,234.56     │
│  [HEALER] Hold ETH     │  Positions: 2           │
│  System: Scan done     │  Signals: 3L / 1S / 2W  │
│  [HUNTER] Wait...      │  Cycles: 5              │
│                        │                         │
│                        │  Positions:              │
│                        │  BTCUSDT LONG           │
│                        │  Size: 0.01 | Lev: 3x   │
│                        │  PnL: +$12.34           │
│                        │                         │
│                        │  Top:                   │
│                        │  BTCUSDT LONG 75% 82    │
│                        │  ETHUSDT SHORT 68% 71   │
├────────────────────────┴─────────────────────────┤
│ ❯ /status                                        │
│ q=quit  /status  /signals  /scan  /positions ...  │
└──────────────────────────────────────────────────┘
```

## WebSocket Connection

```tsx
useEffect(() => {
  const ws = new WebSocket(`ws://${host}/ws`);

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    switch (msg.type) {
      case "update":
        if (msg.status) setStatus(msg.status);
        if (msg.signals) setSignals(msg.signals);
        break;
      case "trade":
        addMessage("system", `Trade: ${msg.symbol} ${msg.action}`);
        break;
      case "alert":
        addMessage("system", `[${msg.level}] ${msg.message}`);
        break;
      case "cycle":
        addMessage("hunter", msg.summary);
        break;
    }
  };

  // Reconnect every 3s on close
  ws.onclose = () => setTimeout(connect, 3000);
}, []);
```

## Slash Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/status` | Fetch and display system status |
| `/signals` | Show current signals (15 max) |
| `/scan` | Trigger market scan |
| `/positions` | Show open positions |
| `/health` | API health check |
| `/clear` | Clear agent log |
| `/filter <symbol>` | Filter signals by symbol |
| `q` | Quit TUI |

## Build Pipeline

```bash
cd tui
npm run build     # tsc → dist/cli.js
node dist/cli.js  # Run built version
npx tsx src/cli.tsx  # Dev mode (hot reload)
```

## Key Gotchas
- **React 18 ONLY**: React 19 breaks Ink — pin `react@^18.3.1`
- **WebSocket**: Native API vs `ws` library — TUI pakai WebSocket native (browser API)
- **Reconnection**: Auto reconnect setiap 3 detik jika koneksi putus
- **Ping/Pong**: Keep-alive setiap 30 detik
