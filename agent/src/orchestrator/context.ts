import type { Config } from "../config/schema.js";

interface MarketState {
  btcRegime: string;
  btcPrice: number;
  btcChange24h: number;
  fundingAvg: number;
  topGainers: string[];
  topLosers: string[];
  topOpenInterest: Array<{ symbol: string; oi: number }>;
  lsDivergences: Array<{ symbol: string; topRatio: number; globalRatio: number; divergence: number }>;
}

interface AccountState {
  balance: number;
  equity: number;
  peakEquity: number;
  openPositions: number;
  dailyPnl: number;
  dailyTrades: number;
}

export interface ScreeningResult {
  symbol: string;
  score: number;
  direction: "LONG" | "SHORT" | "WAIT";
  confidence: number;
  regime: string;
  reasons: string[];
  sl: number;
  tp: number;
  fundingRate?: number;
  openInterest?: number;
  oiChange?: number;
  takerBuyRatio?: number;
  topLongShortRatio?: number;
  globalLongShortRatio?: number;
  depthImbalance?: number;
  volume24h?: number;
}

interface RiskState {
  circuitBreakerActive: boolean;
  circuitBreakerReason: string;
  consecutiveLosses: number;
  drawdown: number;
  dailyLossPct: number;
}

export interface Lesson {
  rule: string;
  tags: string[];
  outcome: string;
  confidence: number;
  pinned: boolean;
}

interface GoalState {
  targetEquity: number;
  currentEquity: number;
  startEquity: number;
  daysElapsed: number;
  daysRemaining: number;
  dailyTargetPct: number;
  actualTodayPct: number;
  progressPct: number;
  urgency: "ahead" | "on_track" | "behind" | "critical";
  riskTier: {
    maxRisk: number;
    maxLeverage: number;
    maxTrades: number;
  };
}

