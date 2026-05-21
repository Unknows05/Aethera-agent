import type { Candle } from "../types.js";

export function calculateADX(
  candles: Candle[],
  period = 14,
): { value: number; trendStrength: "strong" | "weak" | "none"; direction: "bullish" | "bearish" | "neutral" } {
  if (candles.length < period * 2) {
    return { value: 0, trendStrength: "none", direction: "neutral" };
  }

  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    const pc = candles[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));

    const upMove = h - candles[i - 1].high;
    const downMove = candles[i - 1].low - l;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  const atr = tr.slice(-period).reduce((s, v) => s + v, 0) / period;
  const avgPDM = plusDM.slice(-period).reduce((s, v) => s + v, 0) / period;
  const avgMDM = minusDM.slice(-period).reduce((s, v) => s + v, 0) / period;

  const pDI = atr > 0 ? (avgPDM / atr) * 100 : 0;
  const mDI = atr > 0 ? (avgMDM / atr) * 100 : 0;
  const dx = (pDI + mDI) > 0 ? Math.abs(pDI - mDI) / (pDI + mDI) * 100 : 0;
  const adx = dx;

  let trendStrength: "strong" | "weak" | "none" = "none";
  if (adx > 25) trendStrength = "strong";
  else if (adx > 20) trendStrength = "weak";

  let direction: "bullish" | "bearish" | "neutral" = "neutral";
  if (pDI > mDI) direction = "bullish";
  else if (mDI > pDI) direction = "bearish";

  return {
    value: Math.round(adx * 100) / 100,
    trendStrength,
    direction,
  };
}
