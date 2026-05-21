import type { Candle } from "../types.js";

export function calculateRSI(closes: number[], period = 14): { value: number; signal: "oversold" | "overbought" | "neutral" } {
  if (closes.length < period + 1) {
    return { value: 50, signal: "neutral" };
  }

  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i <= period; i++) {
    const diff = closes[closes.length - i] - closes[closes.length - i - 1];
    gains.push(Math.max(diff, 0));
    losses.push(Math.max(-diff, 0));
  }

  const avgGain = gains.reduce((s, v) => s + v, 0) / period;
  const avgLoss = losses.reduce((s, v) => s + v, 0) / period;

  if (avgLoss === 0) return { value: 100, signal: "overbought" };

  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);

  let signal: "oversold" | "overbought" | "neutral" = "neutral";
  if (rsi > 70) signal = "overbought";
  else if (rsi < 30) signal = "oversold";

  return { value: Math.round(rsi * 100) / 100, signal };
}

export function computeRSIScore(rsi: number): number {
  return (rsi - 50) * 0.8;
}
