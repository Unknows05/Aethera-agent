import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { WebSocketServer } from "ws";
import type WebSocket from "ws";
import pc from "picocolors";
import { cors } from "hono/cors";
import { authenticateAgent, updateAgentConnection, updateAgentStats, pruneStaleAgents } from "./db.js";
import { registerAgent, addSharedLesson, recordSignalVote, getAggregatedSignals, updateGlobalWeight } from "./db.js";
import { authRoutes } from "./routes/auth.js";
import { signalRoutes } from "./routes/signal.js";
import { lessonRoutes } from "./routes/lesson.js";
import { statsRoutes } from "./routes/stats.js";

// ============================================================
// Rate Limiter — simple in-memory per-IP
// ============================================================
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function rateLimit(ip: string, maxRequests = 60, windowMs = 60000): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) return false;

  entry.count++;
  return true;
}

// Cleanup rate limit map every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 300_000).unref();

// Auto-prune stale agents (>24h since lastSeen) every 30 minutes
setInterval(() => {
  const pruned = pruneStaleAgents(24);
  if (pruned > 0) {
    console.log(pc.yellow(`  Auto-prune: removed ${pruned} stale agent(s)`));
  }
}, 1_800_000).unref();

const PORT = Number(process.env.PORT) || 8900;

// ============================================================
// App
// ============================================================
const app = new Hono();

app.use("*", cors({ origin: "*", allowMethods: ["GET", "POST"] }));

// Trust proxy — extract real IP behind Nginx
app.use("*", async (c, next) => {
  const forwarded = c.req.header("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "unknown";

  if (!rateLimit(ip, 60, 60000)) {
    return c.json({ ok: false, error: "Too many requests — rate limit 60/minute" }, 429);
  }

  await next();
});

app.route("/api/hivemind/auth", authRoutes);
app.route("/api/hivemind/signal", signalRoutes);
app.route("/api/hivemind/lesson", lessonRoutes);
app.route("/api/hivemind/stats", statsRoutes);

// REST fallback endpoints for agents without WS
app.post("/api/hivemind/trade/result", async (c) => {
  try {
    const { authenticateAgent, updateAgentStats } = await import("./db.js");
    const apiKey = c.req.header("x-api-key");
    if (!apiKey) return c.json({ ok: false, error: "Missing x-api-key header" }, 401);
    const agent = authenticateAgent(apiKey);
    if (!agent) return c.json({ ok: false, error: "Invalid apiKey" }, 401);

    const { win, pnl } = await c.req.json() as { win?: boolean; pnl?: number };
    updateAgentStats(agent.id, Boolean(win), Number(pnl) || 0);
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ ok: false, error: String(e) }, 400);
  }
});

app.get("/api/hivemind/weights", async (c) => {
  const { getGlobalWeights } = await import("./db.js");
  return c.json({ weights: getGlobalWeights() });
});

app.get("/health", (c) => c.json({ status: "ok", service: "aethera-hivemind-hub" }));

// ============================================================
// WebSocket
// ============================================================
type WsAgent = { ws: WebSocket; agentId: string; username: string; ip: string };
const connectedAgents: Map<string, WsAgent> = new Map();

interface WsMessage extends Record<string, unknown> {
  type: string;
  symbol?: string;
  direction?: string;
  confidence?: number;
  lesson?: Record<string, string>;
  tags?: string;
  win?: number;
  pnl?: number;
  signalName?: string;
  weight?: number;
}

const httpServer = serve(
  { fetch: app.fetch, port: PORT },
  (info) => {
    console.log(pc.cyan(`╔══════════════════════════════════════╗`));
    console.log(pc.cyan(`║  Aethera Hivemind Hub :${String(info.port).padEnd(20)}║`));
    console.log(pc.cyan(`║  SSL: https://aethera-s1.com        ║`));
    console.log(pc.cyan(`╚══════════════════════════════════════╝`));
    console.log(pc.cyan(`\n  Waiting for agents to connect...\n`));
  },
);

