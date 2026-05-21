import { Hono } from "hono";
import { z } from "zod";
import { registerAgent, authenticateAgent } from "../db.js";

export const authRoutes = new Hono();

const registerSchema = z.object({
  username: z.string().min(1).max(50),
  apiKey: z.string().min(8).max(128),
});

authRoutes.post("/register", async (c) => {
  try {
    const body = registerSchema.parse(await c.req.json());
    const agent = registerAgent(body.username, body.apiKey);
    return c.json({ ok: true, agentId: agent.id });
  } catch (e) {
    return c.json({ ok: false, error: String(e) }, 400);
  }
});

authRoutes.post("/login", async (c) => {
  try {
    const { apiKey } = z.object({ apiKey: z.string() }).parse(await c.req.json());
    const agent = authenticateAgent(apiKey);
    if (!agent) return c.json({ ok: false, error: "Invalid API key" }, 401);
    return c.json({ ok: true, agent });
  } catch (e) {
    return c.json({ ok: false, error: String(e) }, 400);
  }
});
