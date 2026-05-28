import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

interface StoredPosition {
  symbol: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  slPrice: number;
  tpPrice: number;
  openTime: number;
  size: number;
  leverage: number;
}

function getStatePath(): string {
  return join(ROOT, "data", "positions.json");
}

export function saveStates(states: Map<string, StoredPosition>): void {
  const dir = dirname(getStatePath());
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const obj: Record<string, StoredPosition> = {};
  for (const [key, val] of states) {
    obj[key] = val;
  }
  writeFileSync(getStatePath(), JSON.stringify(obj, null, 2), "utf8");
}

export function loadStates(): Map<string, StoredPosition> {
  const path = getStatePath();
  if (!existsSync(path)) return new Map();
  try {
    const raw = readFileSync(path, "utf8");
    const obj = JSON.parse(raw) as Record<string, StoredPosition>;
    const map = new Map<string, StoredPosition>();
    for (const [key, val] of Object.entries(obj)) {
      map.set(key, val);
    }
    return map;
  } catch {
    return new Map();
  }
}
