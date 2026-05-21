import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DATA_DIR = join(fileURLToPath(import.meta.url), "..", "..", "..", "data");
const SKILL_FILE = join(DATA_DIR, "skill-usage.json");

interface SkillRecord {
  name: string;
  useCount: number;
  lastUsedAt: string | null;
  state: "active" | "stale" | "archived";
  pinned: boolean;
  createdBy: "agent" | "user";
  createdAt: string;
}

interface SkillDb {
  [name: string]: SkillRecord;
}

function loadSkills(): SkillDb {
  try {
    if (existsSync(SKILL_FILE)) {
      return JSON.parse(readFileSync(SKILL_FILE, "utf8"));
    }
  } catch { /* ignore */ }
  return {};
}

function saveSkills(db: SkillDb): void {
  writeFileSync(SKILL_FILE, JSON.stringify(db, null, 2));
}

export function recordSkillUse(name: string, createdBy: "agent" | "user" = "agent"): void {
  const db = loadSkills();

  if (!db[name]) {
    db[name] = {
      name,
      useCount: 0,
      lastUsedAt: null,
      state: "active",
      pinned: false,
      createdBy,
      createdAt: new Date().toISOString(),
    };
  }

  db[name].useCount++;
  db[name].lastUsedAt = new Date().toISOString();
  saveSkills(db);
}

export function curatorCycle(): {
  archived: string[];
  stale: string[];
  reactivated: string[];
} {
  const db = loadSkills();
  const now = Date.now();
  const STALE_DAYS = 30;
  const ARCHIVE_DAYS = 90;
  const staleAfter = STALE_DAYS * 24 * 60 * 60 * 1000;
  const archiveAfter = ARCHIVE_DAYS * 24 * 60 * 60 * 1000;

  const archived: string[] = [];
  const stale: string[] = [];
  const reactivated: string[] = [];

  for (const [name, skill] of Object.entries(db)) {
    if (skill.pinned || skill.state === "archived") continue;

    const lastUsed = skill.lastUsedAt ? new Date(skill.lastUsedAt).getTime() : 0;
    const age = now - lastUsed;

    if (skill.state === "stale" && lastUsed > 0 && age < staleAfter) {
      skill.state = "active";
      reactivated.push(name);
    }

    if (age > archiveAfter) {
      skill.state = "archived";
      archived.push(name);
    } else if (age > staleAfter) {
      skill.state = "stale";
      stale.push(name);
    }
  }

  saveSkills(db);

  return { archived, stale, reactivated };
}

export function getSkillSummary(): string {
  const db = loadSkills();
  const active = Object.values(db).filter((s) => s.state === "active").length;
  const stale = Object.values(db).filter((s) => s.state === "stale").length;
  const archived = Object.values(db).filter((s) => s.state === "archived").length;

  return `Skills: ${active} active, ${stale} stale, ${archived} archived`;
}

export { loadSkills as getSkills, saveSkills as saveSkillsList };
