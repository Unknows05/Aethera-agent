import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DATA_DIR = join(fileURLToPath(import.meta.url), "..", "..", "..", "data");
const LESSONS_FILE = join(DATA_DIR, "lessons.json");

export interface Lesson {
  id: number;
  rule: string;
  tags: string[];
  outcome: "good" | "bad" | "poor" | "manual";
  sourceType: "performance" | "manual" | "config_change" | "review";
  confidence: number;
  context?: string;
  pinned: boolean;
  role?: "hunter" | "healer" | "general";
  pnlPct?: number;
  created_at: string;
}

interface LessonsData {
  lessons: Lesson[];
  performance: PerformanceRecord[];
}

interface PerformanceRecord {
  symbol: string;
  direction: string;
  pnlPct: number;
  pnlUsd: number;
  exitReason: string;
  recorded_at: string;
}

function load(): LessonsData {
  try {
    if (existsSync(LESSONS_FILE)) {
      return JSON.parse(readFileSync(LESSONS_FILE, "utf8"));
    }
  } catch { /* ignore */ }
  return { lessons: [], performance: [] };
}

function save(data: LessonsData): void {
  writeFileSync(LESSONS_FILE, JSON.stringify(data, null, 2));
}

export function recordPerformance(perf: {
  symbol: string;
  direction: "LONG" | "SHORT";
  pnlPct: number;
  pnlUsd: number;
  exitReason: string;
  regime?: string;
  confidence?: number;
}): void {
  const data = load();

  const entry: PerformanceRecord = {
    symbol: perf.symbol,
    direction: perf.direction,
    pnlPct: Math.round(perf.pnlPct * 100) / 100,
    pnlUsd: Math.round(perf.pnlUsd * 100) / 100,
    exitReason: perf.exitReason,
    recorded_at: new Date().toISOString(),
  };

  data.performance.push(entry);

  const lesson = deriveLesson(perf);
  if (lesson) {
    data.lessons.push(lesson);
  }

  save(data);
}

function deriveLesson(perf: {
  symbol: string;
  direction: string;
  pnlPct: number;
  pnlUsd: number;
  exitReason: string;
  regime?: string;
  confidence?: number;
}): Lesson | null {
  const outcome = perf.pnlPct >= 5 ? "good"
    : perf.pnlPct >= 0 ? "poor"
    : "bad";

  if (outcome === "poor") return null;

  let rule = "";
  const tags: string[] = [perf.direction.toLowerCase()];

  if (outcome === "good") {
    rule = `WORKED: ${perf.symbol} ${perf.direction} → PnL +${perf.pnlPct}%. ${perf.regime ? `Regime: ${perf.regime}.` : ""} ${perf.exitReason}`;
    tags.push("worked");
  } else {
    rule = `FAILED: ${perf.symbol} ${perf.direction} → PnL ${perf.pnlPct}%. ${perf.regime ? `Regime: ${perf.regime}.` : ""} Reason: ${perf.exitReason}`;
    tags.push("failed");
    if (perf.exitReason.toLowerCase().includes("sl")) tags.push("stop_loss");
    if (perf.exitReason.toLowerCase().includes("tp")) tags.push("take_profit");
  }

  if (perf.regime) tags.push(perf.regime.toLowerCase());

  const confidence = outcome === "good" ? 0.7 : 0.8;

  return {
    id: Date.now(),
    rule,
    tags,
    outcome,
    sourceType: "performance",
    confidence,
    context: `${perf.symbol} ${perf.direction} PnL: ${perf.pnlPct}%`,
    pinned: false,
    pnlPct: perf.pnlPct,
    created_at: new Date().toISOString(),
  };
}

export function addManualLesson(
  rule: string,
  tags: string[] = [],
  opts: { pinned?: boolean; role?: "hunter" | "healer" | "general" } = {},
): Lesson {
  const data = load();
  const lesson: Lesson = {
    id: Date.now(),
    rule,
    tags,
    outcome: "manual",
    sourceType: "manual",
    confidence: 0.5,
    pinned: opts.pinned ?? false,
    role: opts.role,
    created_at: new Date().toISOString(),
  };
  data.lessons.push(lesson);
  save(data);
  return lesson;
}

const ROLE_TAGS: Record<string, string[]> = {
  hunter: ["entry", "long", "short", "score", "signal", "regime"],
  healer: ["exit", "sl", "tp", "close", "risk", "management"],
  general: [],
};

export function getLessonsForPrompt(opts: {
  agentType?: "hunter" | "healer" | "general";
  maxLessons?: number;
} = {}): string | null {
  const { agentType = "general", maxLessons = 15 } = opts;
  const data = load();

  if (data.lessons.length === 0) return null;

  const PINNED_CAP = 5;
  const ROLE_CAP = 6;
  const RECENT_CAP = maxLessons;

  const byPriority = (a: Lesson, b: Lesson) => {
    const order: Record<string, number> = { bad: 0, failed: 1, good: 2, manual: 3 };
    return (order[a.outcome] ?? 3) - (order[b.outcome] ?? 3);
  };

  const pinned = data.lessons
    .filter((l) => l.pinned && (!l.role || l.role === agentType || agentType === "general"))
    .sort(byPriority)
    .slice(0, PINNED_CAP);

  const usedIds = new Set(pinned.map((l) => l.id));

  const roleTags = ROLE_TAGS[agentType] || [];
  const roleMatched = data.lessons
    .filter((l) => {
      if (usedIds.has(l.id)) return false;
      const roleOk = !l.role || l.role === agentType || agentType === "general";
      const tagOk = roleTags.length === 0 || !l.tags?.length || l.tags.some((t) => roleTags.includes(t));
      return roleOk && tagOk;
    })
    .sort(byPriority)
    .slice(0, ROLE_CAP);

  roleMatched.forEach((l) => usedIds.add(l.id));

  const remaining = RECENT_CAP - pinned.length - roleMatched.length;
  const recent = remaining > 0
    ? data.lessons
        .filter((l) => !usedIds.has(l.id))
        .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
        .slice(0, remaining)
    : [];

  const selected = [...pinned, ...roleMatched, ...recent];
  if (selected.length === 0) return null;

  return selected.map((l) => {
    const date = l.created_at ? l.created_at.slice(0, 16).replace("T", " ") : "";
    const pin = l.pinned ? "📌 " : "";
    return `${pin}[${l.outcome.toUpperCase()}] [${date}] ${l.rule}`;
  }).join("\n");
}

export function getPerformanceSummary(): {
  totalTrades: number;
  totalPnlUsd: number;
  avgPnlPct: number;
  winRate: number;
  totalLessons: number;
} | null {
  const data = load();
  if (data.performance.length === 0) return null;

  const totalPnl = data.performance.reduce((s, p) => s + p.pnlUsd, 0);
  const avgPnl = data.performance.reduce((s, p) => s + p.pnlPct, 0) / data.performance.length;
  const wins = data.performance.filter((p) => p.pnlUsd > 0).length;

  return {
    totalTrades: data.performance.length,
    totalPnlUsd: Math.round(totalPnl * 100) / 100,
    avgPnlPct: Math.round(avgPnl * 100) / 100,
    winRate: Math.round((wins / data.performance.length) * 100),
    totalLessons: data.lessons.length,
  };
}

export function listLessons(limit = 20): Lesson[] {
  const data = load();
  return data.lessons.slice(-limit).reverse();
}