const wss = new WebSocketServer({ server: httpServer as unknown as import("node:http").Server });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const path = url.pathname;

  if (path !== "/api/hivemind/ws") {
    ws.close(4001, "Invalid path");
    return;
  }

  const apiKey = url.searchParams.get("api_key");
  if (!apiKey) {
    ws.close(4001, "Missing api_key");
    return;
  }

  const agent = authenticateAgent(apiKey);
  if (!agent) {
    ws.close(4001, "Invalid api_key — register first via POST /hivemind/auth/register");
    return;
  }

  const forwarded = req.headers["x-forwarded-for"];
  const ip = (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : req.socket.remoteAddress) || "unknown";

  updateAgentConnection(agent.id, 1);
  connectedAgents.set(agent.id, { ws: ws as unknown as WebSocket, agentId: agent.id, username: agent.username, ip });

  const welcome = { type: "connected", agentId: agent.id, username: agent.username };
  (ws as unknown as WebSocket).send(JSON.stringify(welcome));

  console.log(pc.green(`  ● ${agent.username} connected (${connectedAgents.size} online)`));
  broadcast({ type: "agent_join", username: agent.username, online: connectedAgents.size });

  // Per-agent WS rate limit: max 30 messages per 10 seconds
  let wsMsgCount = 0;
  let wsResetAt = Date.now() + 10000;

  (ws as unknown as WebSocket).on("message", (raw: Buffer) => {
    try {
      // Per-agent rate limit
      const now = Date.now();
      if (now > wsResetAt) { wsMsgCount = 0; wsResetAt = now + 10000; }
      wsMsgCount++;
      if (wsMsgCount > 30) {
        (ws as unknown as WebSocket).send(JSON.stringify({ type: "error", message: "Rate limit: max 30 messages per 10s" }));
        return;
      }

      const msg: WsMessage = JSON.parse(raw.toString());

      switch (msg.type) {
        case "signal_vote":
          recordSignalVote({
            id: crypto.randomUUID(),
            symbol: msg.symbol || "",
            direction: msg.direction || "WAIT",
            confidence: Number(msg.confidence) || 50,
            agentId: agent.id,
            funding_rate: msg.funding_rate != null ? Number(msg.funding_rate) : undefined,
            open_interest: msg.open_interest != null ? Number(msg.open_interest) : undefined,
            oi_change: msg.oi_change != null ? Number(msg.oi_change) : undefined,
            taker_buy_ratio: msg.taker_buy_ratio != null ? Number(msg.taker_buy_ratio) : undefined,
            top_long_short_ratio: msg.top_long_short_ratio != null ? Number(msg.top_long_short_ratio) : undefined,
            global_long_short_ratio: msg.global_long_short_ratio != null ? Number(msg.global_long_short_ratio) : undefined,
            depth_imbalance: msg.depth_imbalance != null ? Number(msg.depth_imbalance) : undefined,
            volume_24h: msg.volume_24h != null ? Number(msg.volume_24h) : undefined,
          });
          const aggregated = getAggregatedSignals(1);
          broadcast({ type: "signal_update", aggregated, timestamp: Date.now() });
          break;

        case "lesson_share":
          addSharedLesson({
            id: crypto.randomUUID(),
            agentId: agent.id,
            lessonJson: JSON.stringify(msg.lesson || {}),
            tags: (msg.tags as string) || "",
            win: Number(msg.win) || 0,
          });
          const summary = (msg.lesson as Record<string, string> | undefined)?.pattern || "New lesson shared";
          broadcast({ type: "lesson_broadcast", agentId: agent.id, username: agent.username, summary, timestamp: Date.now() });
          break;

        case "weight_update":
          updateGlobalWeight(msg.signalName as string, Number(msg.weight));
          broadcast({ type: "weight_update", signalName: msg.signalName, weight: msg.weight, timestamp: Date.now() });
          break;

        case "trade_result":
          updateAgentStats(agent.id, Boolean(msg.win), Number(msg.pnl));
          broadcast({ type: "trade_broadcast", agentId: agent.id, username: agent.username, win: msg.win, pnl: msg.pnl, timestamp: Date.now() });
          break;

        case "ping":
          (ws as unknown as WebSocket).send(JSON.stringify({ type: "pong" }));
          break;

        default:
          (ws as unknown as WebSocket).send(JSON.stringify({ type: "error", message: `Unknown type: ${msg.type}` }));
      }
    } catch {
      (ws as unknown as WebSocket).send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
    }
  });

  (ws as unknown as WebSocket).on("close", () => {
    updateAgentConnection(agent.id, 0);
    connectedAgents.delete(agent.id);
    console.log(pc.yellow(`  ○ ${agent.username} disconnected (${connectedAgents.size} online)`));
    broadcast({ type: "agent_leave", username: agent.username, online: connectedAgents.size });
  });
});

function broadcast(data: Record<string, unknown>): void {
  const msg = JSON.stringify({ ...data });
  for (const { ws } of connectedAgents.values()) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}
