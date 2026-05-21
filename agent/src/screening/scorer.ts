import type { Candle, IndicatorResult, ScoredCoin, Timeframe } from "./types.js";
import { computeIndicators, computeRawScore } from "./indicators/index.js";
import { detectRegime, type RegimeResult } from "./regime.js";
import type { MicrostructureResult } from "./types.js";

export interface TfData {
  timeframe: Timeframe;
  candles: Candle[];
}

const TF_WEIGHTS: Record<Timeframe, number> = { "15m": 0.6, "1h": 0.3, "4h": 0.1 };

export function scoreSymbol(
  symbol: string,
  tfData: TfData[],
  microstructure: MicrostructureResult | null,
  adxThreshold = 25,
): ScoredCoin {
  const tfScores: Array<{ score: number; regime: RegimeResult; indicators: IndicatorResult }> = [];
  let totalWeight = 0;

  for (const tf of tfData) {
    const indicators = computeIndicators(tf.candles);
    const price = tf.candles[tf.candles.length - 1].close;
    const rawScore = computeRawScore(indicators, price);
    const regime = detectRegime(tf.candles, indicators, 0, adxThreshold);

    tfScores.push({ score: rawScore, regime, indicators });
    totalWeight += TF_WEIGHTS[tf.timeframe];
  }

  const weightedSum = tfScores.reduce(
    (sum, ts, i) => sum + ts.score * TF_WEIGHTS[tfData[i].timeframe],
    0,
  );
  const baseScore = totalWeight > 0 ? weightedSum / totalWeight : 50;

  // Trend alignment
  const regimes = tfScores.map((s) => s.regime.regime);
  const allSame = regimes.every((r) => r === regimes[0]);
  const scoreSpread = Math.max(...tfScores.map((s) => s.score)) - Math.min(...tfScores.map((s) => s.score));

  let finalScore = baseScore;
  if (allSame) finalScore += 10;
  else if (scoreSpread > 30) finalScore -= 5;

  // Microstructure adjustment
  let adjTotal = 0;
  if (microstructure) {
    adjTotal = microstructure.adjustments.total;
    finalScore += adjTotal;
  }

  finalScore = Math.max(0, Math.min(100, Math.round(finalScore)));

  // Direction
  let direction: "LONG" | "SHORT" | "WAIT";
  const regimeInfo = detectRegime(tfData[0].candles, tfScores[0].indicators, microstructure?.adjustments.total ?? 0, adxThreshold);
  const bias = regimeInfo.regime === "BULL" ? 0 : regimeInfo.regime === "BEAR" ? 1 : 0.5;

  if (finalScore >= 55) direction = "LONG";
  else if (finalScore <= 45) direction = "SHORT";
  else direction = "WAIT";

  // Confidence calibration
  let confidence = finalScore;
  if (confidence > 65) confidence = 65 + (confidence - 65) * 0.6;
  if (confidence > 75) confidence = 71 + (confidence - 75) * 0.35;
  confidence = Math.max(0, Math.min(85, Math.round(confidence)));

  // Regime-based SL/TP
  const primaryTF = tfData[0];
  const price = primaryTF.candles[primaryTF.candles.length - 1].close;
  const atr = tfScores[0].indicators.atr.value;

  let slMult = 1.5;
  let tpMult = 2.5;
  if (regimeInfo.regime === "BULL") { slMult = 2.5; tpMult = 3.5; }
  else if (regimeInfo.regime === "BEAR") { slMult = 2.0; tpMult = 3.0; }
  else if (regimeInfo.regime === "HIGH_VOL") { slMult = 3.0; tpMult = 4.0; }

  const minSlDist = price * 0.005;
  const slOffset = Math.max(atr * slMult, minSlDist);
  const tpOffset = atr * tpMult;

  const sl = direction === "LONG" ? price - slOffset : price + slOffset;
  const tp = direction === "LONG" ? price + tpOffset : price - tpOffset;

  // Reasons
  const reasons: string[] = [];
  if (microstructure) {
    if (microstructure.adjustments.funding !== 0) reasons.push(`${microstructure.adjustments.funding > 0 ? "bullish" : "bearish"} funding`);
    if (microstructure.whaleSignal.includes("heavy")) reasons.push(`whale ${microstructure.whaleSignal}`);
    if (microstructure.adjustments.liquidity !== 0) reasons.push(`orderbook ${microstructure.adjustments.liquidity > 0 ? "support" : "resistance"}`);
  }
  if (regimeInfo.regime !== "SIDEWAYS") reasons.push(`${regimeInfo.regime} regime`);
  if (tfScores[0].indicators.volume.zscore > 2) reasons.push("volume spike");
  if (tfScores[0].indicators.macd.status !== "neutral") reasons.push(`MACD ${tfScores[0].indicators.macd.status}`);

  return {
    symbol,
    score: finalScore,
    direction,
    confidence,
    regime: regimeInfo.regime,
    regimeConfidence: regimeInfo.confidence,
    indicators: tfScores[0].indicators,
    sl: Math.round(sl * 100) / 100,
    tp: Math.round(tp * 100) / 100,
    reasons,
    microstructure: microstructure ?? undefined,
  };
}