export interface Context {
  market: MarketState;
  account: AccountState;
  screening: ScreeningResult[];
  risk: RiskState;
  lessons: Lesson[];
  goal: GoalState;
  timestamp: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function buildGoalState(
  equity: number,
  startEquity: number,
  config: Config,
  daysElapsed: number,
): GoalState {
  const target = config.growth.targetEquity;
  const totalDays = config.growth.targetDays;
  const remaining = Math.max(1, totalDays - daysElapsed);

  const progress = target > startEquity
    ? ((equity - startEquity) / (target - startEquity)) * 100
    : 0;
  const expectedProgress = (daysElapsed / totalDays) * 100;
  const progressRatio = expectedProgress > 0 ? progress / expectedProgress : 1;

  let urgency: GoalState["urgency"] = "on_track";
  if (progressRatio > 1.2) urgency = "ahead";
  else if (progressRatio < 0.6) urgency = "critical";
  else if (progressRatio < 0.85) urgency = "behind";

  const requiredReturn = target / equity;
  const dailyRequired = (requiredReturn ** (1 / remaining) - 1) * 100;

  const urgencyMult = urgency === "critical" ? 1.5
    : urgency === "behind" ? 1.3
    : urgency === "ahead" ? 0.7
    : 1.0;

  const actualTarget = clamp(dailyRequired * urgencyMult, 0.5, 50);

  const tier = config.growth.equityTiers.find(
    (t) => equity >= t.min && equity < t.max,
  ) || config.growth.equityTiers[config.growth.equityTiers.length - 1];

  return {
    targetEquity: target,
    currentEquity: equity,
    startEquity,
    daysElapsed,
    daysRemaining: remaining,
    dailyTargetPct: Math.round(actualTarget * 10) / 10,
    actualTodayPct: 0,
    progressPct: Math.round(progress * 10) / 10,
    urgency,
    riskTier: {
      maxRisk: tier.maxRisk,
      maxLeverage: tier.maxLeverage,
      maxTrades: tier.maxTrades,
    },
  };
}

export function buildContext(params: {
  market: MarketState;
  account: AccountState;
  screening: ScreeningResult[];
  risk: RiskState;
  lessons: Lesson[];
  goal: GoalState;
}): Context {
  return {
    ...params,
    timestamp: Date.now(),
  };
}

export function formatContextForLLM(ctx: Context): string {
  const urgencyEmoji = ctx.goal.urgency === "critical" ? "🔴"
    : ctx.goal.urgency === "behind" ? "🟡"
    : ctx.goal.urgency === "ahead" ? "🟢"
    : "🔵";

  const fundingSection = ctx.market.fundingAvg !== 0
    ? `Funding Avg: ${(ctx.market.fundingAvg * 100).toFixed(4)}%`
    : "";

  const oiSection = ctx.market.topOpenInterest.length > 0
    ? `Top OI: ${ctx.market.topOpenInterest.slice(0, 5).map(o => `${o.symbol} $${(o.oi / 1e6).toFixed(0)}M`).join(", ")}`
    : "";

  const lsDivergenceSection = ctx.market.lsDivergences.length > 0
    ? `L/S Divergence: ${ctx.market.lsDivergences.slice(0, 3).map(d =>
        `${d.symbol} top=${d.topRatio.toFixed(2)} global=${d.globalRatio.toFixed(2)} (div=${d.divergence > 0 ? "+" : ""}${(d.divergence * 100).toFixed(0)}%)`
      ).join(" | ")}`
    : "";

  const lsDivergenceSection2 = ctx.market.lsDivergences.length > 0
    ? `L/S Divergence (Top vs Global): ${ctx.market.lsDivergences.slice(0, 3).map(d =>
        `${d.symbol} top=${d.topRatio.toFixed(2)} global=${d.globalRatio.toFixed(2)} (${d.divergence > 0 ? "top bull" : "top bear"})`
      ).join(" | ")}`
    : "";

  const extraLines = [fundingSection, oiSection, lsDivergenceSection2].filter(Boolean).join("\n");

  return `=== MARKET STATE ===
BTC Regime: ${ctx.market.btcRegime} | Price: $${ctx.market.btcPrice.toLocaleString()} | 24h: ${ctx.market.btcChange24h > 0 ? "+" : ""}${ctx.market.btcChange24h}%
${extraLines}
Top Gainers: ${ctx.market.topGainers.slice(0, 3).join(", ")}
Top Losers: ${ctx.market.topLosers.slice(0, 3).join(", ")}

=== ACCOUNT ===
Balance: $${ctx.account.balance.toFixed(2)} | Equity: $${ctx.account.equity.toFixed(2)}
Open Positions: ${ctx.account.openPositions}
Daily PnL: $${ctx.account.dailyPnl.toFixed(2)} | Daily Trades: ${ctx.account.dailyTrades}

=== RISK STATE ===
${ctx.risk.circuitBreakerActive ? `⚠️ CIRCUIT BREAKER ACTIVE: ${ctx.risk.circuitBreakerReason}` : "✓ Circuit Breaker: OK"}
Consecutive Losses: ${ctx.risk.consecutiveLosses}
Drawdown: ${(ctx.risk.drawdown * 100).toFixed(1)}%
Daily Loss: ${(ctx.risk.dailyLossPct * 100).toFixed(1)}%

=== GOAL ${urgencyEmoji} ===
$${ctx.goal.startEquity.toFixed(0)} → $${ctx.goal.targetEquity} in ${ctx.goal.daysRemaining}d (${ctx.goal.daysElapsed}d elapsed)
Progress: ${ctx.goal.progressPct.toFixed(1)}% | Daily Target: ${ctx.goal.dailyTargetPct}%
Urgency: ${ctx.goal.urgency.toUpperCase()}
Risk Tier: max ${(ctx.goal.riskTier.maxRisk * 100).toFixed(0)}% risk, ${ctx.goal.riskTier.maxLeverage}x lev, ${ctx.goal.riskTier.maxTrades} trades/day

=== TOP SIGNALS ===
${ctx.screening.length === 0 ? "No signals available" : ctx.screening.slice(0, 5).map((s, i) => {
  const enrich = s.fundingRate !== undefined
    ? [
        s.fundingRate ? `Fund:${(s.fundingRate * 100).toFixed(4)}%` : "",
        s.takerBuyRatio && s.topLongShortRatio ? `Top/Global:${s.topLongShortRatio.toFixed(2)}/${s.globalLongShortRatio?.toFixed(2)}` : "",
        s.oiChange ? `OI:${(s.oiChange * 100).toFixed(1)}%` : s.openInterest ? `OI:$${(s.openInterest / 1e6).toFixed(0)}M` : "",
        s.depthImbalance ? `Depth:${(s.depthImbalance * 100).toFixed(0)}%` : "",
        s.takerBuyRatio ? `Taker:${s.takerBuyRatio.toFixed(2)}` : "",
      ].filter(Boolean).join(" ")
    : "";
  return `${i + 1}. ${s.symbol} ${s.direction === "LONG" ? "🟢" : "🔴"} Score:${s.score} Conf:${s.confidence} ${s.regime}${s.reasons.length ? ` ${s.reasons.slice(0, 2).join("/")}` : ""}${enrich ? " | "+enrich : ""}`;
}).join("\n")}

=== LESSONS ===
${ctx.lessons.length === 0 ? "No lessons yet" : ctx.lessons.slice(0, 5).map((l) =>
  `${l.pinned ? "📌 " : ""}[${l.outcome.toUpperCase()}] ${l.rule}`
).join("\n")}

You are the trading orchestrator. Based on the context above, decide what action to take.
Available tools: wait, open_long, open_short, close_position, partial_close, trail_sl, scan_market, add_lesson.

IMPORTANT RULES:
- You MUST use tools to take action. Do not just explain what you would do.
- You MUST respect the circuit breaker. If active, wait or scan only.
- R:R must be ≥ 2.5:1 for new positions.
- Max ${ctx.goal.riskTier.maxTrades} trades per day.
- Max ${ctx.goal.riskTier.maxLeverage}x leverage.
- You can REFUSE to trade if conditions are not right. Use wait().`;
}
