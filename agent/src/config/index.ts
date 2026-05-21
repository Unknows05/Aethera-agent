import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { config } from "dotenv";
import { ConfigSchema, type Config, getDefaultConfig } from "./schema.js";
import { encrypt, decrypt, generateEncryptionKey } from "./crypto.js";
export type { Config } from "./schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

export let appConfig: Config;
let encKey: string;

function getConfigPath(): string {
  return process.env.AETHERA_CONFIG || join(ROOT, "config.yaml");
}

function getDataDir(): string {
  return join(ROOT, "data");
}

function getEncKeyPath(): string {
  return join(getDataDir(), ".key");
}

function loadOrCreateEncKey(): string {
  const keyPath = getEncKeyPath();
  if (existsSync(keyPath)) {
    return readFileSync(keyPath, "utf8").trim();
  }
  const key = generateEncryptionKey();
  mkdirSync(getDataDir(), { recursive: true });
  writeFileSync(keyPath, key, "utf8");
  return key;
}

export function encryptSecret(plaintext: string): string {
  return encrypt(plaintext, encKey);
}

export function decryptSecret(ciphertext: string): string {
  return decrypt(ciphertext, encKey);
}

export function loadConfig(): Config {
  config();

  encKey = loadOrCreateEncKey();
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    appConfig = getDefaultConfig();
    return appConfig;
  }

  const raw = load(readFileSync(configPath, "utf8")) as Record<string, unknown>;

  const parsed: Record<string, unknown> = { ...raw };

  if (raw.binance && typeof raw.binance === "object") {
    const b = raw.binance as Record<string, string>;
    parsed.binance = { ...b };
    if (b.apiKey && b.apiKey.startsWith("encrypted:")) {
      (parsed.binance as Record<string, string>).apiKey = decryptSecret(b.apiKey.slice(10));
    }
    if (b.apiSecret && b.apiSecret.startsWith("encrypted:")) {
      (parsed.binance as Record<string, string>).apiSecret = decryptSecret(b.apiSecret.slice(10));
    }
  }

  if (raw.openrouter && typeof raw.openrouter === "object") {
    const o = raw.openrouter as Record<string, string>;
    parsed.openrouter = { ...o };
    if (o.apiKey && o.apiKey.startsWith("encrypted:")) {
      (parsed.openrouter as Record<string, string>).apiKey = decryptSecret(o.apiKey.slice(10));
    }
  }

  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    console.error("Config validation errors:");
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  appConfig = result.data;
  return appConfig;
}

export function saveConfig(cfg: Config): void {
  const configPath = getConfigPath();

  const serializable = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;

  if (serializable.binance && typeof serializable.binance === "object") {
    const b = serializable.binance as Record<string, string>;
    b.apiKey = `encrypted:${encryptSecret(b.apiKey)}`;
    b.apiSecret = `encrypted:${encryptSecret(b.apiSecret)}`;
  }

  if (serializable.openrouter && typeof serializable.openrouter === "object") {
    const o = serializable.openrouter as Record<string, string>;
    o.apiKey = `encrypted:${encryptSecret(o.apiKey)}`;
  }

  const yaml = [
    `# Aethera v2 Configuration — auto-generated`,
    `# DO NOT share this file. Secrets are encrypted.`,
    `version: "2.0"`,
    "",
    "binance:",
    `  apiKey: "${(serializable.binance as Record<string, string>).apiKey}"`,
    `  apiSecret: "${(serializable.binance as Record<string, string>).apiSecret}"`,
    "",
    "openrouter:",
    `  apiKey: "${(serializable.openrouter as Record<string, string>).apiKey}"`,
    `  primary: "${cfg.openrouter.primary}"`,
    `  fallback: [${cfg.openrouter.fallback.map((m: string) => `"${m}"`).join(", ")}]`,
    `  temperature: ${cfg.openrouter.temperature}`,
    `  maxTokens: ${cfg.openrouter.maxTokens}`,
    "",
    "growth:",
    `  targetEquity: ${cfg.growth.targetEquity}`,
    `  targetDays: ${cfg.growth.targetDays}`,
    `  dailyTargetPct: ${cfg.growth.dailyTargetPct}`,
    `  riskProfile: "${cfg.growth.riskProfile}"`,
    `  llmCanRefuse: ${cfg.growth.llmCanRefuse}`,
    `  equityTiers:`,
    ...cfg.growth.equityTiers.map((t) =>
      `    - {min: ${t.min}, max: ${t.max}, maxRisk: ${t.maxRisk}, dailyTarget: ${t.dailyTarget}, maxLeverage: ${t.maxLeverage}, maxTrades: ${t.maxTrades}, maxConsecutive: ${t.maxConsecutive}}`
    ),
    "",
    "screening:",
    `  maxCoins: ${cfg.screening?.maxCoins ?? 500}`,
    `  prefilterMinVolume: ${cfg.screening?.prefilterMinVolume ?? 1_000_000}`,
    `  timeframes: [${(cfg.screening?.timeframes ?? ["15m", "1h", "4h"]).join(", ")}]`,
    `  longMinScore: ${cfg.screening?.longMinScore ?? 55}`,
    `  shortMinScore: ${cfg.screening?.shortMinScore ?? 55}`,
    `  agentHunterInterval: ${cfg.screening?.agentHunterInterval ?? 1800}`,
    `  agentHealerInterval: ${cfg.screening?.agentHealerInterval ?? 300}`,
  ].join("\n");

  writeFileSync(configPath, yaml, "utf8");
  appConfig = cfg;
}
