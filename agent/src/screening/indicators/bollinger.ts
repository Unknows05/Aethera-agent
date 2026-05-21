import type { Candle } from "../types.js";

export function calculateBollinger(
  closes: number[],
  period = 20,
  stdDev = 2,
): { upper: number; middle: number; lower: number; percentB: number; squeeze: boolean; squeezePct: number } {
  if (closes.length < period) {
    const price = closes[closes.length - 1] || 0;
    return { upper: price, middle: price, lower: price, percentB: 0.5, squeeze: false, squeezePct: 0 };
  }

  const recent = closes.slice(-period);
  const sma = recent.reduce((s, v) => s + v, 0) / period;
  const variance = recent.reduce((s, v) => s + (v - sma) ** 2, 0) / period;
  const std = Math.sqrt(variance);

  const upper = sma + stdDev * std;
  const lower = sma - stdDev * std;
  const price = closes[closes.length - 1];
  const percentB = upper > lower ? (price - lower) / (upper - lower) : 0.5;

  const prevPeriod = closes.slice(-period * 2, -period);
  let prevStd = 0;
  if (prevPeriod.length >= period) {
    const prevSma = prevPeriod.reduce((s, v) => s + v, 0) / period;
    const prevVar = prevPeriod.reduce((s, v) => s + (v - prevSma) ** 2, 0) / period;
    prevStd = Math.sqrt(prevVar);
  }

  const currentWidth = upper - lower;
  const prevWidth = 2 * stdDev * (prevStd || std);
  const squeezePct = prevWidth > 0 ? (currentWidth / prevWidth - 1) * 100 : 0;
  const squeeze = currentWidth < prevWidth * 0.9;

  return {
    upper: Math.round(upper * 100) / 100,
    middle: Math.round(sma * 100) / 100,
    lower: Math.round(lower * 100) / 100,
    percentB: Math.round(percentB * 100) / 100,
    squeeze,
    squeezePct: Math.round(squeezePct * 100) / 100,
  };
}

export function computeBollingerScore(percentB: number, squeeze: boolean, price: number, upper: number, lower: number): number {
  let score = 0;
  if (squeeze) {
    const width = upper - lower;
    if (width > 0 && price > upper) score = 15;
    else if (width > 0 && price < lower) score = -15;
  }
  if (percentB > 0.8) score -= 5;
  else if (percentB < 0.2) score += 5;
  return score;
}
