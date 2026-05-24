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
import { analyzeTurn } from "../learning/post-turn-review.js";
import type { AppContext } from "../api/server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function startServer(): Promise<void> {
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

  const orchestrator: OrchestratorConfig = {
    binance,
    openrouter: orClient,
    appConfig: cfg,
    tradeHandler,
  };

  const startEquity = balance || 0;
  const startDate = Date.now();
  const getDaysElapsed = () => (Date.now() - startDate) / (1000 * 60 * 60 * 24);

  // Launch TUI as subprocess
  const tuiDir = join(__dirname, "..", "..", "tui");
  const distCli = join(tuiDir, "dist", "cli.js");
  let tuiProcess: ReturnType<typeof spawn> | null = null;

  if (existsSync(distCli) && process.stdout.isTTY) {
    tuiProcess = spawn("node", [distCli], {
      cwd: tuiDir,
      stdio: "inherit",
      env: { ...process.env, PORT: String(port) },
    });

    tuiProcess.on("exit", (code) => {
      console.log(`TUI exited (code: ${code})`);
    });
  } else if (!existsSync(distCli)) {
    console.log("TUI not built — run 'cd tui && npm run build' to build");
  }

  // Hivemind client
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

  // ================================================================
  // Agent Cycles — Scheduler
  // ================================================================
  const hunterMs = (cfg.screening?.agentHunterInterval ?? 1800) * 1000;
  const healerMs = (cfg.screening?.agentHealerInterval ?? 300) * 1000;

  console.log(`  Hunter   : every ${hunterMs / 1000}s`);
  console.log(`  Healer   : every ${healerMs / 1000}s`);
  console.log(`Ready on :${port}`);

  const hunterInterval = setInterval(async () => {
    console.log(`[${new Date().toISOString()}] Hunter cycle...`);
    try {
      const result = await runHunterCycle(orchestrator, startEquity, getDaysElapsed());
      broadcastUpdate({ type: "cycle", agent: "hunter", summary: result.llmResponse }, deps);
      for (const decision of result.decisions) {
        analyzeTurn({
          action: (decision.data?.action as string) || "",
          symbol: decision.data?.symbol as string,
          success: decision.success,
          error: decision.error,
        });
      }
      console.log(`  └─ ${result.decisions.length} decisions (${result.durationMs}ms)`);
    } catch (e) {
      console.error(`[${new Date().toISOString()}] Hunter error:`, e);
    }
  }, hunterMs);

  const healerInterval = setInterval(async () => {
    console.log(`[${new Date().toISOString()}] Healer cycle...`);
    try {
      const result = await runHealerCycle(orchestrator, startEquity, getDaysElapsed());
      if (result.decisions.length > 0) {
        broadcastUpdate({ type: "cycle", agent: "healer", summary: result.llmResponse }, deps);
        for (const decision of result.decisions) {
          analyzeTurn({
            action: (decision.data?.action as string) || "",
            symbol: decision.data?.symbol as string,
            success: decision.success,
            error: decision.error,
          });
        }
      }
      console.log(`  └─ ${result.decisions.length} decisions (${result.durationMs}ms)`);
    } catch (e) {
      console.error(`[${new Date().toISOString()}] Healer error:`, e);
    }
  }, healerMs);

  // Run first hunter cycle immediately
  setImmediate(async () => {
    console.log(`[${new Date().toISOString()}] Initial hunter cycle...`);
    try {
      const result = await runHunterCycle(orchestrator, startEquity, getDaysElapsed());
      broadcastUpdate({ type: "cycle", agent: "hunter", summary: result.llmResponse }, deps);
      console.log(`  └─ ${result.decisions.length} decisions (${result.durationMs}ms)`);
    } catch (e) {
      console.error(`[${new Date().toISOString()}] Initial hunter error:`, e);
    }
  });

  // Graceful shutdown
  const cleanup = () => {
    clearInterval(hunterInterval);
    clearInterval(healerInterval);
    if (tuiProcess) tuiProcess.kill();
    if (hc) hc.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}
