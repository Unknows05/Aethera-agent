import * as p from "@clack/prompts";
import pc from "picocolors";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import Database from "better-sqlite3";
import { BinanceClient, getPublicIP } from "../exchange/binance.js";
import { OpenRouterClient } from "../llm/client.js";
import { saveConfig } from "../config/index.js";
import { getDefaultConfig, type Config, type EquityTier } from "../config/schema.js";

function calculateDailyTarget(
  currentBalance: number,
  targetEquity: number,
  targetDays: number,
): number {
  const requiredReturn = targetEquity / currentBalance;
  const daily = requiredReturn ** (1 / targetDays) - 1;
  return Math.round(daily * 1000) / 10;
}

function generateTiers(
  balance: number,
  target: number,
  riskProfile: string,
): EquityTier[] {
  const riskMap: Record<string, number> = {
    aggressive: 0.75,
    moderate: 0.5,
    conservative: 0.25,
  };
  const kellyFactor = riskMap[riskProfile] ?? 0.5;

  const tiers: EquityTier[] = [];

  if (balance < 100) {
    tiers.push({
      min: 0, max: 100, maxRisk: 0.25 * kellyFactor * 2,
      dailyTarget: 0.12, maxLeverage: 3, maxTrades: 5, maxConsecutive: 2,
    });
  }

  const tierBoundaries = [
    { min: Math.max(tiers.length ? 100 : 0, balance), max: Math.min(300, target), risk: 0.18, daily: 0.06, lev: 5, trades: 4, cons: 3 },
    { min: 300, max: Math.min(600, target), risk: 0.15, daily: 0.04, lev: 5, trades: 3, cons: 4 },
    { min: 600, max: target, risk: 0.10, daily: 0.025, lev: 3, trades: 2, cons: 5 },
  ];

  for (const t of tierBoundaries) {
    if (t.min < t.max) {
      tiers.push({
        min: t.min, max: t.max,
        maxRisk: t.risk * kellyFactor,
        dailyTarget: t.daily, maxLeverage: t.lev,
        maxTrades: t.trades, maxConsecutive: t.cons,
      });
    }
  }

  if (tiers.length === 0) {
    tiers.push({
      min: 0, max: target,
      maxRisk: 0.15 * kellyFactor,
      dailyTarget: 0.05, maxLeverage: 3, maxTrades: 3, maxConsecutive: 4,
    });
  }

  return tiers;
}

