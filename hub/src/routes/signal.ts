import { Hono } from "hono";
import { z } from "zod";
import { recordSignalVote, getAggregatedSignals } from "../db.js";

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

signalRoutes.get("/aggregated", async (c) => {
  const minVotes = Number(c.req.query("min")) || 2;
  const signals = getAggregatedSignals(minVotes);
  return c.json({ signals, count: signals.length });
});
