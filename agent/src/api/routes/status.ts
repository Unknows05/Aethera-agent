import { Hono } from "hono";
import type { AppContext } from "../server.js";

export const statusRoutes = new Hono<{ Variables: { deps: AppContext } }>();

statusRoutes.get("/", async (c) => {
  try {
    const { BinanceClient } = await import("../../exchange/binance.js");
    const deps = c.get("deps");
    const client = new BinanceClient(deps.config.binance.apiKey, deps.config.binance.apiSecret);
    const balance = await client.getBalance();
    const positions = await client.getPositionRisk();
    const openPositions = positions.filter((p) => Number(p.positionAmt) !== 0);

    return c.json({
      exchange: "Binance Futures (Mainnet)",
      balance,
      equity: balance,
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
    });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});
