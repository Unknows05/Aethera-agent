import { Hono } from "hono";
import { serve, type ServerType } from "@hono/node-server";
import { WebSocketServer } from "ws";
import type WebSocket from "ws";
import type { Config } from "../config/schema.js";
import type { Scanner } from "../screening/index.js";
import type { TradeHandler } from "../orchestrator/tool-handlers/trade.js";
import { statusRoutes } from "./routes/status.js";
import { stateRoutes } from "./routes/state.js";
import { signalsRoutes } from "./routes/signals.js";
import { learningRoutes } from "./routes/learning.js";

export interface AppContext {
  config: Config;
  scanner: Scanner;
  tradeHandler: TradeHandler;
  startTime: number;
  wsClients: Set<WebSocket>;
}

type Variables = { deps: AppContext };

export function createServer(deps: AppContext): { app: Hono<{ Variables: Variables }>; port: number; stop: () => void } {
  const app = new Hono<{ Variables: Variables }>();

  app.use("*", async (c, next) => {
    c.set("deps", deps);
    await next();
  });

  app.route("/api/status", statusRoutes);
  app.route("/api/state", stateRoutes);
  app.route("/api/signals", signalsRoutes);
  app.route("/api/learning", learningRoutes);

  app.get("/api/health", (c) => c.json({ status: "ok", uptime: Date.now() - deps.startTime }));
  app.get("/api/config", (c) => c.json({ growth: deps.config.growth, screening: deps.config.screening }));

  const port = Number(process.env.PORT) || 8000;

  const httpServer = serve(
    { fetch: app.fetch, port },
    (info) => console.log(`API server running on :${info.port}`),
  ) as ServerType;

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Port ${port} already in use — is another agent running?`);
      console.error("Use a different PORT env or stop the existing agent first.");
    } else {
      console.error("Server error:", err.message);
    }
  });

  const wss = new WebSocketServer({ server: httpServer as unknown as import("node:http").Server });
  wss.on("error", (err) => {
    if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") return; // already logged by httpServer
    console.error("WebSocket error:", err.message);
  });
  wss.on("connection", (ws) => {
    deps.wsClients.add(ws as unknown as WebSocket);
    (ws as unknown as WebSocket).send(JSON.stringify({ type: "connected", timestamp: Date.now() }));

    (ws as unknown as WebSocket).on("close", () => {
      deps.wsClients.delete(ws as unknown as WebSocket);
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "ping") {
          (ws as unknown as WebSocket).send(JSON.stringify({ type: "pong" }));
        }
      } catch { /* ignore */ }
    });
  });

  return {
    app,
    port,
    stop: () => {
      wss.close();
      httpServer.close();
    },
  };
}

export function broadcastUpdate(data: Record<string, unknown>, deps: AppContext): void {
  const msg = JSON.stringify({ type: "update", ...data, timestamp: Date.now() });
  for (const ws of deps.wsClients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(msg);
    }
  }
}
