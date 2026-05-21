import { BinanceClient } from "../exchange/binance.js";
import { OpenRouterClient } from "../llm/client.js";
import type { Config } from "../config/schema.js";
import { buildGoalState, buildContext, formatContextForLLM, type Context } from "./context.js";
import { TOOL_DEFINITIONS, type ToolCall, type ToolResult } from "./tools.js";
import { TradeHandler } from "./tool-handlers/trade.js";

export type AgentType = "hunter" | "healer";

export interface OrchestratorConfig {
  binance: BinanceClient;
  openrouter: OpenRouterClient;
  appConfig: Config;
  tradeHandler: TradeHandler;
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
): Promise<Context> {
  let balance = 0;
  let positions = 0;
  let dailyPnl = 0;

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

  const goal = buildGoalState(balance, startEquity, config, daysElapsed);

  return buildContext({
    market: {
      btcRegime: "unknown",
      btcPrice: 0,
      btcChange24h: 0,
      fundingAvg: 0,
      topGainers: [],
      topLosers: [],
    },
    account: {
      balance,
      equity: balance,
      peakEquity: balance,
      openPositions: positions,
      dailyPnl,
      dailyTrades: 0,
    },
    screening: [],
    risk: {
      circuitBreakerActive: false,
      circuitBreakerReason: "",
      consecutiveLosses: 0,
      drawdown: 0,
      dailyLossPct: 0,
    },
    lessons: [],
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
  );

  const prompt = formatContextForLLM(ctx);

  const llmResponse = await orchestrator.openrouter.chat(
    [
      {
        role: "system",
        content:
          "You are an autonomous AI trading agent for Binance Futures. Your goal is to grow equity aggressively and compound profits. Use the available tools to make trading decisions. You can refuse to trade by calling wait(). Always explain your reasoning.",
      },
      { role: "user", content: prompt },
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
    agent: "hunter",
    decisions: results,
    context: ctx,
    llmResponse: JSON.stringify(llmResponse),
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
