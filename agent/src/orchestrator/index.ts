import { BinanceClient } from "../exchange/binance.js";
import { OpenRouterClient, type ChatMessage } from "../llm/client.js";
import { Scanner } from "../screening/scanner.js";
import type { ScoredCoin } from "../screening/types.js";
import type { Config } from "../config/schema.js";
import type { HivemindClient } from "../hivemind/client.js";
import { buildGoalState, buildContext, formatContextForLLM, type Context, type Lesson, type ScreeningResult } from "./context.js";
import { TOOL_DEFINITIONS, type ToolCall, type ToolResult } from "./tools.js";
import { TradeHandler } from "./tool-handlers/trade.js";

export type AgentType = "hunter" | "healer";

export interface OrchestratorConfig {
  binance: BinanceClient;
  openrouter: OpenRouterClient;
  appConfig: Config;
  tradeHandler: TradeHandler;
  hivemind: HivemindClient | null;
  scanner: Scanner;
}

export interface CycleResult {
  agent: AgentType;
  decisions: ToolResult[];
  context: Context;
  llmResponse: string | null;
  durationMs: number;
}

function parseToolCalls(llmResponse: unknown): ToolCall[] {
  if (!llmResponse || typeof llmResponse !== "object") return [];

  const resp = llmResponse as Record<string, unknown>;
  const choices = resp.choices as Array<Record<string, unknown>> | undefined;
  if (!choices || choices.length === 0) return [];

  const message = choices[0].message as Record<string, unknown> | undefined;
  if (!message) return [];

  const rawCalls = message.tool_calls;
  if (!Array.isArray(rawCalls)) return [];

  return rawCalls.map((tc) => ({
    id: (tc as Record<string, unknown>).id as string,
    type: "function" as const,
    function: {
      name: ((tc as Record<string, unknown>).function as Record<string, unknown>).name as string,
      arguments: ((tc as Record<string, unknown>).function as Record<string, unknown>).arguments as string,
    },
  }));
}

async function executeToolCall(
  call: ToolCall,
  ctx: Context,
  tradeHandler: TradeHandler,
): Promise<ToolResult> {
  const args = JSON.parse(call.function.arguments) as Record<string, unknown>;

  switch (call.function.name) {
    case "wait":
      return {
        toolCallId: call.id,
        success: true,
        data: { action: "wait", reason: args.reason as string },
      };

    case "open_long": {
      const symbol = args.symbol as string;
      const confidence = args.confidence as number;
      const signal = ctx.screening.find((s) => s.symbol === symbol);

      if (!signal || signal.direction !== "LONG") {
        return {
          toolCallId: call.id,
          success: false,
          error: `No LONG signal for ${symbol}`,
        };
      }

      const equity = ctx.account.equity;
      const tier = ctx.goal.riskTier;
      const riskAmount = equity * tier.maxRisk;
      const slDistance = signal.sl > 0
        ? Math.abs(signal.sl - (signal.sl < signal.tp ? signal.sl : signal.tp))
        : 0;
      const slPct = slDistance > 0 ? slDistance / (signal.sl < signal.tp ? signal.sl : signal.tp) : 0.02;
      const notional = riskAmount / slPct;
      const positionSize = notional > 0 ? notional / (signal.sl < signal.tp ? signal.sl : signal.tp) : 0;

      return tradeHandler.executeOpenLong(
        call.id,
        { symbol, confidence, reason: args.reason as string },
        ctx,
        positionSize,
        signal.sl,
        signal.tp,
        tier.maxLeverage,
      );
    }

    case "open_short": {
      const symbol = args.symbol as string;
      const confidence = args.confidence as number;
      const signal = ctx.screening.find((s) => s.symbol === symbol);

      if (!signal || signal.direction !== "SHORT") {
        return {
          toolCallId: call.id,
          success: false,
          error: `No SHORT signal for ${symbol}`,
        };
      }

      const equity = ctx.account.equity;
      const tier = ctx.goal.riskTier;
      const riskAmount = equity * tier.maxRisk;
      const slDistance = signal.sl > 0
        ? Math.abs(signal.sl - (signal.sl > signal.tp ? signal.sl : signal.tp))
        : 0;
      const slPct = slDistance > 0 ? slDistance / (signal.sl > signal.tp ? signal.sl : signal.tp) : 0.02;
      const notional = riskAmount / slPct;
      const positionSize = notional > 0 ? notional / (signal.sl > signal.tp ? signal.sl : signal.tp) : 0;

      return tradeHandler.executeOpenShort(
        call.id,
        { symbol, confidence, reason: args.reason as string },
        ctx,
        positionSize,
        signal.sl,
        signal.tp,
        tier.maxLeverage,
      );
    }

    case "close_position":
      return tradeHandler.executeClosePosition(call.id, args as { symbol: string; reason: string });

    case "partial_close":
      return tradeHandler.executePartialClose(
        call.id,
        args as { symbol: string; percent: number; reason: string },
      );

    case "trail_sl":
      return {
        toolCallId: call.id,
        success: true,
        data: { action: "trail_sl", ...args },
      };

    case "scan_market":
      return {
        toolCallId: call.id,
        success: true,
        data: { action: "scan_market", symbols: args.symbols },
      };

    case "add_lesson":
      return {
        toolCallId: call.id,
        success: true,
        data: { action: "add_lesson", ...args },
      };

    default:
      return {
        toolCallId: call.id,
        success: false,
        error: `Unknown tool: ${call.function.name}`,
      };
  }
}

