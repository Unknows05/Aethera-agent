import type { EquityTier } from "../config/schema.js";

export interface LeverageParams {
  atrPercent: number;
  conviction: number;
  tier: EquityTier;
  equity: number;
}

export function calculateLeverage(params: LeverageParams): number {
  const { atrPercent, conviction, tier, equity } = params;

  const baseLeverage = Math.floor(1 / Math.max(atrPercent / 100, 0.005));

  const convictionMult = conviction >= 75 ? 1.0
    : conviction >= 60 ? 0.75
    : conviction >= 45 ? 0.5
    : 0.25;

  const rawLeverage = baseLeverage * convictionMult;

  let volatilityCap = 5;
  if (atrPercent < 1) volatilityCap = 5;
  else if (atrPercent < 2) volatilityCap = 3;
  else if (atrPercent < 3) volatilityCap = 2;
  else volatilityCap = 1;

  let equityFloor = tier.maxLeverage;
  if (equity < 100) equityFloor = Math.min(3, equityFloor);
  else if (equity < 300) equityFloor = Math.min(5, equityFloor);

  const finalLeverage = Math.max(1, Math.min(rawLeverage, volatilityCap, equityFloor));

  return Math.round(finalLeverage);
}
