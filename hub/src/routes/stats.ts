import { Hono } from "hono";
import { getLeaderboard, getNetworkStats } from "../db.js";

export const statsRoutes = new Hono();

statsRoutes.get("/leaderboard", async (c) => {
  const limit = Number(c.req.query("limit")) || 10;
  const board = getLeaderboard(limit);
  return c.json({ leaderboard: board });
});

statsRoutes.get("/network", async (c) => {
  const stats = getNetworkStats();
  return c.json(stats);
});
