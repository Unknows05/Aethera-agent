import type { EquityTier } from "../config/schema.js";

export interface SizingParams {
  equity: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  tier: EquityTier;
  confidence: number;
}

export interface SizingResult {
  riskAmount: number;
  riskPct: number;
  notional: number;
  positionSize: number;
  kellyFraction: number;
  capped: boolean;
}

export function calculateKelly(wr: number, rr: number): number {
  if (rr <= 0) return 0;
  return wr - (1 - wr) / rr;
}

export function calculatePositionSize(params: SizingParams): SizingResult {
  const { equity, winRate, avgWin, avgLoss, tier, confidence } = params;

  const rr = avgLoss > 0 ? avgWin / avgLoss : 2.5;
  const kelly = calculateKelly(winRate, rr);
  const halfKelly = Math.max(0, kelly / 2);

  const confidenceMult = confidence >= 75 ? 1.0
    : confidence >= 60 ? 0.75
    : confidence >= 45 ? 0.5
    : 0.25;

  const rawRisk = halfKelly * confidenceMult;
  const cappedRisk = Math.min(rawRisk, tier.maxRisk);
  const riskAmount = equity * cappedRisk;
  const capped = rawRisk > tier.maxRisk;

  const notional = riskAmount;
  const positionSize = notional;

  return {
    riskAmount: Math.round(riskAmount * 100) / 100,
    riskPct: Math.round(cappedRisk * 10000) / 100,
    notional: Math.round(notional * 100) / 100,
    positionSize: Math.round(positionSize * 10000) / 10000,
    kellyFraction: Math.round(halfKelly * 1000) / 1000,
    capped,
  };
}

export function calculatePositionSizeSimple(
  equity: number,
  slPct: number,
  tier: EquityTier,
  confidence: number,
): SizingResult {
  const winRate = 0.55;
  const rr = slPct > 0 ? 2.5 / slPct : 2.5;
  const avgWin = 2.5;
  const avgLoss = 1;

  return calculatePositionSize({
    equity,
    winRate,
    avgWin,
    avgLoss,
    tier,
    confidence,
  });
}
