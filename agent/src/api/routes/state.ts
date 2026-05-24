import { Hono } from "hono";
import type { AppContext } from "../server.js";
import { loadConfig } from "../../config/index.js";
import { BinanceClient } from "../../exchange/binance.js";
import { Scanner } from "../../screening/scanner.js";

export const stateRoutes = new Hono<{ Variables: { deps: AppContext } }>();

stateRoutes.get("/", async (c) => {
  const deps = c.get("deps");

  try {
    const client = new BinanceClient(deps.config.binance.apiKey, deps.config.binance.apiSecret);
    const [balance, positions, premiumIndices] = await Promise.all([
      client.getBalance(),
      client.getPositionRisk(),
      client.getPremiumIndices(),
    ]);

    const openPositions = positions.filter((p) => Number(p.positionAmt) !== 0);
    const btcPremium = premiumIndices.find((p) => p.symbol === "BTCUSDT");
    const fundingRates = premiumIndices.map((p) => Number(p.lastFundingRate)).filter((f) => f !== 0);
    const fundingAvg = fundingRates.length > 0
      ? fundingRates.reduce((s, f) => s + f, 0) / fundingRates.length
      : 0;

    let scanResult = null;
    try {
      const scanner = deps.scanner;
      scanResult = await scanner.scan();
    } catch { /* non-critical */ }

    return c.json({
      balance,
      equity: balance,
      btcPrice: btcPremium ? Number(btcPremium.markPrice) : 0,
      fundingAvg,
      openPositions: openPositions.length,
      positions: openPositions.map((p) => ({
        symbol: p.symbol,
        side: Number(p.positionAmt) > 0 ? "LONG" : "SHORT",
        size: Math.abs(Number(p.positionAmt)),
        entryPrice: Number(p.entryPrice),
        markPrice: Number(p.markPrice),
        pnl: Number(p.unrealizedProfit),
        leverage: Number(p.leverage),
        liquidationPrice: Number(p.liquidationPrice),
      })),
      signals: scanResult
        ? scanResult.coins
            .filter((c) => c.direction !== "WAIT")
            .slice(0, 20)
            .map((c) => ({
              symbol: c.symbol,
              score: c.score,
              direction: c.direction,
              confidence: c.confidence,
              regime: c.regime,
              reasons: c.reasons,
              fundingRate: c.fundingRate,
              openInterest: c.openInterest,
              takerBuyRatio: c.takerBuyRatio,
              depthImbalance: c.depthImbalance,
              volume24h: c.volume24h,
            }))
        : [],
      uptime: Date.now() - deps.startTime,
    });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});
