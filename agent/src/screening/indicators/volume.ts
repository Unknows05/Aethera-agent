import type { Candle } from "../types.js";

export function analyzeVolume(
  candles: Candle[],
  period = 20,
): { ratio: number; zscore: number; spike: boolean; trend: "increasing" | "decreasing" | "neutral"; obvMomentum: number } {
  if (candles.length < period) {
    return { ratio: 1, zscore: 0, spike: false, trend: "neutral", obvMomentum: 0 };
  }

  const volumes = candles.map((c) => c.volume);
  const currentVol = volumes[volumes.length - 1];
  const avgVol = volumes.slice(-period - 1, -1).reduce((s, v) => s + v, 0) / period;
  const ratio = avgVol > 0 ? currentVol / avgVol : 1;

  const recentVols = volumes.slice(-period);
  const mean = recentVols.reduce((s, v) => s + v, 0) / period;
  const variance = recentVols.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
  const std = Math.sqrt(variance);
  const zscore = std > 0 ? (currentVol - mean) / std : 0;

  const spike = zscore > 2;

  const half = Math.floor(period / 2);
  const firstHalf = volumes.slice(-period, -half).reduce((s, v) => s + v, 0);
  const secondHalf = volumes.slice(-half).reduce((s, v) => s + v, 0);
  const trend: "increasing" | "decreasing" | "neutral" =
    secondHalf > firstHalf * 1.1 ? "increasing"
    : secondHalf < firstHalf * 0.9 ? "decreasing"
    : "neutral";

  const obv: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const closeDiff = candles[i].close - candles[i - 1].close;
    if (closeDiff > 0) obv.push(obv[obv.length - 1] + candles[i].volume);
    else if (closeDiff < 0) obv.push(obv[obv.length - 1] - candles[i].volume);
    else obv.push(obv[obv.length - 1]);
  }

  const obvTrend = obv.length > 20
    ? obv[obv.length - 1] - obv[obv.length - 20]
    : 0;
  const avgObvRange = obv.length > 1
    ? obv.reduce((s, v) => s + Math.abs(v), 0) / obv.length
    : 1;
  const obvMomentum = avgObvRange > 0 ? obvTrend / avgObvRange : 0;

  return { ratio, zscore, spike, trend, obvMomentum: Math.round(obvMomentum * 100) / 100 };
}

export function computeVolumeScore(zscore: number, ratio: number): number {
  if (zscore > 2) return 8;
  if (zscore > 1.5) return 4;
  if (zscore < -1) return -3;
  if (ratio > 1.5) return 2;
  return 0;
}
