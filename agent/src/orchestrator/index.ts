import { BinanceClient } from "../exchange/binance.js";
import { OpenRouterClient, type ChatMessage } from "../llm/client.js";
import { Scanner } from "../screening/scanner.js";
import type { ScoredCoin } from "../screening/types.js";
import type { Config } from "../config/schema.js";
import type { HivemindClient } from "../hivemind/client.js";
import { buildGoalState, buildContext, formatContextForLLM, type Context, type Lesson, type ScreeningResult } from "./context.js";
import {
  HUNTER_TOOLS,
  HEALER_TOOLS,
  checkHardRules,
  recordPositionOpen,
  recordPositionClose,
  markActionExecuted,
  resetSessionGuard,
  activateCircuitBreaker,
  resetCircuitBreaker,
  getCircuitBreakerState,
  positionStates,
  type PositionState,
  type ToolCall,
  type ToolResult,
} from "./tools.js";
import { TradeHandler } from "./tool-handlers/trade.js";
import { getLessonsForPrompt } from "../learning/lessons.js";

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

  // Standard tool_calls dari API
  const rawCalls = message.tool_calls;
  if (Array.isArray(rawCalls) && rawCalls.length > 0) {
    return rawCalls.map((tc) => ({
      id: (tc as Record<string, unknown>).id as string,
      type: "function" as const,
      function: {
        name: ((tc as Record<string, unknown>).function as Record<string, unknown>).name as string,
        arguments: ((tc as Record<string, unknown>).function as Record<string, unknown>).arguments as string,
      },
    }));
  }

  // Fallback: model gak support tools → parse JSON dari content
  const content = message.content as string | undefined;
  if (!content) return [];

  try {
    const parsed = JSON.parse(content) as { tool?: string; arguments?: Record<string, unknown> };
    if (parsed.tool) {
      return [{
        id: `text_${Date.now()}`,
        type: "function" as const,
        function: {
          name: parsed.tool,
          arguments: JSON.stringify(parsed.arguments || {}),
        },
      }];
    }
  } catch { /* not JSON */ }

  // Cari JSON dalam text content
  const jsonMatch = content.match(/\{[\s\S]*"tool"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { tool?: string; arguments?: Record<string, unknown> };
      if (parsed.tool) {
        return [{
          id: `text_${Date.now()}`,
          type: "function" as const,
          function: {
            name: parsed.tool,
            arguments: JSON.stringify(parsed.arguments || {}),
          },
        }];
      }
    } catch { /* ignore */ }
  }

  return [];
}

