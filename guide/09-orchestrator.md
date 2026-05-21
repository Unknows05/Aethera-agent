# 9 — Orchestrator

LLM-driven decision engine: Hunter (30min) + Healer (5min) cycles.

## Files

```
src/orchestrator/
├── index.ts              # Hunter + Healer cycles
├── context.ts            # Build context for LLM
├── tools.ts              # 8 tool definitions + hard rules
└── tool-handlers/
    └── trade.ts          # Binance order execution
```

## Context Building

Context yang dikirim ke LLM setiap cycle:

```ts
interface Context {
  market: {
    btcRegime: string;
    btcPrice: number;
    btcChange24h: number;
    fundingAvg: number;
    topGainers: string[];
    topLosers: string[];
  };
  account: {
    balance: number;
    equity: number;
    peakEquity: number;
    openPositions: number;
    dailyPnl: number;
    dailyTrades: number;
  };
  screening: ScoredCoin[];
  risk: {
    circuitBreakerActive: boolean;
    consecutiveLosses: number;
    drawdown: number;
    dailyLossPct: number;
  };
  lessons: string[];
  goal: GoalState;
}
```

## 8 Tool Definitions

| Tool | Description | Arguments |
|------|-------------|-----------|
| `wait(reason)` | Skip trade, explain why | `reason: string` |
| `open_long(symbol, confidence, reason)` | Open LONG position | symbol, confidence 0-100, reason |
| `open_short(symbol, confidence, reason)` | Open SHORT position | symbol, confidence 0-100, reason |
| `close_position(symbol, reason)` | Close position | symbol, reason |
| `partial_close(symbol, percent, reason)` | Partial take profit | symbol, percent 0-100, reason |
| `trail_sl(symbol, activation_pct)` | Trail stop loss | symbol, activation_pct |
| `scan_market(symbols)` | Focused scan | symbols: string[] |
| `add_lesson(lesson)` | Store lesson | lesson object |

## Hard Rules (LLM Cannot Override)

```ts
function checkHardRules(tool: string, params: Record<string, unknown>, ctx: Context): {
  allowed: boolean;
  reason: string;
} {
  // 1. Circuit breaker aktif → no trade
  if (ctx.risk.circuitBreakerActive) return { allowed: false, reason: "Circuit breaker active" };

  // 2. Max trades exceeded
  if (ctx.account.dailyTrades >= ctx.goal.maxTrades) return { allowed: false, reason: "Daily trade limit" };

  // 3. Drawdown > 30% → emergency
  if (ctx.risk.drawdown > 0.30) return { allowed: false, reason: "Emergency drawdown" };

  // 4. Max consecutive losses
  if (ctx.risk.consecutiveLosses >= ctx.goal.maxConsecutive) return { allowed: false, reason: "Max consecutive losses" };

  // 5. Daily loss exceeded
  if (ctx.risk.dailyLossPct > ctx.goal.maxRisk * 2) return { allowed: false, reason: "Daily loss limit" };

  return { allowed: true, reason: "" };
}
```

## Hunter Cycle (30 min)

```
1. Fetch market data (BTC price, funding)
2. Fetch account data (balance, positions)
3. Run screening scanner
4. Check circuit breaker
5. Load lessons from learning
6. Build context → format for LLM
7. Call LLM with tools
8. Parse tool_calls → execute
9. Record in post-turn review
```

## Healer Cycle (5 min)

```
1. Fetch open positions
2. If no positions → skip
3. Build position summary + risk state
4. Call LLM to manage each position
5. Execute decisions (close, partial, trail)
6. Record in post-turn review
```

## Trade Execution Flow

```
LLM calls open_long(symbol="BTCUSDT", confidence=75)
  → checkHardRules("open_long") → allowed?
  → YES: calculate position size (Half Kelly)
  → calculate leverage (volatility-adjusted)
  → setLeverage()
  → placeOrder(MARKET BUY)
  → return { success: true, data: { symbol, size, entry, sl, tp } }
  → NO: return { success: false, error: reason }
```
