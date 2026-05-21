import type { Candle, IndicatorResult } from "./types.js";

export type Regime = "BULL" | "BEAR" | "SIDEWAYS" | "HIGH_VOL";

export interface RegimeResult {
  regime: Regime;
  confidence: number;
  adx: number;
  microScore: number;
}

export function detectRegime(
  candles: Candle[],
  indicators: IndicatorResult,
  microScore = 0,
  adxThreshold = 25,
): RegimeResult {
  const price = candles[candles.length - 1].close;
  const { adx, volume, ema } = indicators;

  // Volatility check first
  const volRatio = volume.ratio;
  if (volRatio > 2.0) {
    const conf = Math.min(volRatio / 3, 1.0);

    if (Math.abs(microScore) >= 30) {
      return {
        regime: microScore > 0 ? "BULL" : "BEAR",
        confidence: Math.min(conf + 0.2, 1.0),
        adx: adx.value,
        microScore,
      };
    }

    return { regime: "HIGH_VOL", confidence: conf, adx: adx.value, microScore };
  }

  // Microstructure override
  if (Math.abs(microScore) >= 30) {
    const regime = microScore > 0 ? "BULL" : "BEAR";
    return { regime, confidence: 0.7, adx: adx.value, microScore };
  }

  // ADX-based trend detection
  if (adx.value < adxThreshold) {
    return { regime: "SIDEWAYS", confidence: Math.min((1 - adx.value / adxThreshold) * 0.8, 0.8), adx: adx.value, microScore };
  }

  // Score-based direction
  let score = 0;

  score += (adx.value / 50) * 0.3;

  if (ema.alignment === "bullish") score += 0.3;
  else if (ema.alignment === "bearish") score -= 0.3;

  if (indicators.macd.status === "bullish") score += 0.2;
  else if (indicators.macd.status === "bearish") score -= 0.2;

  if (ema.ema50 !== null && price > ema.ema50 * 1.02) score += 0.2;
  else if (ema.ema50 !== null && price < ema.ema50 * 0.98) score -= 0.2;

  let regime: Regime;
  if (score > 0.3) regime = "BULL";
  else if (score < -0.3) regime = "BEAR";
  else regime = "SIDEWAYS";

  return {
    regime,
    confidence: Math.min(Math.abs(score) + 0.3, 1.0),
    adx: adx.value,
    microScore,
  };
}

export function getSignalsForRegime(regime: Regime): { bias: number; threshold: number; preferred: "LONG" | "SHORT" | "NONE" } {
  switch (regime) {
    case "BULL":
      return { bias: 0.6, threshold: 50, preferred: "LONG" };
    case "BEAR":
      return { bias: 0.4, threshold: 55, preferred: "SHORT" };
    case "SIDEWAYS":
      return { bias: 0.5, threshold: 55, preferred: "SHORT" };
    case "HIGH_VOL":
      return { bias: 0.5, threshold: 55, preferred: "NONE" };
  }
}

export const REGIME_SL_TP: Record<Regime, { slMult: number; tpMult: number }> = {
  BULL: { slMult: 2.5, tpMult: 3.5 },
  BEAR: { slMult: 2.0, tpMult: 3.0 },
  SIDEWAYS: { slMult: 1.5, tpMult: 2.5 },
  HIGH_VOL: { slMult: 3.0, tpMult: 4.0 },
};
