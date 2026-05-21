import type { ScoredCoin } from "./types.js";

export interface Signal {
  symbol: string;
  direction: "LONG" | "SHORT";
  score: number;
  confidence: number;
  regime: string;
  sl: number;
  tp: number;
  reasons: string[];
  session: string;
  timestamp: number;
}

export function generateSignals(coins: ScoredCoin[], session: string): Signal[] {
  return coins
    .filter((c): c is ScoredCoin & { direction: "LONG" | "SHORT" } => c.direction !== "WAIT")
    .map((c) => ({
      symbol: c.symbol,
      direction: c.direction,
      score: c.score,
      confidence: c.confidence,
      regime: c.regime,
      sl: c.sl,
      tp: c.tp,
      reasons: c.reasons,
      session,
      timestamp: Date.now(),
    }))
    .sort((a, b) => {
      const aWeight = a.direction === "LONG" ? a.score : 100 - a.score;
      const bWeight = b.direction === "LONG" ? b.score : 100 - b.score;
      return bWeight - aWeight;
    });
}

export function getTopSignals(signals: Signal[], count = 5): Signal[] {
  return signals.slice(0, count);
}

export function getSignalsByDirection(signals: Signal[], direction: "LONG" | "SHORT"): Signal[] {
  return signals.filter((s) => s.direction === direction);
}
