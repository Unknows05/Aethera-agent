export type Regime = "BULL" | "BEAR" | "SIDEWAYS" | "HIGH_VOL";
export type Direction = "LONG" | "SHORT";

interface RegimeFilterResult {
  allowed: boolean;
  reason?: string;
}

const REGIME_STATS: Record<string, { wr: number; blocked: boolean }> = {
  "SIDEWAYS_LONG": { wr: 0.35, blocked: true },
  "SIDEWAYS_SHORT": { wr: 0.62, blocked: false },
  "BULL_LONG": { wr: 0.58, blocked: false },
  "BULL_SHORT": { wr: 0.66, blocked: false },
  "BEAR_LONG": { wr: 0.50, blocked: false },
  "BEAR_SHORT": { wr: 0.55, blocked: false },
  "HIGH_VOL_LONG": { wr: 0.70, blocked: false },
  "HIGH_VOL_SHORT": { wr: 0.36, blocked: true },
};

export function checkRegimeFilter(regime: Regime, direction: Direction): RegimeFilterResult {
  const key = `${regime}_${direction}`;
  const stats = REGIME_STATS[key];

  if (!stats) {
    return { allowed: true };
  }

  if (stats.blocked) {
    return {
      allowed: false,
      reason: `${regime}+${direction} memiliki WR ${(stats.wr * 100).toFixed(0)}% — tidak diizinkan. ${getAlternativeTip(regime, direction)}`,
    };
  }

  return { allowed: true };
}

function getAlternativeTip(regime: Regime, direction: Direction): string {
  const alternatives: Record<string, string> = {
    "SIDEWAYS_LONG": "Gunakan SHORT untuk SIDEWAYS (WR 62%)",
    "HIGH_VOL_SHORT": "Gunakan LONG untuk HIGH_VOL (WR 70%)",
  };
  return alternatives[`${regime}_${direction}`] ?? "";
}

export function getRegimeStats(): Record<string, { wr: number; blocked: boolean }> {
  return { ...REGIME_STATS };
}
