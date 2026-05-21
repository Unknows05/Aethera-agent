export function calculateEMA(values: number[], period: number): number[] {
  if (values.length < period) return [];

  const multiplier = 2 / (period + 1);
  const ema: number[] = [];

  const sma = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
  ema.push(sma);

  for (let i = period; i < values.length; i++) {
    ema.push((values[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1]);
  }

  return ema;
}

export interface EMAAlignment {
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  alignment: "bullish" | "bearish" | "neutral";
}

export function detectEMAAlignment(closes: number[]): EMAAlignment {
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, 200);

  const e20 = ema20.length > 0 ? ema20[ema20.length - 1] : null;
  const e50 = ema50.length > 0 ? ema50[ema50.length - 1] : null;
  const e200 = ema200.length > 0 ? ema200[ema200.length - 1] : null;
  const price = closes[closes.length - 1];

  let alignment: "bullish" | "bearish" | "neutral" = "neutral";
  if (e20 !== null && e50 !== null && e200 !== null) {
    if (price > e20 && e20 > e50 && e50 > e200) alignment = "bullish";
    else if (price < e20 && e20 < e50 && e50 < e200) alignment = "bearish";
  }

  return { ema20: e20, ema50: e50, ema200: e200, alignment };
}