async function gatherContext(
  binance: BinanceClient,
  config: Config,
  daysElapsed: number,
  startEquity: number,
  scanner: Scanner,
  hivemind: HivemindClient | null = null,
): Promise<Context> {
  let balance = 0;
  let positions = 0;
  let dailyPnl = 0;
  let btcPrice = 0;
  let btcChange24h = 0;
  let screening: ScreeningResult[] = [];

  try {
    balance = await binance.getBalance();
  } catch {
    /* use defaults */
  }

  try {
    const posRisk = await binance.getPositionRisk();
    positions = posRisk.filter((p) => Number(p.positionAmt) !== 0).length;
    dailyPnl = positions > 0
      ? posRisk
          .filter((p) => Number(p.positionAmt) !== 0)
          .reduce((sum, p) => sum + Number(p.unrealizedProfit), 0)
      : 0;
  } catch {
    /* use defaults */
  }

  // Run scanner — ini yg bikin LLM liat signal real
  try {
    const tickers = await binance.getTickers();
    const btc = tickers.find((t) => t.symbol === "BTCUSDT");
    if (btc) {
      btcPrice = Number(btc.lastPrice);
      btcChange24h = Number(btc.priceChangePercent);
    }
  } catch { /* non-blocking */ }

  try {
    const scanResult = await scanner.scan();
    screening = scanResult.coins
      .filter((c) => c.direction !== "WAIT")
      .slice(0, 20)
      .map((c) => ({
        symbol: c.symbol,
        score: c.score,
        direction: c.direction,
        confidence: c.confidence,
        regime: c.regime,
        reasons: c.reasons,
        sl: c.sl,
        tp: c.tp,
      }));
  } catch (e) {
    console.error("Scanner error:", e instanceof Error ? e.message : e);
  }

  // Pull shared lessons from hivemind hub
  let fetchedLessons: Lesson[] = [];
  if (hivemind) {
    try {
      const shared = await hivemind.fetchSharedLessons(10);
      fetchedLessons = shared as Lesson[];
    } catch { /* non-blocking */ }
  }

  const goal = buildGoalState(balance, startEquity, config, daysElapsed);

  return buildContext({
    market: {
      btcRegime: btcChange24h > 2 ? "bullish" : btcChange24h < -2 ? "bearish" : "neutral",
      btcPrice,
      btcChange24h,
      fundingAvg: 0,
      topGainers: screening.filter((s) => s.direction === "LONG").slice(0, 3).map((s) => s.symbol),
      topLosers: screening.filter((s) => s.direction === "SHORT").slice(0, 3).map((s) => s.symbol),
    },
    account: {
      balance,
      equity: balance,
      peakEquity: balance,
      openPositions: positions,
      dailyPnl,
      dailyTrades: 0,
    },
    screening,
    risk: {
      circuitBreakerActive: false,
      circuitBreakerReason: "",
      consecutiveLosses: 0,
      drawdown: 0,
      dailyLossPct: 0,
    },
    lessons: fetchedLessons,
    goal,
  });
}