async function executeToolCall(
  call: ToolCall,
  ctx: Context,
  tradeHandler: TradeHandler,
): Promise<ToolResult> {
  const args = JSON.parse(call.function.arguments) as Record<string, unknown>;
  const action = call.function.name;
  const symbol = (args.symbol as string) || "";

  // ── LAYER 1: Hard Rules Check (circuit breaker + drawdown + once-per-session) ──
  const ruleCheck = checkHardRules(action, args, ctx);
  if (!ruleCheck.allowed) {
    return {
      toolCallId: call.id,
      success: false,
      error: `Hard rule blocked: ${ruleCheck.reason}`,
    };
  }

  switch (action) {
    case "wait":
      return {
        toolCallId: call.id,
        success: true,
        data: { action: "wait", reason: args.reason as string },
      };

    case "open_long": {
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

      const result = await tradeHandler.executeOpenLong(
        call.id,
        { symbol, confidence, reason: args.reason as string },
        ctx,
        positionSize,
        signal.sl,
        signal.tp,
        tier.maxLeverage,
      );

      // Record position state on success
      if (result.success) {
        recordPositionOpen({
          symbol,
          side: "LONG",
          entryPrice: (result.data?.entryPrice as number) || 0,
          slPrice: signal.sl,
          tpPrice: signal.tp,
          openTime: Date.now(),
          size: positionSize,
          leverage: tier.maxLeverage,
        });
        markActionExecuted(action, symbol);
      }
      return result;
    }

    case "open_short": {
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

      const result = await tradeHandler.executeOpenShort(
        call.id,
        { symbol, confidence, reason: args.reason as string },
        ctx,
        positionSize,
        signal.sl,
        signal.tp,
        tier.maxLeverage,
      );

      // Record position state on success
      if (result.success) {
        recordPositionOpen({
          symbol,
          side: "SHORT",
          entryPrice: (result.data?.entryPrice as number) || 0,
          slPrice: signal.sl,
          tpPrice: signal.tp,
          openTime: Date.now(),
          size: positionSize,
          leverage: tier.maxLeverage,
        });
        markActionExecuted(action, symbol);
      }
      return result;
    }

    case "close_position": {
      const result = await tradeHandler.executeClosePosition(call.id, args as { symbol: string; reason: string });
      if (result.success) {
        recordPositionClose(symbol);
        markActionExecuted(action, symbol);
      }
      return result;
    }

    case "partial_close": {
      const result = await tradeHandler.executePartialClose(
        call.id,
        args as { symbol: string; percent: number; reason: string },
      );
      if (result.success) {
        // If 100% close, remove position state
        const percent = args.percent as number;
        if (percent >= 100) {
          recordPositionClose(symbol);
        }
        markActionExecuted(action, symbol);
      }
      return result;
    }

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
  let fundingAvg = 0;
  const topOpenInterest: Array<{ symbol: string; oi: number }> = [];
  const lsDivergences: Array<{ symbol: string; topRatio: number; globalRatio: number; divergence: number }> = [];
  let screening: ScreeningResult[] = [];
  const errors: string[] = [];

  try {
    balance = await binance.getBalance();
  } catch (e) {
    errors.push(`balance: ${e instanceof Error ? e.message : e}`);
  }

  try {
    const posRisk = await binance.getPositionRisk();
    positions = posRisk.filter((p) => Number(p.positionAmt) !== 0).length;
    dailyPnl = positions > 0
      ? posRisk
          .filter((p) => Number(p.positionAmt) !== 0)
          .reduce((sum, p) => sum + Number(p.unrealizedProfit), 0)
      : 0;
  } catch (e) {
    errors.push(`positions: ${e instanceof Error ? e.message : e}`);
  }

  // BTC price + funding dari premiumIndex
  try {
    const premiumIndices = await binance.getPremiumIndices();
    const btc = premiumIndices.find((p) => p.symbol === "BTCUSDT");
    if (btc) {
      btcPrice = Number(btc.markPrice);
      btcChange24h = 0; // premiumIndex gak punya change — pake ticker
    }
    // funding avg dari semua perpetual
    const fundingRates = premiumIndices.map((p) => Number(p.lastFundingRate)).filter((f) => f !== 0);
    if (fundingRates.length > 0) {
      fundingAvg = fundingRates.reduce((s, f) => s + f, 0) / fundingRates.length;
    }
  } catch (e) {
    errors.push(`premiumIndex: ${e instanceof Error ? e.message : e}`);
  }

  // BTC 24h change dari ticker
  try {
    const tickers = await binance.getTickers();
    const btcTicker = tickers.find((t) => t.symbol === "BTCUSDT");
    if (btcTicker) {
      btcPrice = btcPrice || Number(btcTicker.lastPrice);
      btcChange24h = Number(btcTicker.priceChangePercent);
    }
  } catch (e) {
    errors.push(`ticker: ${e instanceof Error ? e.message : e}`);
  }

  // Scanner
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
        fundingRate: c.fundingRate,
        openInterest: c.openInterest,
        oiChange: c.oiChange,
        takerBuyRatio: c.takerBuyRatio,
        topLongShortRatio: c.topLongShortRatio,
        globalLongShortRatio: c.globalLongShortRatio,
        depthImbalance: c.depthImbalance,
        volume24h: c.volume24h,
      }));

    // OI top dari hasil enrichment
    const withOI = scanResult.coins.filter((c) => c.openInterest && c.openInterest > 0);
    withOI.sort((a, b) => (b.openInterest || 0) - (a.openInterest || 0));
    topOpenInterest.push(...withOI.slice(0, 10).map((c) => ({ symbol: c.symbol, oi: c.openInterest || 0 })));

    // L/S divergence: top trader vs global ratio
    for (const c of scanResult.coins.slice(0, 20)) {
      if (c.topLongShortRatio && c.topLongShortRatio > 0 && c.globalLongShortRatio && c.globalLongShortRatio > 0) {
        const divergence = c.topLongShortRatio - c.globalLongShortRatio;
        if (Math.abs(divergence) > 0.3) {
          lsDivergences.push({ symbol: c.symbol, topRatio: c.topLongShortRatio, globalRatio: c.globalLongShortRatio, divergence });
        }
      }
    }
  } catch (e) {
    errors.push(`scanner: ${e instanceof Error ? e.message : e}`);
  }

  // Local lessons
  const localLessons = getLessonsForPrompt({ agentType: "hunter", maxLessons: 10 });

  // Shared lessons from hivemind hub
  let fetchedLessons: Lesson[] = [];
  if (hivemind) {
    try {
      const shared = await hivemind.fetchSharedLessons(10);
      fetchedLessons = shared as Lesson[];
    } catch (e) {
      errors.push(`hivemind: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Merge lessons: local dulu baru shared
  const allLessons: Lesson[] = [...fetchedLessons];
  if (localLessons) {
    const lines = localLessons.split("\n");
    for (const line of lines) {
      allLessons.push({
        rule: line.replace(/^[📌 ]*/, ""),
        tags: [],
        outcome: "manual",
        confidence: 50,
        pinned: false,
      });
    }
  }

  const goal = buildGoalState(balance, startEquity, config, daysElapsed);

  return buildContext({
    market: {
      btcRegime: btcChange24h > 2 ? "bullish" : btcChange24h < -2 ? "bearish" : "neutral",
      btcPrice,
      btcChange24h,
      fundingAvg,
      topGainers: screening.filter((s) => s.direction === "LONG").slice(0, 3).map((s) => s.symbol),
      topLosers: screening.filter((s) => s.direction === "SHORT").slice(0, 3).map((s) => s.symbol),
      topOpenInterest,
      lsDivergences,
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
    lessons: allLessons,
    goal,
  });
}

export async function runHunterCycle(
  orchestrator: OrchestratorConfig,
  startEquity: number,
  daysElapsed: number,
): Promise<CycleResult> {
  const startTime = Date.now();

  // Reset session guard for fresh cycle
  resetSessionGuard();

  const ctx = await gatherContext(
    orchestrator.binance,
    orchestrator.appConfig,
    daysElapsed,
    startEquity,
    orchestrator.scanner,
    orchestrator.hivemind,
  );

  // Auto-reset circuit breaker if condition resolved
  const cb = getCircuitBreakerState();
  if (cb.active && ctx.risk.drawdown < 0.20) {
    resetCircuitBreaker();
    console.log(`[${new Date().toISOString()}] Circuit breaker auto-reset: drawdown back to ${(ctx.risk.drawdown * 100).toFixed(1)}%`);
  }

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

  for (let step = 0; step < 10; step++) {
    const raw = await orchestrator.openrouter.chat(messages, HUNTER_TOOLS);
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
  let llmReason = "";
  if (lastRawResponse) {
    try {
      const parsed = lastRawResponse as Record<string, unknown>;
      const choices = parsed.choices as Array<Record<string, unknown>> | undefined;
      const message = choices?.[0]?.message as Record<string, unknown> | undefined;
      if (message?.content) {
        summary = String(message.content).slice(0, 300);
        llmReason = summary;
      }
    } catch { /* fallback */ }
  }

  // Fallback auto-execute: jika LLM tidak menghasilkan keputusan, execute berdasarkan scanner signal
  if (allDecisions.length === 0 && scannedSignals.length > 0) {
    const bestSignals = scannedSignals
      .filter((s) => s.direction !== "WAIT")
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 2);

    if (bestSignals.length > 0) {
      const fallbackReason = llmReason
        ? `Model responded with text only (no tool calls): "${llmReason.slice(0, 100)}". Falling back to auto-execute.`
        : `Model produced 0 tool calls. Falling back to auto-execute.`;

      for (const signal of bestSignals) {
        const fakeCall: ToolCall = {
          id: `fallback_${signal.symbol}_${Date.now()}`,
          type: "function",
          function: {
            name: signal.direction === "LONG" ? "open_long" : "open_short",
            arguments: JSON.stringify({
              symbol: signal.symbol,
              confidence: signal.confidence,
              reason: `AUTO: ${signal.reasons?.[0] || "signal detected"} (confidence ${signal.confidence})`,
            }),
          },
        };
        const fallbackCtx = { ...ctx, screening: scannedSignals };
        const result = await executeToolCall(fakeCall, fallbackCtx, orchestrator.tradeHandler);
        allDecisions.push(result);
        summary = `${fallbackReason} Auto-executed ${signal.direction} ${signal.symbol} (confidence ${signal.confidence}).`;
      }
    }
  }

  return {
    agent: "hunter",
    decisions: allDecisions,
    context: { ...ctx, screening: scannedSignals },
    llmResponse: summary,
    durationMs: Date.now() - startTime,
  };
}

const OOR_THRESHOLD_MS = 48 * 60 * 60 * 1000; // 48 jam
const MIN_YIELD_PCT = 0.3; // 0.3% minimal gain per jam
const SL_PCT = 0.025; // 2.5% dari entry untuk SL
const TP_PCT = 0.05; // 5% dari entry untuk TP

interface DeterministicAction {
  symbol: string;
  side: "LONG" | "SHORT";
  action: "close_position";
  reason: string;
}

function calcPnlPct(pos: { side: string; entryPrice: number; markPrice: number; leverage: number }): number {
  const priceChange = pos.side === "LONG"
    ? (pos.markPrice - pos.entryPrice) / pos.entryPrice
    : (pos.entryPrice - pos.markPrice) / pos.entryPrice;
  return priceChange * pos.leverage;
}

function deterministicHealerCheck(
  openPositions: Array<{ symbol: string; positionAmt: string; entryPrice: string; markPrice: string; unrealizedProfit: string; leverage: string }>,
): DeterministicAction[] {
  const actions: DeterministicAction[] = [];

  for (const p of openPositions) {
    const amt = Number(p.positionAmt);
    const side = amt > 0 ? "LONG" : "SHORT";
    const entryPrice = Number(p.entryPrice);
    const markPrice = Number(p.markPrice);
    const leverage = Number(p.leverage);
    const pnlPct = calcPnlPct({ side, entryPrice, markPrice, leverage });

    const stored = positionStates.get(p.symbol);

    // 1. TP hit (gunakan stored tpPrice jika ada, atau default TP_PCT)
    if (stored?.tpPrice && stored.tpPrice > 0) {
      const tpHit = side === "LONG" ? markPrice >= stored.tpPrice : markPrice <= stored.tpPrice;
      if (tpHit) {
        actions.push({ symbol: p.symbol, side, action: "close_position", reason: `TP hit (stored TP $${stored.tpPrice}, mark $${markPrice})` });
        continue;
      }
    } else if (pnlPct >= TP_PCT * 100) {
      actions.push({ symbol: p.symbol, side, action: "close_position", reason: `TP hit (PnL ${pnlPct.toFixed(1)}% >= ${TP_PCT * 100}%)` });
      continue;
    }

    // 2. SL hit (gunakan stored slPrice jika ada, atau default SL_PCT)
    if (stored?.slPrice && stored.slPrice > 0) {
      const slHit = side === "LONG" ? markPrice <= stored.slPrice : markPrice >= stored.slPrice;
      if (slHit) {
        actions.push({ symbol: p.symbol, side, action: "close_position", reason: `SL hit (stored SL $${stored.slPrice}, mark $${markPrice})` });
        continue;
      }
    } else if (pnlPct <= -(SL_PCT * 100)) {
      actions.push({ symbol: p.symbol, side, action: "close_position", reason: `SL hit (PnL ${pnlPct.toFixed(1)}% <= -${SL_PCT * 100}%)` });
      continue;
    }

    // 3. OOR — position running too long without progress
    if (stored) {
      const ageMs = Date.now() - stored.openTime;
      if (ageMs > OOR_THRESHOLD_MS) {
        actions.push({ symbol: p.symbol, side, action: "close_position", reason: `OOR: position open ${(ageMs / 3600000).toFixed(0)}h > 48h limit` });
        continue;
      }

      // 4. Yield check — position open for hours but minimal gain
      const ageHours = ageMs / 3600000;
      if (ageHours > 4 && pnlPct < MIN_YIELD_PCT * ageHours / 4) {
        actions.push({ symbol: p.symbol, side, action: "close_position", reason: `Low yield: PnL ${pnlPct.toFixed(1)}% in ${ageHours.toFixed(0)}h (expected ≥${(MIN_YIELD_PCT * ageHours / 4).toFixed(1)}%)` });
        continue;
      }
    }
  }

  return actions;
}

export async function runHealerCycle(
  orchestrator: OrchestratorConfig,
  startEquity: number,
  daysElapsed: number,
): Promise<CycleResult> {
  const startTime = Date.now();

  // Reset session guard for fresh cycle
  resetSessionGuard();

  const ctx = await gatherContext(
    orchestrator.binance,
    orchestrator.appConfig,
    daysElapsed,
    startEquity,
    orchestrator.scanner,
    orchestrator.hivemind,
  );

  // Auto-reset circuit breaker if condition resolved
  const cb = getCircuitBreakerState();
  if (cb.active && ctx.risk.drawdown < 0.20) {
    resetCircuitBreaker();
    console.log(`[${new Date().toISOString()}] Healer: circuit breaker auto-reset, drawdown back to ${(ctx.risk.drawdown * 100).toFixed(1)}%`);
  }

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

  // ── LAYER 2: Deterministic Healer Checks — SL/TP/OOR/Yield ──
  const deterministicActions = deterministicHealerCheck(openPositions);

  // Execute deterministic actions langsung (no LLM)
  const results: ToolResult[] = [];
  for (const d of deterministicActions) {
    const fakeCall: ToolCall = {
      id: `deterministic_${d.symbol}_${Date.now()}`,
      type: "function",
      function: {
        name: d.action,
        arguments: JSON.stringify({ symbol: d.symbol, reason: d.reason }),
      },
    };
    const result = await executeToolCall(fakeCall, ctx, orchestrator.tradeHandler);
    results.push(result);
  }

  // ── Filter positions that weren't deterministically closed ──
  const closedSymbols = new Set(results.map((r) => (r.data?.symbol as string) || ""));
  const remainingPositions = openPositions.filter((p) => !closedSymbols.has(p.symbol));

  if (remainingPositions.length === 0) {
    return {
      agent: "healer",
      decisions: results,
      context: ctx,
      llmResponse: deterministicActions.length > 0
        ? `Deterministic: ${deterministicActions.map((a) => `${a.action} ${a.symbol} (${a.reason})`).join("; ")}`
        : null,
      durationMs: Date.now() - startTime,
    };
  }

  // ── LAYER 3: LLM for remaining positions ──
  const positionSummary = remainingPositions
    .map((p) => {
      const amt = Number(p.positionAmt);
      return `${p.symbol} ${amt > 0 ? "LONG" : "SHORT"} | Entry: $${Number(p.entryPrice)} | PnL: ${Number(p.unrealizedProfit).toFixed(2)} | Liq: $${Number(p.liquidationPrice)}`;
    })
    .join("\n");

  const healerPrompt = `=== HEALER CYCLE ===
Manage remaining positions after deterministic SL/TP/OOR checks. Decide for EACH position:
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
    HEALER_TOOLS,
  );

  const toolCalls = parseToolCalls(llmResponse);

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
