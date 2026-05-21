export type Session = "ASIA" | "LONDON" | "NEW_YORK" | "LONDON_NY";

export interface SessionInfo {
  session: Session;
  hour: number;
}

export function getCurrentSession(): SessionInfo {
  const h = new Date().getUTCHours();

  const isLondon = h >= 8 && h < 16;
  const isNY = h >= 13 && h < 22;
  const isLondonNY = h >= 13 && h < 16;

  if (isLondonNY) return { session: "LONDON_NY", hour: h };
  if (isLondon) return { session: "LONDON", hour: h };
  if (isNY) return { session: "NEW_YORK", hour: h };
  return { session: "ASIA", hour: h };
}

interface SessionAdjustment {
  scoreModifier: number;
  volMultiplier: number;
  tpMultiplier: number;
}

const SESSION_STATS: Record<Session, SessionAdjustment> = {
  ASIA: { scoreModifier: 0.95, volMultiplier: 0.8, tpMultiplier: 0.9 },
  LONDON: { scoreModifier: 1.0, volMultiplier: 1.0, tpMultiplier: 1.0 },
  NEW_YORK: { scoreModifier: 1.0, volMultiplier: 1.0, tpMultiplier: 1.0 },
  LONDON_NY: { scoreModifier: 1.05, volMultiplier: 1.3, tpMultiplier: 1.15 },
};

export function applySessionFilter(score: number, sl: number, tp: number, price: number): {
  score: number;
  sl: number;
  tp: number;
  session: Session;
} {
  const { session } = getCurrentSession();
  const adj = SESSION_STATS[session];

  const adjustedScore = Math.max(0, Math.min(100, Math.round(score * adj.scoreModifier)));
  const slDistance = Math.abs(sl - price);
  const tpDistance = Math.abs(tp - price);

  const adjustedSl = sl > price
    ? price + slDistance * adj.volMultiplier
    : price - slDistance * adj.volMultiplier;
  const adjustedTp = tp > price
    ? price + tpDistance * adj.tpMultiplier
    : price - tpDistance * adj.tpMultiplier;

  return {
    score: adjustedScore,
    sl: Math.round(adjustedSl * 100) / 100,
    tp: Math.round(adjustedTp * 100) / 100,
    session,
  };
}