export async function runHunterCycle(
  orchestrator: OrchestratorConfig,
  startEquity: number,
  daysElapsed: number,
): Promise<CycleResult> {
  const startTime = Date.now();

  const ctx = await gatherContext(
    orchestrator.binance,
    orchestrator.appConfig,
    daysElapsed,
    startEquity,
    orchestrator.scanner,
    orchestrator.hivemind,
  );

  // Multi-turn ReAct loop — max 3 langkah
  const systemMsg = {
    role: "system" as const,
    content: "You are an autonomous AI trading agent for Binance Futures. Your goal is to grow equity aggressively and compound profits. Use the available tools to make trading decisions. You can refuse to trade by calling wait(). Always explain your reasoning.",
  };

  const userMsg = {
    role: "user" as const,
    content: formatContextForLLM(ctx),
  };

  const messages: ChatMessage[] = [systemMsg, userMsg];
  const allDecisions: ToolResult[] = [];
  let lastRawResponse: unknown = null;
  let scannedSignals: ScreeningResult[] = ctx.screening;

  for (let step = 0; step < 3; step++) {
    const raw = await orchestrator.openrouter.chat(messages, TOOL_DEFINITIONS);
    lastRawResponse = raw;

    const toolCalls = parseToolCalls(raw);
    if (toolCalls.length === 0) break;

    // Push assistant's tool_calls message back so LLM remembers what it called
    const choices = (raw as unknown as Record<string, unknown>)?.choices as Array<Record<string, unknown>> | undefined;
    const rawMessage = choices?.[0]?.message as Record<string, unknown> | undefined;
    if (rawMessage) {
      messages.push(rawMessage as unknown as ChatMessage);
    }

    const stepResults = await Promise.all(
      toolCalls.map(async (call) => {
        // scan_market: execute scanner langsung
        if (call.function.name === "scan_market") {
          try {
            const scanResult = await orchestrator.scanner.scan();
            const coins = scanResult.coins.filter((c) => c.direction !== "WAIT").slice(0, 20);
            scannedSignals = coins.map((c) => ({
              symbol: c.symbol,
              score: c.score,
              direction: c.direction,
              confidence: c.confidence,
              regime: c.regime,
              reasons: c.reasons,
              sl: c.sl,
              tp: c.tp,
            }));
            return {
              toolCallId: call.id,
              success: true,
              data: { action: "scan_market", signals: scannedSignals, count: scannedSignals.length },
            } as ToolResult;
          } catch (e) {
            return {
              toolCallId: call.id,
              success: false,
              error: `Scan failed: ${e instanceof Error ? e.message : String(e)}`,
            } as ToolResult;
          }
        }

        // Update ctx screening dengan sinyal terbaru (dari scan atau init)
        const stepCtx = { ...ctx, screening: scannedSignals };
        return executeToolCall(call, stepCtx, orchestrator.tradeHandler);
      }),
    );

    allDecisions.push(...stepResults);

    // Feed hasil tool balik ke LLM sebagai "tool" role
    for (const r of stepResults) {
      messages.push({
        role: "tool",
        tool_call_id: r.toolCallId,
        content: JSON.stringify(r),
      } as ChatMessage);
    }
  }

  // Ringkas llmResponse — ambil cuma content + tool calls terakhir
  let summary = "No action taken";
  if (lastRawResponse) {
    try {
      const parsed = lastRawResponse as Record<string, unknown>;
      const choices = parsed.choices as Array<Record<string, unknown>> | undefined;
      const msg = choices?.[0]?.message as Record<string, unknown> | undefined;
      if (msg?.content && typeof msg.content === "string") summary = msg.content.slice(0, 300);
      else if (allDecisions.length > 0) {
        const actions = allDecisions.map((d) => d.data?.action || d.error || "?").filter(Boolean).join(", ");
        summary = `Executed: ${actions}`;
      }
    } catch { /* fallback */ }
  }

  return {
    agent: "hunter",
    decisions: allDecisions,
    context: { ...ctx, screening: scannedSignals },
    llmResponse: summary,
    durationMs: Date.now() - startTime,
  };
}

export async function runHealerCycle(
  orchestrator: OrchestratorConfig,
  startEquity: number,
  daysElapsed: number,
): Promise<CycleResult> {
  const startTime = Date.now();

  const ctx = await gatherContext(
    orchestrator.binance,
    orchestrator.appConfig,
    daysElapsed,
    startEquity,
    orchestrator.scanner,
    orchestrator.hivemind,
  );

  const positions = await orchestrator.binance.getPositionRisk();
  const openPositions = positions.filter((p) => Number(p.positionAmt) !== 0);

  if (openPositions.length === 0) {
    return {
      agent: "healer",
      decisions: [],
      context: ctx,
      llmResponse: null,
      durationMs: Date.now() - startTime,
    };
  }

  const positionSummary = openPositions
    .map((p) => {
      const amt = Number(p.positionAmt);
      return `${p.symbol} ${amt > 0 ? "LONG" : "SHORT"} | Entry: $${Number(p.entryPrice)} | PnL: ${Number(p.unrealizedProfit).toFixed(2)} | Liq: $${Number(p.liquidationPrice)}`;
    })
    .join("\n");

  const healerPrompt = `=== HEALER CYCLE ===
Manage existing positions. Decide for EACH position:
- hold (let it run)
- close_position (take profit or cut loss)
- partial_close (take profit partially)
- trail_sl (move SL to lock profit)

Open Positions:
${positionSummary}

Current Risk State:
- Equity: $${ctx.account.equity.toFixed(2)}
- Daily Loss: ${(ctx.risk.dailyLossPct * 100).toFixed(1)}%
- Drawdown: ${(ctx.risk.drawdown * 100).toFixed(1)}%

For each position, call the appropriate tool. If all positions are healthy, call wait().`;

  const llmResponse = await orchestrator.openrouter.chat(
    [
      {
        role: "system",
        content:
          "You are a position management agent. Close or adjust positions to protect capital and lock profits. Be conservative: prefer to lock profits when in doubt. No averaging down.",
      },
      { role: "user", content: healerPrompt },
    ],
    TOOL_DEFINITIONS,
  );

  const toolCalls = parseToolCalls(llmResponse);

  const results: ToolResult[] = [];
  for (const call of toolCalls) {
    const result = await executeToolCall(call, ctx, orchestrator.tradeHandler);
    results.push(result);
  }

  return {
    agent: "healer",
    decisions: results,
    context: ctx,
    llmResponse: JSON.stringify(llmResponse),
    durationMs: Date.now() - startTime,
  };
}
