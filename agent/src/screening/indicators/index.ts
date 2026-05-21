import type { Candle, IndicatorResult } from "../types.js";
import { calculateRSI, computeRSIScore } from "./rsi.js";
import { calculateMACD, computeMACDScore } from "./macd.js";
import { calculateBollinger, computeBollingerScore } from "./bollinger.js";
import { analyzeVolume, computeVolumeScore } from "./volume.js";
import { calculateATR } from "./atr.js";
import { calculateADX } from "./adx.js";
import { detectEMAAlignment } from "./ema.js";

export function computeIndicators(candles: Candle[]): IndicatorResult {
  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1];

  const rsi = calculateRSI(closes);
  const macd = calculateMACD(closes);
  const bollinger = calculateBollinger(closes);
  const volume = analyzeVolume(candles);
  const atr = calculateATR(candles);
  const adx = calculateADX(candles);
  const ema = detectEMAAlignment(closes);

  const vwap = closes.reduce((s, v, i) => {
    const c = candles[i];
    return s + (c.high + c.low + c.close) / 3 * c.volume;
  }, 0) / candles.reduce((s, c) => s + c.volume, 0);

  const vwapDev = vwap > 0 ? ((price - vwap) / vwap) * 100 : 0;

  return {
    rsi: rsi.value,
    rsiSignal: rsi.signal,
    macd,
    ema,
    adx,
    atr,
    bollinger,
    volume,
    vwap: Math.round(vwap * 100) / 100,
    vwapDeviation: Math.round(vwapDev * 100) / 100,
  };
}

export function computeRawScore(indicators: IndicatorResult, price: number): number {
  const rsiScore = computeRSIScore(indicators.rsi);
  const macdScore = computeMACDScore(indicators.macd.histogram, price);
  const volScore = computeVolumeScore(indicators.volume.zscore, indicators.volume.ratio);
  const bbScore = computeBollingerScore(
    indicators.bollinger.percentB,
    indicators.bollinger.squeeze,
    price,
    indicators.bollinger.upper,
    indicators.bollinger.lower,
  );

  const raw = 50 + rsiScore + macdScore + volScore + bbScore;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export { calculateRSI, computeRSIScore } from "./rsi.js";
export { calculateMACD, computeMACDScore } from "./macd.js";
export { calculateBollinger, computeBollingerScore } from "./bollinger.js";
export { analyzeVolume, computeVolumeScore } from "./volume.js";
export { calculateATR } from "./atr.js";
export { calculateADX } from "./adx.js";
export { detectEMAAlignment } from "./ema.js";
