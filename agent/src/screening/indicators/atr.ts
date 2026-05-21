import type { Candle } from "../types.js";

export function calculateATR(candles: Candle[], period = 14): { value: number; percent: number } {
  if (candles.length < period + 1) {
    return { value: 0, percent: 0 };
  }

  const tr: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }

  if (tr.length === 0) return { value: 0, percent: 0 };

  const atr = tr.slice(-period).reduce((s, v) => s + v, 0) / period;
  const price = candles[candles.length - 1].close;
  const percent = price > 0 ? (atr / price) * 100 : 0;

  return { value: Math.round(atr * 100) / 100, percent: Math.round(percent * 100) / 100 };
}
