import { Hono } from "hono";
import { z } from "zod";
import { addSharedLesson, getSharedLessons, authenticateAgent } from "../db.js";

export const lessonRoutes = new Hono();

const lessonSchema = z.object({
  lessonJson: z.string(),
  tags: z.string().optional().default(""),
  win: z.number().int().min(0).max(1),
  agentId: z.string(),
});

lessonRoutes.post("/share", async (c) => {
  try {
    const body = lessonSchema.parse(await c.req.json());
    addSharedLesson({ id: crypto.randomUUID(), ...body });
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ ok: false, error: String(e) }, 400);
  }
});

const lessonShareSchema = z.object({
  lessonJson: z.string(),
  tags: z.string().optional().default(""),
  win: z.number().int().min(0).max(1),
});

lessonRoutes.post("/submit", async (c) => {
  try {
    const apiKey = c.req.header("x-api-key");
    if (!apiKey) return c.json({ ok: false, error: "Missing x-api-key header" }, 401);
    const agent = authenticateAgent(apiKey);
    if (!agent) return c.json({ ok: false, error: "Invalid apiKey" }, 401);

    const body = lessonShareSchema.parse(await c.req.json());
    addSharedLesson({ id: crypto.randomUUID(), ...body, agentId: agent.id });
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ ok: false, error: String(e) }, 400);
  }
});

lessonRoutes.get("/list", async (c) => {
  const limit = Number(c.req.query("limit")) || 20;
  const lessons = getSharedLessons(limit);
  return c.json({ lessons, count: lessons.length });
});
