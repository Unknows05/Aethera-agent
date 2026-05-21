import type { Config } from "../config/schema.js";

interface MarketState {
  btcRegime: string;
  btcPrice: number;
  btcChange24h: number;
  fundingAvg: number;
  topGainers: string[];
  topLosers: string[];
}

interface AccountState {
  balance: number;
  equity: number;
  peakEquity: number;
  openPositions: number;
  dailyPnl: number;
  dailyTrades: number;
}

interface ScreeningResult {
  symbol: string;
  score: number;
  direction: "LONG" | "SHORT" | "WAIT";
  confidence: number;
  regime: string;
  reasons: string[];
  sl: number;
  tp: number;
}

interface RiskState {
  circuitBreakerActive: boolean;
  circuitBreakerReason: string;
  consecutiveLosses: number;
  drawdown: number;
  dailyLossPct: number;
}

interface Lesson {
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

  return `=== MARKET STATE ===
BTC Regime: ${ctx.market.btcRegime} | Price: $${ctx.market.btcPrice.toLocaleString()} | 24h: ${ctx.market.btcChange24h > 0 ? "+" : ""}${ctx.market.btcChange24h}%
Funding Avg: ${(ctx.market.fundingAvg * 100).toFixed(4)}%
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
${ctx.screening.length === 0 ? "No signals available" : ctx.screening.slice(0, 5).map((s, i) =>
  `${i + 1}. ${s.symbol} ${s.direction === "LONG" ? "🟢" : "🔴"} Score: ${s.score} | Conf: ${s.confidence} | Regime: ${s.regime}${s.reasons.length ? ` | ${s.reasons.slice(0, 2).join(", ")}` : ""}`
).join("\n")}

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
