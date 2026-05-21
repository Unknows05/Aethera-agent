import { Hono } from "hono";
import type { AppContext } from "../server.js";
import type { ScoredCoin } from "../../screening/types.js";

export const signalsRoutes = new Hono<{ Variables: { deps: AppContext } }>();

signalsRoutes.get("/", async (c) => {
  const top = Number(c.req.query("top")) || 20;
  const deps = c.get("deps");

  try {
    const result = await deps.scanner.scan();
    const signals = (result.coins as ScoredCoin[])
      .filter((coin) => coin.direction !== "WAIT")
      .slice(0, top);

    return c.json({
      total: result.coins.length,
      signals,
      scanDuration: result.durationMs,
    });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

signalsRoutes.get("/top", async (c) => {
  const count = Number(c.req.query("count")) || 5;
  const deps = c.get("deps");

  try {
    const result = await deps.scanner.scan();
    const top = (result.coins as ScoredCoin[])
      .filter((coin) => coin.direction !== "WAIT")
      .slice(0, count);

    return c.json(top);
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});
