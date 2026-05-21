# 8 — Learning System

Self-learning evolution terinspirasi Hermes Agent + Meridian.

## Files

```
src/learning/
├── index.ts
├── lessons.ts            # Derive + store + inject lessons
├── pool-memory.ts        # Per-pair history + cooldown
├── signal-weights.ts     # Darwinian weight evolution
├── curator.ts            # Skill lifecycle
└── post-turn-review.ts   # Hermes-style agent review
```

## 1. Lessons Engine

### Derive Lesson dari Closed Position

```ts
interface Lesson {
  id: string;
  symbol?: string;
  pattern: string;        // e.g. "rsi_oversold_bounce_failed"
  context: string;        // market condition saat itu
  action: string;         // what we did
  outcome: string;        // what happened
  severity: "actionable" | "informational";
  win: boolean;
  timestamp: number;
  usageCount: number;
}
```

### 3-Tier Injection ke LLM Context

| Tier | Condition | How |
|------|-----------|-----|
| **Pinned** | severity=actionable, usageCount<3 | Always injected |
| **Role-matched** | Matches current regime | Injected if relevant |
| **Recent** | Last 5 lessons | Always injected |

## 2. Pool Memory

Per-symbol memory untuk tracking history:

```
pool[symbol] = {
  cooldownUntil: timestamp,     // 7 day cooldown after OOR
  trades: number,                // total trades
  wins: number,                  // winning trades
  lastOutcome: "win" | "loss",
  notes: string[],               // analyst notes
}
```

Jika `isOnCooldown(symbol) === true` → skip symbol di scanner output (tidak recommend).

## 3. Signal Weights — Darwinian Evolution

Weight adjustment setiap 10 sample, ±5% per recalc:

```ts
interface WeightData {
  name: string;
  baseWeight: number;      // default 1.0
  currentWeight: number;   // evolved
  wins: number;
  losses: number;
  lastAdjustment: string;
}

function recalculateWeights(pool): void {
  for each signal in pool:
    wr = wins / (wins + losses)
    if wr < 0.4:
      weight *= 0.95  // penalize
    elif wr > 0.6:
      weight *= 1.05  // reward
    
    clamp(weight, 0.3, 2.5)
}
```

Signal names: `rsi`, `macd`, `bollinger`, `volume`, `ema`, `adx`, `microstructure`, `regime`, `session`.

## 4. Curator — Skill Lifecycle

```
NEW → ACTIVE (after 2 uses)
ACTIVE → STALE (no use for 7 days)  
STALE → ARCHIVED (no use for 30 days)
ARCHIVED → ACTIVE (auto-reactivate jika relevant)
```

## 5. Post-Turn Review (Hermes-style)

Setelah setiap agent cycle:

```ts
function analyzeTurn(cycle: CycleResult): TurnReview {
  return {
    summary: string,
    lessonExtracted: Lesson | null,
    skillUsed: string[],
    effectiveness: number,  // 0-1
    recommendations: string[],
  };
}
```

Menentukan: apakah cycle ini menghasilkan lesson baru? Skill apa yang dipakai? Seberapa efektif?
