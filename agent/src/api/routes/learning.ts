import { Hono } from "hono";
import type { AppContext } from "../server.js";

export const learningRoutes = new Hono<{ Variables: { deps: AppContext } }>();

learningRoutes.get("/lessons", async (c) => {
  const { listLessons, getPerformanceSummary } = await import("../../learning/index.js");
  const limit = Number(c.req.query("limit")) || 20;
  const lessons = listLessons(limit);
  const summary = getPerformanceSummary();

  return c.json({ lessons, summary });
});

learningRoutes.get("/weights", async (c) => {
  const { getWeightsSummary } = await import("../../learning/index.js");
  const summary = getWeightsSummary();
  return c.json({ summary });
});

learningRoutes.get("/skills", async (c) => {
  const { getSkillSummary } = await import("../../learning/index.js");
  const summary = getSkillSummary();
  return c.json({ summary });
});
