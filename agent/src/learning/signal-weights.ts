import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DATA_DIR = join(fileURLToPath(import.meta.url), "..", "..", "..", "data");
const WEIGHTS_FILE = join(DATA_DIR, "signal-weights.json");

const SIGNAL_NAMES = [
  "rsi_score",
  "macd_score",
  "volume_score",
  "bollinger_score",
  "sentiment",
  "funding",
  "whale_signal",
  "orderbook",
] as const;

type SignalName = typeof SIGNAL_NAMES[number];

interface WeightData {
  weights: Record<string, number>;
  lastRecalc: string | null;
  recalcCount: number;
  history: Array<{
    timestamp: string;
    changes: Array<{ signal: string; from: number; to: number }>;
    windowSize: number;
  }>;
}

interface PerfRecord {
  pnlUsd: number;
  [key: string]: unknown;
}

function loadWeights(): WeightData {
  try {
    if (existsSync(WEIGHTS_FILE)) {
      return JSON.parse(readFileSync(WEIGHTS_FILE, "utf8"));
    }
  } catch { /* ignore */ }

  const initial: WeightData = {
    weights: Object.fromEntries(SIGNAL_NAMES.map((s) => [s, 1.0])),
    lastRecalc: null,
    recalcCount: 0,
    history: [],
  };
  saveWeights(initial);
  return initial;
}

function saveWeights(data: WeightData): void {
  writeFileSync(WEIGHTS_FILE, JSON.stringify(data, null, 2));
}

export function recalculateWeights(
  perfData: Array<{ pnlUsd: number; signalSnapshot?: Record<string, number> }>,
  config?: { minSamples?: number; boostFactor?: number; decayFactor?: number; weightFloor?: number; weightCeiling?: number },
): { changes: Array<{ signal: string; from: number; to: number }>; weights: Record<string, number> } {
  const {
    minSamples = 10,
    boostFactor = 1.05,
    decayFactor = 0.95,
    weightFloor = 0.3,
    weightCeiling = 2.5,
  } = config ?? {};

  if (perfData.length < minSamples) {
    return { changes: [], weights: loadWeights().weights };
  }

  const data = loadWeights();
  const weights = { ...data.weights };

  const wins = perfData.filter((p) => p.pnlUsd > 0);
  const losses = perfData.filter((p) => p.pnlUsd <= 0);

  if (wins.length === 0 || losses.length === 0) {
    return { changes: [], weights };
  }

  const changes: Array<{ signal: string; from: number; to: number }> = [];

  for (const signal of SIGNAL_NAMES) {
    const winVals = wins
      .map((p) => p.signalSnapshot?.[signal])
      .filter((v): v is number => v !== undefined);
    const lossVals = losses
      .map((p) => p.signalSnapshot?.[signal])
      .filter((v): v is number => v !== undefined);

    if (winVals.length < 2 || lossVals.length < 2) continue;

    const winAvg = winVals.reduce((s, v) => s + v, 0) / winVals.length;
    const lossAvg = lossVals.reduce((s, v) => s + v, 0) / lossVals.length;
    const allVals = [...winVals, ...lossVals];
    const allMin = Math.min(...allVals);
    const allMax = Math.max(...allVals);
    const range = allMax - allMin;

    if (range === 0) continue;

    const winNorm = (winAvg - allMin) / range;
    const lossNorm = (lossAvg - allMin) / range;
    const lift = winNorm - lossNorm;

    const prev = weights[signal] ?? 1.0;
    let next = prev;

    if (lift > 0.1) {
      next = Math.min(prev * boostFactor, weightCeiling);
    } else if (lift < -0.1) {
      next = Math.max(prev * decayFactor, weightFloor);
    }

    next = Math.round(next * 1000) / 1000;

    if (next !== prev) {
      changes.push({ signal, from: prev, to: next });
      weights[signal] = next;
    }
  }

  if (changes.length > 0) {
    data.weights = weights;
    data.lastRecalc = new Date().toISOString();
    data.recalcCount++;
    data.history.push({
      timestamp: data.lastRecalc,
      changes,
      windowSize: perfData.length,
    });
    if (data.history.length > 20) data.history = data.history.slice(-20);
    saveWeights(data);
  }

  return { changes, weights };
}

export function getWeightsSummary(): string {
  const data = loadWeights();
  const w = data.weights;

  const lines = ["Signal Weights (Darwinian — learned from past positions):"];
  const sorted = Object.entries(w).sort((a, b) => b[1] - a[1]);

  for (const [signal, weight] of sorted) {
    const label = weight >= 1.8 ? "[STRONG]" : weight >= 1.2 ? "[above avg]" : weight >= 0.8 ? "[neutral]" : weight >= 0.5 ? "[below avg]" : "[weak]";
    lines.push(`  ${signal.padEnd(20)} ${weight.toFixed(2)}  ${label}`);
  }

  if (data.lastRecalc) {
    lines.push(`\nLast recalculated: ${data.lastRecalc} (${data.recalcCount} times)`);
  }

  return lines.join("\n");
}

export function getWeights(): Record<string, number> {
  return { ...loadWeights().weights };
}
