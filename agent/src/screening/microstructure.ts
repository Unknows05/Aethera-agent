import type { BinanceClient } from "../exchange/binance.js";
import type { MicrostructureResult } from "./types.js";

export async function getMicrostructure(
  symbol: string,
  client: BinanceClient,
): Promise<MicrostructureResult> {
  const defaults: MicrostructureResult = {
    sentiment: 50,
    longShortRatio: 0.5,
    takerBuyRatio: 0.5,
    fundingAnnualized: 0,
    whaleSignal: "neutral",
    orderbookImbalance: 0,
    liquidationRisk: "none",
    adjustments: { sentiment: 0, funding: 0, whale: 0, liquidity: 0, total: 0 },
  };

  try {
    const [lsRatio, takerVol, funding, depth] = await Promise.all([
      client.getLongShortRatio(symbol).catch(() => null),
      client.getTakerVolume(symbol).catch(() => null),
      client.getFundingRate(symbol, 1).catch(() => null),
      client.getDepth(symbol, 100).catch(() => null),
    ]);

    let sentiment = 50;

    // Long/Short ratio
    if (lsRatio && lsRatio.length > 0) {
      const ratio = Number(lsRatio[0].longShortRatio);
      const longPct = ratio / (1 + ratio);
      defaults.longShortRatio = longPct;

      if (longPct > 0.75) {
        sentiment += (0.5 - longPct) * 40;
        defaults.whaleSignal = "extreme_long";
      } else if (longPct < 0.3) {
        sentiment += (0.5 - longPct) * 40;
        defaults.whaleSignal = "extreme_short";
      }
    }

    // Taker volume
    if (takerVol && takerVol.length > 0) {
      const buyRatio = Number(takerVol[0].buySellRatio);
      const buyPct = buyRatio / (1 + buyRatio);
      defaults.takerBuyRatio = buyPct;
      if (buyPct > 0.65) defaults.whaleSignal = "heavy_buying";
      else if (buyPct < 0.35) defaults.whaleSignal = "heavy_selling";
    }

    // Funding rate
    if (funding && funding.length > 0) {
      const annualized = Number(funding[0].fundingRate) * 3 * 365;
      defaults.fundingAnnualized = annualized;
      if (annualized > 0.3) sentiment -= annualized * 30;
      else if (annualized < -0.3) sentiment += Math.abs(annualized) * 30;
    }

    // Orderbook imbalance
    if (depth) {
      const bidVol = depth.bids.slice(0, 10).reduce((s, [_, q]) => s + Number(q), 0);
      const askVol = depth.asks.slice(0, 10).reduce((s, [_, q]) => s + Number(q), 0);
      defaults.orderbookImbalance = (bidVol + askVol) > 0
        ? (bidVol - askVol) / (bidVol + askVol)
        : 0;
    }

    sentiment = Math.max(0, Math.min(100, sentiment));

    // Calculate adjustments
    const adjSentiment = sentiment > 70 ? -5 : sentiment < 40 ? 5 : 0;
    const adjFunding = defaults.fundingAnnualized > 0.3 ? -8 : defaults.fundingAnnualized < -0.3 ? 8 : 0;
    const adjWhale = defaults.whaleSignal === "heavy_buying" ? 3 : defaults.whaleSignal === "heavy_selling" ? -3 : 0;
    const adjLiquidity = defaults.orderbookImbalance > 0.2 ? 4 : defaults.orderbookImbalance < -0.2 ? -4 : 0;

    defaults.sentiment = sentiment;
    defaults.adjustments = {
      sentiment: adjSentiment,
      funding: adjFunding,
      whale: adjWhale,
      liquidity: adjLiquidity,
      total: adjSentiment + adjFunding + adjWhale + adjLiquidity,
    };

    return defaults;
  } catch {
    return defaults;
  }
}
