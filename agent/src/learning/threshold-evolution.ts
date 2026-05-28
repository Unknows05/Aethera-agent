import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { recalculateWeights, getWeights } from "./signal-weights.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "data");
const EVOLVE_FILE = join(DATA_DIR, "threshold-evolution.json");

interface ThresholdState {
  longMinScore: number;
  shortMinScore: number;
  highConfidence: number;
  lastEvolved: string | null;
  evolveCount: number;
  recentWinRate: number;
  recentTrades: number;
}

interface PerfEntry {
  symbol: string;
  direction: string;
  pnlPct: number;
  pnlUsd: number;
  exitReason: string;
  recorded_at: string;
}

const DEFAULT_STATE: ThresholdState = {
  longMinScore: 55,
  shortMinScore: 55,
  highConfidence: 70,
  lastEvolved: null,
  evolveCount: 0,
  recentWinRate: 0,
  recentTrades: 0,
};

function loadThresholds(): ThresholdState {
  try {
    if (existsSync(EVOLVE_FILE)) {
      return JSON.parse(readFileSync(EVOLVE_FILE, "utf8"));
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_STATE };
}

function saveThresholds(state: ThresholdState): void {
  writeFileSync(EVOLVE_FILE, JSON.stringify(state, null, 2));
}

function loadPerformance(): PerfEntry[] {
  const lessFile = join(DATA_DIR, "lessons.json");
  try {
    if (existsSync(lessFile)) {
      const data = JSON.parse(readFileSync(lessFile, "utf8")) as { performance: PerfEntry[] };
      return data.performance || [];
    }
  } catch { /* ignore */ }
  return [];
}

export function evolveThresholds(): {
  changes: string[];
  state: ThresholdState;
  weightChanges: Array<{ signal: string; from: number; to: number }>;
} {
  const changes: string[] = [];
  const state = loadThresholds();
  const perf = loadPerformance();

  if (perf.length < 5) {
    changes.push(`Not enough data: ${perf.length} trades (need ≥5)`);
    return { changes, state, weightChanges: [] };
  }

  // Recent trades (last 20)
  const recent = perf.slice(-20);
  const wins = recent.filter((p) => p.pnlUsd > 0);
  const losses = recent.filter((p) => p.pnlUsd <= 0);
  const winRate = recent.length > 0 ? wins.length / recent.length : 0;

  state.recentWinRate = Math.round(winRate * 100);
  state.recentTrades = recent.length;

  // Evolve signal weights
  const perfRecords = perf.slice(-50).map((p) => ({
    pnlUsd: p.pnlUsd,
    signalSnapshot: {} as Record<string, number>,
  }));
  const weightResult = recalculateWeights(perfRecords, { minSamples: Math.min(5, perf.length) });
  if (weightResult.changes.length > 0) {
    changes.push(`Signal weights adjusted: ${weightResult.changes.map((c) => `${c.signal} ${c.from.toFixed(3)}→${c.to.toFixed(3)}`).join(", ")}`);
  }

  // Adjust min scores based on win rate
  const prevLong = state.longMinScore;
  const prevShort = state.shortMinScore;
  const prevHigh = state.highConfidence;

  if (winRate < 0.3) {
    // Tighten — need stronger signals
    state.longMinScore = Math.min(75, state.longMinScore + 5);
    state.shortMinScore = Math.min(75, state.shortMinScore + 5);
    state.highConfidence = Math.min(85, state.highConfidence + 5);
  } else if (winRate > 0.6) {
    // Loosen — can accept weaker signals
    state.longMinScore = Math.max(40, state.longMinScore - 3);
    state.shortMinScore = Math.max(40, state.shortMinScore - 3);
    state.highConfidence = Math.max(55, state.highConfidence - 3);
  }

  // Per-direction adjustments based on which side is losing
  const longTrades = recent.filter((p) => p.direction === "LONG");
  const shortTrades = recent.filter((p) => p.direction === "SHORT");
  if (longTrades.length >= 3) {
    const longWinRate = longTrades.filter((p) => p.pnlUsd > 0).length / longTrades.length;
    if (longWinRate < 0.25) state.longMinScore = Math.min(80, state.longMinScore + 3);
    else if (longWinRate > 0.65) state.longMinScore = Math.max(40, state.longMinScore - 2);
  }
  if (shortTrades.length >= 3) {
    const shortWinRate = shortTrades.filter((p) => p.pnlUsd > 0).length / shortTrades.length;
    if (shortWinRate < 0.25) state.shortMinScore = Math.min(80, state.shortMinScore + 3);
    else if (shortWinRate > 0.65) state.shortMinScore = Math.max(40, state.shortMinScore - 2);
  }

  if (state.longMinScore !== prevLong) {
    changes.push(`longMinScore: ${prevLong} → ${state.longMinScore} (${state.longMinScore > prevLong ? "tighten" : "loosen"})`);
  }
  if (state.shortMinScore !== prevShort) {
    changes.push(`shortMinScore: ${prevShort} → ${state.shortMinScore} (${state.shortMinScore > prevShort ? "tighten" : "loosen"})`);
  }
  if (state.highConfidence !== prevHigh) {
    changes.push(`highConfidence: ${prevHigh} → ${state.highConfidence}`);
  }

  state.lastEvolved = new Date().toISOString();
  state.evolveCount++;
  saveThresholds(state);

  return { changes, state, weightChanges: weightResult.changes };
}

export function getThresholdState(): ThresholdState {
  return loadThresholds();
}

export function applyThresholdsToConfig(config: { screening?: { longMinScore?: number; shortMinScore?: number; highConfidence?: number } }): boolean {
  const state = loadThresholds();
  if (!config.screening) return false;

  let changed = false;
  if (config.screening.longMinScore !== state.longMinScore) {
    config.screening.longMinScore = state.longMinScore;
    changed = true;
  }
  if (config.screening.shortMinScore !== state.shortMinScore) {
    config.screening.shortMinScore = state.shortMinScore;
    changed = true;
  }
  if (config.screening.highConfidence !== state.highConfidence) {
    config.screening.highConfidence = state.highConfidence;
    changed = true;
  }
  return changed;
}
