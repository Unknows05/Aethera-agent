import { Hono } from "hono";
import { z } from "zod";
import { recordSignalVote, getAggregatedSignals, authenticateAgent } from "../db.js";

export const signalRoutes = new Hono();

const voteSchema = z.object({
  symbol: z.string(),
  direction: z.enum(["LONG", "SHORT", "WAIT"]),
  confidence: z.number().min(0).max(100),
  agentId: z.string(),
});

signalRoutes.post("/vote", async (c) => {
  try {
    const body = voteSchema.parse(await c.req.json());
    recordSignalVote({ id: crypto.randomUUID(), ...body });
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ ok: false, error: String(e) }, 400);
  }
});

// REST fallback — authenticates via apiKey header, no agentId in body needed
const submitSchema = z.object({
  symbol: z.string(),
  direction: z.enum(["LONG", "SHORT", "WAIT"]),
  confidence: z.number().min(0).max(100),
  funding_rate: z.number().optional(),
  open_interest: z.number().optional(),
  oi_change: z.number().optional(),
  taker_buy_ratio: z.number().optional(),
  top_long_short_ratio: z.number().optional(),
  global_long_short_ratio: z.number().optional(),
  depth_imbalance: z.number().optional(),
  volume_24h: z.number().optional(),
});

signalRoutes.post("/submit", async (c) => {
  try {
    const apiKey = c.req.header("x-api-key");
    if (!apiKey) return c.json({ ok: false, error: "Missing x-api-key header" }, 401);
    const agent = authenticateAgent(apiKey);
    if (!agent) return c.json({ ok: false, error: "Invalid apiKey" }, 401);

    const body = submitSchema.parse(await c.req.json());
    recordSignalVote({ id: crypto.randomUUID(), ...body, agentId: agent.id });
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ ok: false, error: String(e) }, 400);
  }
});

signalRoutes.get("/aggregated", async (c) => {
  const minVotes = Number(c.req.query("min")) || 2;
  const signals = getAggregatedSignals(minVotes);
  return c.json({ signals, count: signals.length });
});
