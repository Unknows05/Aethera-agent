import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadConfig } from "../config/index.js";
import { BinanceClient } from "../exchange/binance.js";
import { OpenRouterClient } from "../llm/client.js";
import { Scanner } from "../screening/scanner.js";
import type { Timeframe } from "../screening/types.js";
import { TradeHandler } from "../orchestrator/tool-handlers/trade.js";
import { HivemindClient } from "../hivemind/client.js";
import { createServer, broadcastUpdate } from "../api/server.js";
import { runHunterCycle, runHealerCycle } from "../orchestrator/index.js";
import type { OrchestratorConfig } from "../orchestrator/index.js";
import type { ToolResult } from "../orchestrator/tools.js";
import { positionStates, recordPositionClose } from "../orchestrator/tools.js";
import { analyzeTurn } from "../learning/post-turn-review.js";
import { appendDecision } from "../learning/decision-log.js";
import type { AppContext } from "../api/server.js";
import { loadStates } from "../state/positionStore.js";
import { TelegramNotifier } from "../notifier/telegram.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface StartOptions {
  noTui?: boolean;
}

export async function startServer(options?: StartOptions): Promise<void> {
  const cfg = loadConfig();

  console.log("Starting Aethera v2...");
  console.log(`  Exchange : Binance Futures (Mainnet)`);
  console.log(`  Hunter   : ${cfg.openrouter.primary}`);
  console.log(`  Healer   : ${cfg.openrouter.fallback[0]}`);
  console.log(`  Goal     : $${cfg.growth.targetEquity} in ${cfg.growth.targetDays} days`);

  const binance = new BinanceClient(cfg.binance.apiKey, cfg.binance.apiSecret);
  const orClient = new OpenRouterClient({
    apiKey: cfg.openrouter.apiKey,
    model: cfg.openrouter.primary,
    fallbackModels: cfg.openrouter.fallback,
    temperature: cfg.openrouter.temperature,
    maxTokens: cfg.openrouter.maxTokens,
  });

  const screeningConfig = cfg.screening ?? {};
  const scanner = new Scanner(binance, {
    maxCoins: screeningConfig.maxCoins,
    prefilterMinVolume: screeningConfig.prefilterMinVolume,
    timeframes: screeningConfig.timeframes as Timeframe[],
    adxThreshold: 25,
  });
  const tradeHandler = new TradeHandler();
  tradeHandler.setBinance(binance);

  let balance = 0;
  try {
    balance = await binance.getBalance();
    console.log(`  Balance  : $${balance.toFixed(2)} USDT`);
  } catch (e) {
    console.error("  Balance  : FAIL —", e instanceof Error ? e.message : e);
  }

  const wsClients = new Set<import("ws").default>();
  const { port } = createServer({
    config: cfg,
    scanner,
    tradeHandler,
    startTime: Date.now(),
    wsClients,
  });

  const deps: AppContext = {
    config: cfg,
    scanner,
    tradeHandler,
    startTime: Date.now(),
    wsClients,
  };

  // ── Telegram Notifier ──
  const telegram = new TelegramNotifier(cfg.telegram ?? { enabled: false, token: "", chatId: "" });

  // ── Restore persistent state ──
  const saved = loadStates();
  for (const [symbol, pos] of saved) {
    if (!positionStates.has(symbol)) {
      positionStates.set(symbol, pos as any);
    }
  }
  if (saved.size > 0) {
    console.log(`  Restored : ${saved.size} tracked positions from disk`);
  }

  // ── Retry helper ──
  async function withRetry<T>(label: string, fn: () => Promise<T>, maxRetries = 3): Promise<T | null> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error(`[${new Date().toISOString()}] ${label} error (attempt ${i + 1}/${maxRetries}):`, errMsg);
        if (i < maxRetries - 1) {
          await new Promise((r) => setTimeout(r, 5000 * (i + 1)));
        } else {
          telegram.notifyError(label, errMsg);
        }
      }
    }
    return null;
  }

  // Hivemind client — init BEFORE orchestrator so cycles can pull data
  let hc: HivemindClient | null = null;
  const hivemindCfg = cfg.hivemind;
  if (hivemindCfg?.enabled && hivemindCfg.apiKey) {
    hc = new HivemindClient({
      enabled: true,
      hub: hivemindCfg.hub,
      apiKey: hivemindCfg.apiKey,
      username: hivemindCfg.username || `agent_${Math.random().toString(36).slice(2, 8)}`,
    });

    hc.on((event) => {
      if (event.type === "signal_update") {
        const aggregated = event.aggregated as Array<{ symbol: string; longs: number; shorts: number; avgConfidence: number }>;
        if (aggregated?.length) {
          console.log(`  Hivemind: ${aggregated.length} aggregated signals`);
        }
      } else if (event.type === "lesson_broadcast") {
        console.log(`  Hivemind: lesson from ${event.username as string} — ${event.summary as string}`);
      }
    });

    hc.connect().catch(() => {});
    console.log(`  Hivemind : ${hivemindCfg.hub}`);
  } else {
    console.log(`  Hivemind : disabled`);
  }

  const orchestrator: OrchestratorConfig = {
    binance,
    openrouter: orClient,
    appConfig: cfg,
    tradeHandler,
    hivemind: hc,
    scanner,
  };

  const startEquity = balance || 0;
  const startDate = Date.now();
  const getDaysElapsed = () => (Date.now() - startDate) / (1000 * 60 * 60 * 24);

  // Launch TUI as subprocess
  const tuiDir = join(__dirname, "..", "..", "tui");
  const distCli = join(tuiDir, "dist", "cli.js");
  let tuiProcess: ReturnType<typeof spawn> | null = null;

  if (!options?.noTui && existsSync(distCli) && process.stdout.isTTY) {
    tuiProcess = spawn("node", [distCli], {
      cwd: tuiDir,
      stdio: "inherit",
      env: { ...process.env, PORT: String(port) },
    });

    tuiProcess.on("exit", (code) => {
      if (code === 0) {
        // q → exit agent + balik ke shell
        clearInterval(hunterInterval);
        clearInterval(healerInterval);
        if (hc) hc.disconnect();
        process.exit(0);
      } else {
        // TUI crash → tetep jalan tanpa TUI
        console.log(`TUI exited unexpectedly (code: ${code}) — continuing without TUI`);
      }
    });
    tuiProcess.on("error", () => {
      console.log("TUI failed to start — continuing without TUI");
    });
  } else if (!options?.noTui) {
    if (!process.stdout.isTTY && existsSync(distCli)) {
      console.log("No TTY available — TUI skipped");
    } else if (!existsSync(distCli)) {
      console.log("TUI not built — run 'cd tui && npm run build' to build");
    }
  }

  // ================================================================
  // Agent Cycles — Scheduler
  // ================================================================
  const hunterMs = (cfg.screening?.agentHunterInterval ?? 1800) * 1000;
  const healerMs = (cfg.screening?.agentHealerInterval ?? 300) * 1000;

  console.log(`  Hunter   : every ${hunterMs / 1000}s`);
  console.log(`  Healer   : every ${healerMs / 1000}s`);
  console.log(`Ready on :${port}`);

  telegram.notifyStartup(balance || 0);

  // Helper: push cycle data ke hivemind hub + decision log
  function afterCycle(result: import("../orchestrator/index.js").CycleResult): void {
    // Decision log
    for (const d of result.decisions) {
      const action = (d.data as Record<string, unknown>)?.action as string || "unknown";
      appendDecision({
        timestamp: new Date().toISOString(),
        agent: result.agent,
        type: action as any,
        symbol: (d.data as Record<string, unknown>)?.symbol as string,
        success: d.success,
        summary: d.success
          ? `${action} ${(d.data as Record<string, unknown>)?.symbol || ""}`
          : `FAILED ${action}: ${d.error || "unknown error"}`,
        error: d.error,
      });
    }

    if (!hc || !hc.status.connected) return;

    // Push screening signals with enrichment
    for (const signal of result.context.screening) {
      hc.publishSignal(signal.symbol, signal.direction, signal.confidence, {
        fundingRate: signal.fundingRate,
        openInterest: signal.openInterest,
        oiChange: signal.oiChange,
        takerBuyRatio: signal.takerBuyRatio,
        topLongShortRatio: signal.topLongShortRatio,
        globalLongShortRatio: signal.globalLongShortRatio,
        depthImbalance: signal.depthImbalance,
        volume24h: signal.volume24h,
      });
    }

    // Push trade decisions + results
    for (const d of result.decisions) {
      const action = (d.data as Record<string, unknown>)?.action as string | undefined;
      if (action === "open_long" || action === "open_short") {
        const symbol = (d.data as Record<string, unknown>)?.symbol as string | undefined;
        const confidence = (d.data as Record<string, unknown>)?.confidence as number | undefined;
        if (symbol) {
          hc.publishSignal(symbol, action === "open_long" ? "LONG" : "SHORT", confidence || 70);
        }
        hc.publishTradeResult(d.success, 0);
      }
      if (action === "close_position" || action === "partial_close") {
        const pnl = (d.data as Record<string, unknown>)?.pnl as number | undefined;
        hc.publishTradeResult(d.success, pnl || 0);
      }
    }
  }

  // Helper: push lesson ke hivemind dari analyzeTurn
  function pushLessonToHivemind(decision: import("../orchestrator/tools.js").ToolResult): void {
    if (!hc || !hc.status.connected) return;
    if (!decision.success && decision.error) {
      hc.publishLesson(
        { action: (decision.data as Record<string, unknown>)?.action as string, error: decision.error },
        "failure",
        false,
      );
    }
  }

  function logCycle(agent: string, result: { agent: string; decisions: ToolResult[]; llmResponse: unknown; durationMs: number }): void {
    const count = result.decisions.length;
    const successes = result.decisions.filter((d) => d.success).length;
    const errors = result.decisions.filter((d) => !d.success);
    const summary = result.llmResponse ? String(result.llmResponse).slice(0, 200) : "";

    if (count === 0) {
      console.log(`  └─ ${agent}: 0 decisions — no signals or model not responding (${result.durationMs}ms)`);
      return;
    }

    const actionSummary = result.decisions
      .map((d) => {
        const action = (d.data as Record<string, unknown>)?.action as string || "unknown";
        const symbol = (d.data as Record<string, unknown>)?.symbol as string || "";
        const err = d.error || "";
        return d.success ? `${action} ${symbol}` : `${action} ${symbol} FAILED: ${err.slice(0, 60)}`;
      })
      .join(" | ");

    console.log(`  └─ ${agent}: ${count} decisions (${successes} ok, ${errors.length} fail) — ${actionSummary} (${result.durationMs}ms)`);
    if (summary) console.log(`       └─ ${summary}`);
  }

  async function runCycleWithRetry(
    label: string,
    cycleFn: () => Promise<import("../orchestrator/index.js").CycleResult>,
  ): Promise<void> {
    console.log(`[${new Date().toISOString()}] ${label} cycle...`);
    const result = await withRetry(label, cycleFn);
    if (!result) return;

    if (result.decisions.length > 0 || label !== "Healer") {
      broadcastUpdate({ type: "cycle", agent: label.toLowerCase(), summary: result.llmResponse }, deps);
      afterCycle(result);
      for (const decision of result.decisions) {
        const action = (decision.data as Record<string, unknown>)?.action as string || "";
        const symbol = (decision.data as Record<string, unknown>)?.symbol as string || "";
        const review = analyzeTurn({
          action,
          symbol,
          success: decision.success,
          error: decision.error,
        });
        if (review.lessonsExtracted > 0) pushLessonToHivemind(decision);
        // Notify deploy/close
        if (decision.success && (action === "open_long" || action === "open_short")) {
          telegram.notifyDeploy(symbol, action === "open_long" ? "LONG" : "SHORT", 0, (decision.data as any)?.reason || "");
        }
        if (decision.success && action === "close_position") {
          telegram.notifyClose(symbol, "", 0, (decision.data as any)?.reason || "");
        }
      }
    }
    logCycle(label, result);
  }

  const hunterInterval = setInterval(() => runCycleWithRetry("Hunter", () => runHunterCycle(orchestrator, startEquity, getDaysElapsed())), hunterMs);
  const healerInterval = setInterval(() => runCycleWithRetry("Healer", () => runHealerCycle(orchestrator, startEquity, getDaysElapsed())), healerMs);

  // Run first hunter cycle immediately
  setImmediate(() => runCycleWithRetry("Hunter", () => runHunterCycle(orchestrator, startEquity, getDaysElapsed())));



  // Graceful shutdown
  const cleanup = async () => {
    console.log(`\n[${new Date().toISOString()}] Graceful shutdown initiated...`);

    let openPosCount = 0;
    let totalUnrealizedPnl = 0;
    try {
      const pos = await orchestrator.binance.getPositionRisk();
      const openPos = pos.filter((p) => Number(p.positionAmt) !== 0);
      openPosCount = openPos.length;
      if (openPos.length > 0) {
        console.log(`[${new Date().toISOString()}] Open positions (${openPos.length}):`);
        for (const p of openPos) {
          const amt = Number(p.positionAmt);
          const side = amt > 0 ? "LONG" : "SHORT";
          console.log(`  ${p.symbol} ${side} | Entry: $${Number(p.entryPrice)} | PnL: $${Number(p.unrealizedProfit).toFixed(2)}`);
        }
        totalUnrealizedPnl = openPos.reduce((s: number, p: { unrealizedProfit: string }) => s + Number(p.unrealizedProfit), 0);
        console.log(`[${new Date().toISOString()}] Total unrealized PnL: $${totalUnrealizedPnl.toFixed(2)}`);
      } else {
        console.log(`[${new Date().toISOString()}] No open positions.`);
      }
    } catch (e) {
      console.error(`[${new Date().toISOString()}] Error capturing positions:`, e);
    }

    clearInterval(hunterInterval);
    clearInterval(healerInterval);
    if (tuiProcess) tuiProcess.kill();
    if (hc) {
      try {
        hc.disconnect();
      } catch { /* ignore */ }
    }
    await telegram.notifyShutdown(openPosCount, totalUnrealizedPnl);
    console.log(`[${new Date().toISOString()}] Shutdown complete.`);
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}
