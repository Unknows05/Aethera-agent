import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "data");
const DECISIONS_FILE = join(DATA_DIR, "decisions.jsonl");

export interface DecisionEntry {
  timestamp: string;
  agent: "hunter" | "healer";
  type: "open_long" | "open_short" | "close_position" | "partial_close" | "trail_sl" | "wait" | "scan_market" | "add_lesson";
  symbol?: string;
  success: boolean;
  summary: string;
  reason?: string;
  risks?: string[];
  metrics?: Record<string, number>;
  rejected?: string[];
  error?: string;
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function appendDecision(entry: DecisionEntry): void {
  try {
    ensureDataDir();
    appendFileSync(DECISIONS_FILE, JSON.stringify(entry) + "\n");
  } catch { /* non-critical */ }
}

export function getRecentDecisions(limit = 10): DecisionEntry[] {
  try {
    if (!existsSync(DECISIONS_FILE)) return [];
    const content = readFileSync(DECISIONS_FILE, "utf8");
    const lines = content.trim().split("\n").filter(Boolean);
    return lines.slice(-limit).map((l) => JSON.parse(l) as DecisionEntry);
  } catch {
    return [];
  }
}
