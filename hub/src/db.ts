import { existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const DB_PATH = join(DATA_DIR, "hivemind.db");

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    apiKey TEXT UNIQUE NOT NULL,
    connected INTEGER DEFAULT 0,
    lastSeen TEXT,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    totalPnl REAL DEFAULT 0,
    createdAt TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS lessons (
    id TEXT PRIMARY KEY,
    agentId TEXT NOT NULL,
    lessonJson TEXT NOT NULL,
    tags TEXT DEFAULT '',
    win INTEGER DEFAULT 0,
    timestamp TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (agentId) REFERENCES agents(id)
  );

  CREATE TABLE IF NOT EXISTS signal_votes (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    direction TEXT NOT NULL,
    confidence REAL NOT NULL,
    agentId TEXT NOT NULL,
    timestamp TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (agentId) REFERENCES agents(id)
  );

  CREATE TABLE IF NOT EXISTS global_weights (
    signalName TEXT PRIMARY KEY,
    weight REAL DEFAULT 1.0,
    sampleCount INTEGER DEFAULT 1
  );

  CREATE INDEX IF NOT EXISTS idx_votes_symbol ON signal_votes(symbol);
  CREATE INDEX IF NOT EXISTS idx_votes_timestamp ON signal_votes(timestamp);
  CREATE INDEX IF NOT EXISTS idx_lessons_timestamp ON lessons(timestamp);
  CREATE INDEX IF NOT EXISTS idx_agents_apikey ON agents(apiKey);
`);

function ts(): string {
  return new Date().toISOString();
}

export function registerAgent(username: string, apiKey: string): { id: string } {
  const existing = db.prepare("SELECT id FROM agents WHERE apiKey = ?").get(apiKey) as { id: string } | undefined;
  if (existing) return { id: existing.id };

  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO agents (id, username, apiKey, lastSeen) VALUES (?, ?, ?, ?)"
  ).run(id, username, apiKey, ts());
  return { id };
}

export function authenticateAgent(apiKey: string): { id: string; username: string } | null {
  const agent = db.prepare("SELECT id, username FROM agents WHERE apiKey = ?").get(apiKey) as { id: string; username: string } | undefined;
  return agent ?? null;
}

export function updateAgentConnection(agentId: string, connected: number): void {
  db.prepare("UPDATE agents SET connected = ?, lastSeen = ? WHERE id = ?").run(connected, ts(), agentId);
}

export function updateAgentStats(agentId: string, win: boolean, pnl: number): void {
  if (win) {
    db.prepare("UPDATE agents SET wins = wins + 1, totalPnl = totalPnl + ?, lastSeen = ? WHERE id = ?").run(pnl, ts(), agentId);
  } else {
    db.prepare("UPDATE agents SET losses = losses + 1, totalPnl = totalPnl + ?, lastSeen = ? WHERE id = ?").run(pnl, ts(), agentId);
  }
}

export function addSharedLesson(lesson: {
  id: string; agentId: string; lessonJson: string; tags: string; win: number
}): void {
  db.prepare(
    "INSERT INTO lessons (id, agentId, lessonJson, tags, win) VALUES (?, ?, ?, ?, ?)"
  ).run(lesson.id, lesson.agentId, lesson.lessonJson, lesson.tags, lesson.win);

  const count = (db.prepare("SELECT COUNT(*) as c FROM lessons").get() as { c: number }).c;
  if (count > 1000) {
    db.prepare("DELETE FROM lessons WHERE id IN (SELECT id FROM lessons ORDER BY timestamp ASC LIMIT ?)").run(count - 1000);
  }
}

export function getSharedLessons(limit = 20): Array<{
  id: string; agentId: string; username?: string;
  lessonJson: string; tags: string; win: number; timestamp: string;
}> {
  return db.prepare(`
    SELECT l.*, a.username FROM lessons l
    LEFT JOIN agents a ON a.id = l.agentId
    ORDER BY l.timestamp DESC LIMIT ?
  `).all(limit) as Array<any>;
}

export function recordSignalVote(vote: {
  id: string; symbol: string; direction: string; confidence: number; agentId: string
}): void {
  db.prepare(
    "INSERT INTO signal_votes (id, symbol, direction, confidence, agentId) VALUES (?, ?, ?, ?, ?)"
  ).run(vote.id, vote.symbol, vote.direction, vote.confidence, vote.agentId);

  const count = (db.prepare("SELECT COUNT(*) as c FROM signal_votes").get() as { c: number }).c;
  if (count > 10000) {
    db.prepare("DELETE FROM signal_votes WHERE id IN (SELECT id FROM signal_votes ORDER BY timestamp ASC LIMIT ?)").run(count - 10000);
  }
}

export function getAggregatedSignals(minVotes = 2): Array<{
  symbol: string; longs: number; shorts: number; avgConfidence: number; totalVotes: number;
}> {
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();

  const rows = db.prepare(`
    SELECT symbol,
      SUM(CASE WHEN direction = 'LONG' THEN 1 ELSE 0 END) as longs,
      SUM(CASE WHEN direction = 'SHORT' THEN 1 ELSE 0 END) as shorts,
      ROUND(AVG(confidence), 0) as avgConfidence,
      COUNT(*) as totalVotes
    FROM signal_votes
    WHERE timestamp >= ?
    GROUP BY symbol
    HAVING totalVotes >= ?
    ORDER BY totalVotes DESC
  `).all(oneHourAgo, minVotes) as Array<{ symbol: string; longs: number; shorts: number; avgConfidence: number; totalVotes: number }>;

  return rows.map((r) => ({
    symbol: r.symbol,
    longs: r.longs,
    shorts: r.shorts,
    avgConfidence: r.avgConfidence,
    totalVotes: r.totalVotes,
  }));
}

export function updateGlobalWeight(signalName: string, newWeight: number): void {
  const existing = db.prepare("SELECT sampleCount FROM global_weights WHERE signalName = ?").get(signalName) as { sampleCount: number } | undefined;
  if (existing) {
    const avg = (existing.sampleCount * 1.0 + newWeight) / (existing.sampleCount + 1);
    db.prepare("UPDATE global_weights SET weight = ?, sampleCount = sampleCount + 1 WHERE signalName = ?").run(avg, signalName);
  } else {
    db.prepare("INSERT INTO global_weights (signalName, weight) VALUES (?, ?)").run(signalName, newWeight);
  }
}

export function getGlobalWeights(): Array<{ signalName: string; weight: number; sampleCount: number }> {
  return db.prepare("SELECT * FROM global_weights ORDER BY sampleCount DESC").all() as Array<{ signalName: string; weight: number; sampleCount: number }>;
}

export function getLeaderboard(limit = 10): Array<{
  username: string; wins: number; losses: number; totalPnl: number; wr: number;
}> {
  return db.prepare(`
    SELECT username, wins, losses, totalPnl,
      ROUND(CAST(wins AS REAL) / NULLIF(wins + losses, 0) * 100, 1) as wr
    FROM agents
    WHERE wins + losses > 0
    ORDER BY totalPnl DESC
    LIMIT ?
  `).all(limit) as Array<{ username: string; wins: number; losses: number; totalPnl: number; wr: number }>;
}

export function getNetworkStats(): {
  totalAgents: number; onlineNow: number; totalLessons: number; totalVotes24h: number;
} {
  const twentyFourHAgo = new Date(Date.now() - 86400000).toISOString();
  const totalAgents = (db.prepare("SELECT COUNT(*) as c FROM agents").get() as { c: number }).c;
  const onlineNow = (db.prepare("SELECT COUNT(*) as c FROM agents WHERE connected = 1").get() as { c: number }).c;
  const totalLessons = (db.prepare("SELECT COUNT(*) as c FROM lessons").get() as { c: number }).c;
  const totalVotes24h = (db.prepare("SELECT COUNT(*) as c FROM signal_votes WHERE timestamp >= ?").get(twentyFourHAgo) as { c: number }).c;

  return { totalAgents, onlineNow, totalLessons, totalVotes24h };
}