export async function initWizard(): Promise<void> {
  console.clear();

  p.intro(pc.bgCyan(pc.black("  Aethera v2 — Setup Wizard  ")));

  // ── Runtime check ──
  const isBun = typeof globalThis !== "undefined" && "Bun" in globalThis;
  const runtimeInfo = `✓ ${isBun ? "Bun" : "Node.js"} ${process.version}`;
  p.log.step(runtimeInfo);

  // ── Step 1: Binance Futures ──
  p.log.step(pc.bold("Step 1/4: Binance Futures"));

  const publicIP = await getPublicIP();
  p.log.info(`  Your public IP: ${pc.cyan(publicIP)}`);
  p.log.warn(`  Whitelist IP ini di dashboard Binance: ${pc.dim("https://www.binance.com/en/usercenter/settings/api-management")}`);

  let binanceConnected = false;
  let binanceClient: BinanceClient | null = null;
  let balance = 0;
  let binanceApiKey = "";
  let binanceSecret = "";

  while (!binanceConnected) {
    const apiKeyInput = await p.password({
      message: "Binance API Key",
      validate: (val) => {
        if (!val || val.length < 10) return "API Key wajib diisi (min 10 karakter)";
      },
    });

    if (p.isCancel(apiKeyInput)) {
      p.cancel("Setup dibatalkan.");
      process.exit(0);
    }

    const secretInput = await p.password({
      message: "Binance Secret Key",
      validate: (val) => {
        if (!val || val.length < 10) return "Secret Key wajib diisi (min 10 karakter)";
      },
    });

    if (p.isCancel(secretInput)) {
      p.cancel("Setup dibatalkan.");
      process.exit(0);
    }

    const s = p.spinner();
    s.start("Connecting to Binance Futures...");

    try {
      const client = new BinanceClient(apiKeyInput as string, secretInput as string);
      const result = await client.testConnection();

      if (result.success) {
        binanceClient = client;
        balance = result.balance;
        binanceApiKey = apiKeyInput as string;
        binanceSecret = secretInput as string;
        binanceConnected = true;
        s.stop(pc.green(`✓ Connected! Balance: $${balance.toFixed(2)} USDT`));
      } else {
        s.stop(pc.red(`✗ Connection failed: ${result.error || "Unknown error"}`));
        p.log.warn("Coba lagi, pastikan API Key valid dan IP sudah diwhitelist.");
      }
    } catch (e) {
      s.stop(pc.red(`✗ Error: ${e instanceof Error ? e.message : String(e)}`));
    }
  }

  // ── Step 2: OpenRouter ──
  p.log.step(pc.bold("Step 2/4: OpenRouter"));

  let orConnected = false;
  let orClient: OpenRouterClient | null = null;
  let openRouterKey = "";
  let availableModels: Array<{ id: string; name: string }> = [];

  while (!orConnected) {
    const orInput = await p.password({
      message: "OpenRouter API Key",
      validate: (val) => {
        if (!val || val.length < 10) return "API Key wajib diisi";
      },
    });

    if (p.isCancel(orInput)) {
      p.cancel("Setup dibatalkan.");
      process.exit(0);
    }

    const s = p.spinner();
    s.start("Fetching available models...");

    try {
      const client = new OpenRouterClient({ apiKey: orInput as string });
      const result = await client.testConnection();

      if (result.success) {
        orClient = client;
        openRouterKey = orInput as string;
        availableModels = (await client.fetchModels())
          .map((m) => ({ id: m.id, name: `${m.id} ($${(Number(m.pricing.prompt) * 1e6).toFixed(2)}/M tokens)` }))
          .sort((a, b) => {
            const aFree = a.id.includes("free") ? 1 : 0;
            const bFree = b.id.includes("free") ? 1 : 0;
            return bFree - aFree;
          });

        orConnected = true;
        s.stop(pc.green(`✓ Connected! ${availableModels.length} models available`));
      } else {
        s.stop(pc.red(`✗ Connection failed: ${result.error || "Invalid API Key"}`));
      }
    } catch (e) {
      s.stop(pc.red(`✗ Error: ${e instanceof Error ? e.message : String(e)}`));
    }
  }

  const modelChoices = [
    { value: "deepseek/deepseek-chat", label: "deepseek/deepseek-chat — ★ Best balance", hint: "$0.14/M" },
    { value: "google/gemini-2.0-flash", label: "google/gemini-2.0-flash — Fast & free", hint: "FREE" },
    { value: "meta-llama/llama-3.1-8b-instruct", label: "meta-llama/llama-3.1-8b — Free", hint: "FREE" },
    { value: "anthropic/claude-sonnet", label: "anthropic/claude-sonnet — Strong reasoning", hint: "$3.00/M" },
    { value: "__custom__", label: "Type custom model ID...", hint: "" },
  ];

  const primaryModel = await p.select({
    message: "Select Primary Model (Hunter/Orchestrator):",
    options: modelChoices,
  });

  if (p.isCancel(primaryModel)) {
    p.cancel("Setup dibatalkan.");
    process.exit(0);
  }

  let selectedPrimary = primaryModel as string;
  if (selectedPrimary === "__custom__") {
    const custom = await p.text({
      message: "Enter model ID:",
      validate: (val) => (!val ? "Model ID wajib diisi" : undefined),
    });
    if (p.isCancel(custom)) process.exit(0);
    selectedPrimary = custom as string;
  }

  const s1 = p.spinner();
  s1.start(`Testing ${selectedPrimary}...`);
  const primaryTest = orClient ? await orClient.testModel(selectedPrimary) : { ok: false as const, latencyMs: 0, error: "No OpenRouter connection" };
  if (primaryTest.ok) {
    s1.stop(pc.green(`✓ ${selectedPrimary} responded in ${primaryTest.latencyMs}ms`));
  } else {
    s1.stop(pc.yellow(`⚠ ${selectedPrimary} test: ${primaryTest.error || "no response"}`));
    const proceed = await p.confirm({ message: "Model test failed. Continue anyway?", initialValue: false });
    if (p.isCancel(proceed) || !proceed) process.exit(0);
  }

  const healerModel = await p.select({
    message: "Select Model for Healer (fast, cheap):",
    options: [
      { value: "google/gemini-2.0-flash", label: "google/gemini-2.0-flash — FREE", hint: "Recommended" },
      { value: "meta-llama/llama-3.1-8b-instruct", label: "meta-llama/llama-3.1-8b — FREE", hint: "" },
      { value: "__same__", label: "Same as primary", hint: "" },
    ],
  });

  if (p.isCancel(healerModel)) process.exit(0);

  const selectedHealer = healerModel as string;
  if (selectedHealer !== "__same__") {
    const s2 = p.spinner();
    s2.start(`Testing ${selectedHealer}...`);
    const healerTest = orClient ? await orClient.testModel(selectedHealer) : { ok: false as const, latencyMs: 0, error: "No OpenRouter connection" };
    if (healerTest.ok) {
      s2.stop(pc.green(`✓ ${selectedHealer} responded in ${healerTest.latencyMs}ms`));
    } else {
      s2.stop(pc.yellow(`⚠ ${selectedHealer} test: ${healerTest.error || "no response"}`));
      const proceed = await p.confirm({ message: "Healer model test failed. Continue anyway?", initialValue: false });
      if (p.isCancel(proceed) || !proceed) process.exit(0);
    }
  }

  const curatorModel = await p.select({
    message: "Select Model for Curator/Learning (strong reasoning):",
    options: [
      { value: "anthropic/claude-sonnet", label: "anthropic/claude-sonnet — Best reasoning", hint: "$3.00/M" },
      { value: "deepseek/deepseek-chat", label: "deepseek/deepseek-chat — Good balance", hint: "$0.14/M" },
      { value: "__same__", label: "Same as primary", hint: "" },
    ],
  });

  if (p.isCancel(curatorModel)) process.exit(0);

  const selectedCurator = curatorModel as string;
  if (selectedCurator !== "__same__") {
    const s3 = p.spinner();
    s3.start(`Testing ${selectedCurator}...`);
    const curatorTest = orClient ? await orClient.testModel(selectedCurator) : { ok: false as const, latencyMs: 0, error: "No OpenRouter connection" };
    if (curatorTest.ok) {
      s3.stop(pc.green(`✓ ${selectedCurator} responded in ${curatorTest.latencyMs}ms`));
    } else {
      s3.stop(pc.yellow(`⚠ ${selectedCurator} test: ${curatorTest.error || "no response"}`));
      const proceed = await p.confirm({ message: "Curator model test failed. Continue anyway?", initialValue: false });
      if (p.isCancel(proceed) || !proceed) process.exit(0);
    }
  }

  // ── Step 3: Growth Strategy ──
  p.log.step(pc.bold("Step 3/4: Growth Strategy"));

  p.log.info(`  Current balance: ${pc.green(`$${balance.toFixed(2)}`)} USDT`);

  const targetEquity = await p.text({
    message: "Target Equity ($):",
    initialValue: "1000",
    validate: (val) => {
      const n = Number(val);
      if (Number.isNaN(n) || n <= balance) return `Target harus > $${balance.toFixed(2)}`;
      return undefined;
    },
  });

  if (p.isCancel(targetEquity)) process.exit(0);

  const targetDays = await p.text({
    message: "Target Days:",
    initialValue: "21",
    validate: (val) => {
      const n = Number(val);
      if (Number.isNaN(n) || n < 1 || n > 365) return "Harus antara 1-365 hari";
      return undefined;
    },
  });

  if (p.isCancel(targetDays)) process.exit(0);

  const targetEquityNum = Number(targetEquity);
  const targetDaysNum = Number(targetDays);
  const autoDaily = calculateDailyTarget(balance, targetEquityNum, targetDaysNum);

  const dailyChoice = await p.select({
    message: pc.bold(`Daily % Goal: ${pc.green(`${autoDaily}%`)} (auto-calculated)`),
    options: [
      { value: "auto", label: `Auto: ${autoDaily}% per day`, hint: `$${balance} → $${targetEquity} in ${targetDays} days` },
      { value: "custom", label: "Set custom daily %", hint: "" },
    ],
  });

  if (p.isCancel(dailyChoice)) process.exit(0);

  let dailyTargetPct = autoDaily;
  if (dailyChoice === "custom") {
    const customDaily = await p.text({
      message: "Custom daily % target:",
      validate: (val) => {
        const n = Number(val);
        if (Number.isNaN(n) || n <= 0 || n > 100) return "Harus antara 0.1-100%";
        return undefined;
      },
    });
    if (p.isCancel(customDaily)) process.exit(0);
    dailyTargetPct = Number(customDaily);
  }

  const riskProfile = await p.select({
    message: "Risk Profile:",
    options: [
      { value: "aggressive", label: "Aggressive", hint: `Kelly 0.75, max ${balance < 100 ? "5" : "4"} trades/day (untuk <$100 catch-up)` },
      { value: "moderate", label: "Moderate", hint: "Kelly 0.50, balanced risk" },
      { value: "conservative", label: "Conservative", hint: "Kelly 0.25, safety first" },
    ],
  });

  if (p.isCancel(riskProfile)) process.exit(0);

  // ── Build config ──
  const tiers = generateTiers(balance, targetEquityNum, riskProfile as string);
  const llmCanRefuse = true;

  // ── Step 4: Hivemind ──
  p.log.step(pc.bold("Step 4/5: Hivemind Network"));

  const enableHivemind = await p.confirm({
    message: "Enable Hivemind? (share & learn from other agents)",
    initialValue: false,
  });

  let hivemindEnabled = false;
  let hivemindHub = "ws://localhost:8900/api/hivemind/ws";
  let hivemindApiKey = "";
  let hivemindUsername = "";

  if (p.isCancel(enableHivemind)) process.exit(0);

  if (enableHivemind) {
    hivemindEnabled = true;
    hivemindApiKey = `ak_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
    hivemindUsername = `agent_${Math.random().toString(36).slice(2, 8)}`;

    const hubInput = await p.text({
      message: "Hub URL:",
      initialValue: hivemindHub,
      validate: (val) => (!val ? "URL wajib diisi" : undefined),
    });
    if (p.isCancel(hubInput)) process.exit(0);
    hivemindHub = (hubInput as string).trim();

    p.log.info(`  API Key  : ${pc.dim(hivemindApiKey)}`);
    p.log.info(`  Username : ${pc.cyan(hivemindUsername)}`);

    // Test register to hub
    const s4 = p.spinner();
    s4.start("Registering agent to hivemind hub...");
    try {
      const httpUrl = hivemindHub.replace(/^ws/, "http").replace(/\/ws.*$/, "");
      const res = await fetch(`${httpUrl}/api/hivemind/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: hivemindUsername, apiKey: hivemindApiKey }),
      });
      const data = await res.json() as { ok: boolean };
      if (data.ok) {
        s4.stop(pc.green("✓ Registered to hivemind hub"));
      } else {
        s4.stop(pc.yellow("⚠ Could not register — will retry on connect"));
      }
    } catch {
      s4.stop(pc.yellow("⚠ Hub unreachable — will retry on connect"));
    }
  }

  // ── Summary ──
  p.log.step(pc.bold("Step 5/5: Summary & Save"));

  const tierLines = tiers.map((t) =>
    `  $${t.min} → $${t.max}   risk ${(t.maxRisk * 100).toFixed(0)}%  daily ${(t.dailyTarget * 100).toFixed(1)}%  max ${t.maxLeverage}x  max ${t.maxTrades}/day`
  ).join("\n");

  const summary = `
${pc.bold("Exchange")}   │ Binance Futures (Mainnet)
${pc.bold("Balance")}    │ ${pc.green(`$${balance.toFixed(2)}`)} USDT
${pc.bold("Goal")}       │ $${balance.toFixed(0)} → ${pc.green(`$${targetEquityNum}`)}
${pc.bold("Timeline")}   │ ${targetDaysNum} days
${pc.bold("Daily %")}    │ ${dailyTargetPct}%
${pc.bold("Risk")}       │ ${riskProfile} (Kelly ${riskProfile === "aggressive" ? "0.75" : riskProfile === "moderate" ? "0.50" : "0.25"})
${pc.bold("LLM Refuse")} │ ${llmCanRefuse ? "Enabled" : "Disabled"}

${pc.bold("Growth Tiers:")}
${tierLines}

${pc.bold("Models:")}
  ${pc.cyan("Hunter")}      : ${selectedPrimary}
  ${pc.cyan("Healer")}      : ${healerModel === "__same__" ? selectedPrimary : healerModel}
  ${pc.cyan("Curator")}     : ${curatorModel === "__same__" ? selectedPrimary : curatorModel}

${pc.bold("Hivemind:")}
  ${hivemindEnabled ? `${pc.green("Enabled")} — ${hivemindHub}` : pc.dim("Disabled")}
  `;

  p.log.info(summary);

  const confirmed = await p.confirm({
    message: "Save configuration?",
    initialValue: true,
  });

  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel("Setup dibatalkan.");
    process.exit(0);
  }

  const cfg: Config = {
    ...getDefaultConfig(),
    binance: {
      apiKey: binanceApiKey,
      apiSecret: binanceSecret,
    },
    openrouter: {
      apiKey: openRouterKey,
      primary: selectedPrimary,
      fallback: ["google/gemini-2.0-flash"],
      temperature: 0.3,
      maxTokens: 512,
    },
    growth: {
      targetEquity: targetEquityNum,
      targetDays: targetDaysNum,
      dailyTargetPct,
      riskProfile: riskProfile as "aggressive" | "moderate" | "conservative",
      llmCanRefuse,
      equityTiers: tiers,
    },
    hivemind: {
      enabled: hivemindEnabled,
      hub: hivemindHub,
      apiKey: hivemindApiKey,
      username: hivemindUsername,
    },
  };

  const s = p.spinner();
  s.start("Saving configuration...");
  saveConfig(cfg);
  s.stop(pc.green("✓ Config saved to config.yaml"));

  s.start("Initializing databases...");
  const dataDir = join(fileURLToPath(import.meta.url), "..", "..", "..", "data");
  mkdirSync(dataDir, { recursive: true });

  const db = new Database(join(dataDir, "screener.db"));
  db.exec(`
    CREATE TABLE IF NOT EXISTS signals (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      direction TEXT NOT NULL,
      score REAL NOT NULL,
      confidence REAL NOT NULL,
      entry_price REAL,
      sl REAL,
      tp REAL,
      regime TEXT,
      leverage INTEGER,
      result TEXT,
      exit_price REAL,
      exit_reason TEXT,
      pnl_pct REAL,
      pnl_usd REAL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_signals_timestamp ON signals(timestamp);
    CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals(symbol);
    CREATE INDEX IF NOT EXISTS idx_signals_result ON signals(result);

    CREATE TABLE IF NOT EXISTS daily_stats (
      date TEXT PRIMARY KEY,
      total_trades INTEGER DEFAULT 0,
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      total_pnl REAL DEFAULT 0,
      win_rate REAL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  db.close();

  const memDb = new Database(join(dataDir, "memory.db"));
  memDb.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
      content, category, symbol, timestamp UNINDEXED
    );
  `);
  memDb.close();

  writeFileSync(join(dataDir, "lessons.json"), JSON.stringify({ lessons: [], performance: [] }, null, 2));
  writeFileSync(join(dataDir, "pool-memory.json"), "{}");
  writeFileSync(join(dataDir, "signal-weights.json"), JSON.stringify({ weights: {}, last_recalc: null, recalc_count: 0, history: [] }, null, 2));
  writeFileSync(join(dataDir, "skill-usage.json"), "{}");

  s.stop(pc.green("✓ Databases initialized"));

  p.log.success(pc.bold("Setup complete!"));
  p.log.info(`  Config  : config.yaml`);
  p.log.info(`  Data    : data/`);
  p.log.info(`  Start   : ${pc.cyan("aethera start")}`);

  const startNow = await p.confirm({
    message: "Start trading now?",
    initialValue: true,
  });

  if (p.isCancel(startNow)) process.exit(0);

  if (startNow) {
    p.log.step("Starting Aethera...");
    try {
      const { startServer } = await import("./start.js");
      await startServer();
    } catch (e) {
      p.log.error(pc.red(`Failed to start: ${e instanceof Error ? e.message : String(e)}`));
    }
  }

  p.outro("Done!");
}
