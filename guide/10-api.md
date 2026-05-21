# 10 — API Server

Hono REST API + WebSocket untuk komunikasi TUI dan eksternal.

## Files

```
src/api/
├── index.ts           # Re-export
├── server.ts          # Hono app + WebSocket setup
└── routes/
    ├── status.ts      # /api/status
    ├── signals.ts     # /api/signals
    └── learning.ts    # /api/learning
```

## Server Setup

```ts
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { WebSocketServer } from "ws";

type Variables = { deps: AppContext };
const app = new Hono<{ Variables: Variables }>();

app.use("*", async (c, next) => {
  c.set("deps", deps);
  await next();
});

app.route("/api/status", statusRoutes);
app.route("/api/signals", signalsRoutes);
app.route("/api/learning", learningRoutes);

// Direct routes
app.get("/api/health", (c) => c.json({ status: "ok", uptime: ... }));
app.get("/api/config", (c) => c.json({ growth: ..., screening: ... }));

// WebSocket
const wss = new WebSocketServer({ server: httpServer });
wss.on("connection", (ws) => {
  deps.wsClients.add(ws);
  ws.on("close", () => deps.wsClients.delete(ws));
  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === "ping") ws.send(JSON.stringify({ type: "pong" }));
  });
});
```

## Route Typing

Setiap route file harus declare Variables type:

```ts
// routes/status.ts
export const statusRoutes = new Hono<{ Variables: { deps: AppContext } }>();

statusRoutes.get("/", async (c) => {
  const deps = c.get("deps");
  // use deps.scanner, deps.config, etc.
});
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server health + uptime |
| GET | `/api/status` | Balance, positions, equity |
| GET | `/api/signals` | Current signals (top N via ?top=) |
| GET | `/api/signals/top` | Top N signals (?count=5) |
| GET | `/api/config` | Growth + screening config |
| GET | `/api/learning/lessons` | Stored lessons + performance |
| GET | `/api/learning/weights` | Darwinian weights summary |
| GET | `/api/learning/skills` | Curator skill summary |
| WS | `/ws` | Real-time TUI updates |

## WebSocket Message Types

```ts
// Server → Client
{ type: "connected", timestamp: number }
{ type: "update", status: SystemStatus, signals: Signal[], timestamp: number }
{ type: "trade", symbol: string, action: string, pnl: number }
{ type: "alert", message: string, level: "info" | "warning" | "critical" }
{ type: "cycle", agent: "hunter" | "healer", summary: string }

// Client → Server
{ type: "ping" }
```

## Broadcast Function

```ts
export function broadcastUpdate(data: Record<string, unknown>, deps: AppContext): void {
  const msg = JSON.stringify({ type: "update", ...data, timestamp: Date.now() });
  for (const ws of deps.wsClients) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}
```
