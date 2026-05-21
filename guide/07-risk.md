# 7 — Risk Engine

Lapisan risk management: sizing, leverage, circuit breaker, daily goal, regime filter, drawdown recovery.

## Files

```
src/risk/
├── index.ts
├── position-sizing.ts    # Half Kelly
├── leverage.ts           # Volatility-adjusted
├── circuit-breaker.ts    # 5-layer protection
├── daily-goal.ts         # Target tracking
├── regime-filter.ts      # Block low-WR combos
└── drawdown-recovery.ts  # 3-level recovery
```

## 1. Position Sizing — Half Kelly

```
f* = WR - (1-WR) / RR

Dimana:
  WR = win rate (default 0.55, update dari learning)
  RR = reward:risk ratio (SL/TP distance)

Half Kelly: use 0.5 × f*
Equity cap: tier.maxRisk × balance

Example:
  WR=0.55, RR=2.0
  f* = 0.55 - 0.45/2.0 = 0.325
  Half Kelly = 0.1625 → 16.25% of balance
```

### Confidence Multiplier
```
confidence < 50 → 0.5× Kelly
confidence 50-70 → 1.0× Kelly
confidence > 70 → 1.2× Kelly
```

## 2. Leverage — Volatility-Adjusted

```
base = 1 (minimum)
ATR% adjust: base + (3 - ATR% × 10)
  Jika ATR% = 0.5% → 1 + 2.5 = 3.5x
  Jika ATR% = 2.0% → 1 + 1.0 = 2.0x

Conviction bonus: confidence > 70 → +1x
Equity floor: balance < $50 → max 2x
```

## 3. Circuit Breaker — 5 Layers

| # | Check | Threshold | Action |
|---|-------|-----------|--------|
| 1 | Consecutive loss | > tier.maxConsecutive | Block trade |
| 2 | Daily loss | > tier.maxRisk × 2 | Block for 24h |
| 3 | Drawdown | > 30% from peak | Emergency stop |
| 4 | Max trades/day | > tier.maxTrades | Block |
| 5 | Flash crash | BTC -5% in 1h | Emergency close |

## 4. Daily Goal Tracking

```ts
dailyTargetPct = (targetEquity / currentEquity)^(1/targetDays) - 1

Urgency:
  ahead of schedule (>10% above target) → 0.8× multiplier
  behind (<90% of target) → 1.2× multiplier
  critical (<50% of target) → 1.5× multiplier
```

## 5. Regime Filter — Block Low-WR

Data dari learning (backtest atau history):
- SIDEWAYS + LONG: 35% WR → BLOCK
- HIGH_VOL + SHORT: 36% WR → BLOCK
- BULL + SHORT: 15% WR → BLOCK
- BEAR + LONG: 12% WR → BLOCK

## 6. Drawdown Recovery — 3 Levels

```
Warning (DD > 10%):
  - maxRisk × 0.5
  - leverage max 2x
  - hanya long signal di atas 70 confidence

Critical (DD > 20%):
  - maxRisk × 0.25
  - leverage max 1x
  - cash generation priority

Stop (DD > 30%):
  - maxRisk = 0
  - Close all positions
  - Require manual restart
```
