import type { Candle } from "../types.js";
import { calculateEMA } from "./ema.js";

export function calculateMACD(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): { macd: number; signal: number; histogram: number; status: "bullish" | "bearish" | "neutral" } {
  const fastEMA = calculateEMA(closes, fast);
  const slowEMA = calculateEMA(closes, slow);

  if (!fastEMA.length || !slowEMA.length) {
    return { macd: 0, signal: 0, histogram: 0, status: "neutral" };
  }

  const macdLine = fastEMA[fastEMA.length - 1] - slowEMA[slowEMA.length - 1];

  const macdHistory: number[] = [];
  const minLen = Math.min(fastEMA.length, slowEMA.length);
  for (let i = 0; i < minLen; i++) {
    macdHistory.push(fastEMA[i] - slowEMA[i]);
  }

  if (macdHistory.length < signalPeriod) {
    return { macd: macdLine, signal: macdLine, histogram: 0, status: "neutral" };
  }

  const signalLine = calculateEMA(macdHistory, signalPeriod);
  const signal = signalLine[signalLine.length - 1];
  const histogram = macdLine - signal;

  let status: "bullish" | "bearish" | "neutral" = "neutral";
  if (histogram > 0 && histogram > (macdHistory.length > 1 ? macdHistory[macdHistory.length - 2] - signal : 0)) {
    status = "bullish";
  } else if (histogram < 0 && histogram < (macdHistory.length > 1 ? macdHistory[macdHistory.length - 2] - signal : 0)) {
    status = "bearish";
  }

  return {
    macd: Math.round(macdLine * 100) / 100,
    signal: Math.round(signal * 100) / 100,
    histogram: Math.round(histogram * 100) / 100,
    status,
  };
}

export function computeMACDScore(macdHist: number, price: number): number {
  if (price <= 0) return 0;
  return (macdHist / price) * 8000;
}
