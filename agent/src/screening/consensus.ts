import type { ScoredCoin } from "./types.js";

export interface HivemindConsensus {
  symbol: string;
  longs: number;
  shorts: number;
  avgConfidence: number;
  totalVotes: number;
  direction: "LONG" | "SHORT" | "NEUTRAL";
}

export function buildConsensusMap(
  aggregatedSignals: Array<{
    symbol: string;
    longs: number;
    shorts: number;
    avgConfidence: number;
    totalVotes: number;
  }>,
  minVotes = 2,
): Map<string, HivemindConsensus> {
  const map = new Map<string, HivemindConsensus>();

  for (const s of aggregatedSignals) {
    if (s.totalVotes < minVotes) continue;

    const direction = s.longs > s.shorts ? "LONG" : s.shorts > s.longs ? "SHORT" : "NEUTRAL";

    map.set(s.symbol, {
      symbol: s.symbol,
      longs: s.longs,
      shorts: s.shorts,
      avgConfidence: s.avgConfidence,
      totalVotes: s.totalVotes,
      direction,
    });
  }

  return map;
}

const CONSENSUS_BOOST = 8;
const CONSENSUS_PENALTY = -10;
const STRONG_BOOST = 14;

export function applyConsensusToCoins(
  coins: ScoredCoin[],
  consensusMap: Map<string, HivemindConsensus>,
  weightMultiplier = 1.0,
): ScoredCoin[] {
  return coins.map((coin) => {
    const consensus = consensusMap.get(coin.symbol);
    if (!consensus) return coin;

    // If local direction is WAIT, consensus doesn't override
    if (coin.direction === "WAIT") return coin;

    const adjusted = { ...coin };
    const agree =
      (coin.direction === "LONG" && consensus.direction === "LONG") ||
      (coin.direction === "SHORT" && consensus.direction === "SHORT");
    const disagree =
      (coin.direction === "LONG" && consensus.direction === "SHORT") ||
      (coin.direction === "SHORT" && consensus.direction === "LONG");

    let adjustment = 0;

    if (agree) {
      // Stronger agreement with more votes → bigger boost
      const strength = Math.min(consensus.totalVotes / 5, 1);
      adjustment = (CONSENSUS_BOOST + (STRONG_BOOST - CONSENSUS_BOOST) * strength) * weightMultiplier;
      if (coin.reasons) {
        adjusted.reasons = [
          ...coin.reasons,
          `hivemind: ${consensus.longs}L/${consensus.shorts}S agree (${consensus.totalVotes} votes)`,
        ];
      }
    } else if (disagree) {
      // Disagreement → penalize (weaker if there's little consensus)
      const strength = Math.min(consensus.totalVotes / 3, 1);
      adjustment = CONSENSUS_PENALTY * strength * weightMultiplier;
      if (coin.reasons) {
        adjusted.reasons = [
          ...coin.reasons,
          `hivemind: ${consensus.longs}L/${consensus.shorts}S disagree (${consensus.totalVotes} votes)`,
        ];
      }
    } else {
      // NEUTRAL consensus — minor boost for having any signal
      adjustment = 3 * weightMultiplier;
    }

    adjusted.score = Math.max(0, Math.min(100, Math.round(adjusted.score + adjustment)));

    // Recompute direction if score crossed threshold
    if (adjusted.score >= 55 && coin.direction !== "LONG") {
      adjusted.direction = "LONG";
    } else if (adjusted.score <= 45 && coin.direction !== "SHORT") {
      adjusted.direction = "SHORT";
    } else if (adjusted.score > 45 && adjusted.score < 55) {
      adjusted.direction = "WAIT";
    }

    return adjusted;
  });
}
