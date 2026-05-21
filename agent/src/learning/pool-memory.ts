import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DATA_DIR = join(fileURLToPath(import.meta.url), "..", "..", "..", "data");
const MEMORY_FILE = join(DATA_DIR, "pool-memory.json");

interface PoolDeploy {
  deployed_at: string;
  closed_at: string;
  pnlPct: number | null;
  pnlUsd: number | null;
  feesEarnedUsd: number | null;
  rangeEfficiency: number | null;
  minutesHeld: number | null;
  closeReason: string | null;
  strategy: string | null;
}

interface PoolEntry {
  symbol: string;
  baseAsset: string;
  deploys: PoolDeploy[];
  totalDeploys: number;
  avgPnlPct: number;
  winRate: number;
  lastDeployedAt: string | null;
  lastOutcome: "profit" | "loss" | null;
  cooldownUntil: string | null;
  cooldownReason: string | null;
  notes: Array<{ note: string; added_at: string }>;
}

interface PoolMemoryDb {
  [address: string]: PoolEntry;
}

function load(): PoolMemoryDb {
  try {
    if (existsSync(MEMORY_FILE)) {
      return JSON.parse(readFileSync(MEMORY_FILE, "utf8"));
    }
  } catch { /* ignore */ }
  return {};
}

function save(db: PoolMemoryDb): void {
  writeFileSync(MEMORY_FILE, JSON.stringify(db, null, 2));
}

export function recordDeploy(symbol: string, deploy: {
  pnlPct: number;
  pnlUsd: number;
  feesEarnedUsd?: number;
  minutesHeld?: number;
  closeReason: string;
  strategy?: string;
  baseAsset?: string;
}): void {
  const db = load();

  if (!db[symbol]) {
    db[symbol] = {
      symbol,
      baseAsset: deploy.baseAsset ?? symbol.replace("USDT", ""),
      deploys: [],
      totalDeploys: 0,
      avgPnlPct: 0,
      winRate: 0,
      lastDeployedAt: null,
      lastOutcome: null,
      cooldownUntil: null,
      cooldownReason: null,
      notes: [],
    };
  }

  const entry = db[symbol];
  const deployEntry: PoolDeploy = {
    deployed_at: new Date().toISOString(),
    closed_at: new Date().toISOString(),
    pnlPct: deploy.pnlPct,
    pnlUsd: deploy.pnlUsd,
    feesEarnedUsd: deploy.feesEarnedUsd ?? null,
    rangeEfficiency: null,
    minutesHeld: deploy.minutesHeld ?? null,
    closeReason: deploy.closeReason,
    strategy: deploy.strategy ?? null,
  };

  entry.deploys.push(deployEntry);
  entry.totalDeploys = entry.deploys.length;
  entry.lastDeployedAt = deployEntry.closed_at;
  entry.lastOutcome = deploy.pnlPct >= 0 ? "profit" : "loss";

  const withPnl = entry.deploys.filter((d) => d.pnlPct != null);
  if (withPnl.length > 0) {
    entry.avgPnlPct = Math.round(
      withPnl.reduce((s, d) => s + d.pnlPct!, 0) / withPnl.length * 100
    ) / 100;
    entry.winRate = Math.round(
      withPnl.filter((d) => d.pnlPct! >= 0).length / withPnl.length * 100
    ) / 100;
  }

  // Cooldown for repeated OOR / low yield
  const recent = entry.deploys.slice(-3);
  const allOor = recent.length >= 3 && recent.every(
    (d) => d.closeReason?.toLowerCase().includes("oor") || d.closeReason?.toLowerCase().includes("out of range")
  );
  if (allOor) {
    const until = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    entry.cooldownUntil = until;
    entry.cooldownReason = "3x consecutive OOR closes";
  }

  save(db);
}

export function getPoolMemory(symbol: string): {
  known: boolean;
  totalDeploys: number;
  avgPnlPct: number;
  winRate: number;
  lastOutcome: string | null;
  cooldownUntil: string | null;
  cooldownReason: string | null;
  history: PoolDeploy[];
} {
  const db = load();
  const entry = db[symbol];

  if (!entry) {
    return {
      known: false,
      totalDeploys: 0,
      avgPnlPct: 0,
      winRate: 0,
      lastOutcome: null,
      cooldownUntil: null,
      cooldownReason: null,
      history: [],
    };
  }

  return {
    known: true,
    totalDeploys: entry.totalDeploys,
    avgPnlPct: entry.avgPnlPct,
    winRate: entry.winRate,
    lastOutcome: entry.lastOutcome,
    cooldownUntil: entry.cooldownUntil,
    cooldownReason: entry.cooldownReason,
    history: entry.deploys.slice(-10),
  };
}

export function isOnCooldown(symbol: string): boolean {
  const db = load();
  const entry = db[symbol];
  if (!entry?.cooldownUntil) return false;
  return new Date(entry.cooldownUntil) > new Date();
}

export function addPoolNote(symbol: string, note: string): void {
  const db = load();
  if (!db[symbol]) {
    db[symbol] = {
      symbol,
      baseAsset: symbol.replace("USDT", ""),
      deploys: [],
      totalDeploys: 0,
      avgPnlPct: 0,
      winRate: 0,
      lastDeployedAt: null,
      lastOutcome: null,
      cooldownUntil: null,
      cooldownReason: null,
      notes: [],
    };
  }
  db[symbol].notes.push({ note, added_at: new Date().toISOString() });
  save(db);
}

export function recallForSymbol(symbol: string): string | null {
  const mem = getPoolMemory(symbol);
  if (!mem.known) return null;

  const lines = [`SYMBOL MEMORY [${symbol}]: ${mem.totalDeploys} trade(s), avg PnL ${mem.avgPnlPct}%, win rate ${mem.winRate}%`];

  if (mem.cooldownUntil && new Date(mem.cooldownUntil) > new Date()) {
    lines.push(`COOLDOWN: active until ${mem.cooldownUntil} (${mem.cooldownReason})`);
  }

  return lines.join("\n");
}
