#!/usr/bin/env node

import * as p from "@clack/prompts";
import pc from "picocolors";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, rmSync } from "node:fs";
import { homedir, platform } from "node:os";

async function uninstall() {
  console.log("");
  p.intro("Aethera Uninstall");

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const installRoot = resolve(__dirname, "../../..");
  const dataDir = resolve(installRoot, "agent/data");
  const isWin = platform() === "win32";
  const wrapperPaths = isWin
    ? [resolve(homedir(), ".local/bin/aethera.cmd"), resolve(homedir(), ".local/bin/aethera")]
    : [resolve(homedir(), ".local/bin/aethera"), resolve(homedir(), ".local/bin/aethera.cmd")];

  console.log(`  Install dir : ${installRoot}`);
  console.log(`  Data dir    : ${dataDir}`);
  console.log("");

  const confirm = await p.confirm({
    message: "Remove Aethera completely? (data + config will be lost)",
    initialValue: false,
  });

  if (p.isCancel(confirm) || !confirm) {
    p.outro("Uninstall cancelled.");
    return;
  }

  const s = p.spinner();
  s.start("Removing...");

  try {
    for (const wp of wrapperPaths) {
      if (existsSync(wp)) rmSync(wp);
    }
    if (existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });
    if (existsSync(installRoot)) rmSync(installRoot, { recursive: true, force: true });
    s.stop("Removed successfully");
    p.outro(pc.green("Aethera has been uninstalled."));
    if (isWin) {
      console.log(pc.cyan("  Re-login or refresh PATH environment variable."));
    } else {
      console.log(pc.cyan("  Re-login or run: source ~/.zshrc (or ~/.bashrc)"));
    }
  } catch (e) {
    s.stop("Removal failed");
    p.outro(pc.red(`Error: ${e instanceof Error ? e.message : String(e)}`));
    process.exit(1);
  }
}

async function main() {
  const command = process.argv[2];

  if (!command || command === "--help" || command === "-h") {
    showHelp();
    return;
  }

  switch (command) {
    case "init":
      const { initWizard } = await import("./init.js");
      await initWizard();
      break;

    case "start":
      const { startServer } = await import("./start.js");
      await startServer();
      break;

    case "stop":
      console.log("Stopping Aethera...");
      process.exit(0);
      break;

    case "status": {
      const { loadConfig } = await import("../config/index.js");
      const cfg = loadConfig();
      console.log(`Aethera v2 — Status`);
      console.log(`  Exchange : Binance Futures (Mainnet)`);
      console.log(`  Model    : ${cfg.openrouter.primary}`);
      console.log(`  Goal     : $${cfg.growth.targetEquity}`);
      break;
    }

    case "signals": {
      console.log("Fetching signals...");
      break;
    }

    case "scan": {
      console.log("Manual scan triggered...");
      break;
    }

    case "doctor": {
      console.log("Running diagnostics...");
      const { loadConfig } = await import("../config/index.js");
      const cfg = loadConfig();
      const binance = new (await import("../exchange/binance.js")).BinanceClient(
        cfg.binance.apiKey,
        cfg.binance.apiSecret,
      );
      const or = new (await import("../llm/client.js")).OpenRouterClient({
        apiKey: cfg.openrouter.apiKey,
      });

      const ping = await binance.ping();
      console.log(`  Binance API : ${ping ? pc.green("✓ OK") : pc.red("✗ FAIL")}`);

      try {
        const bal = await binance.getBalance();
        console.log(`  Balance     : ${pc.green(`$${bal.toFixed(2)}`)}`);
      } catch (e) {
        console.log(`  Balance     : ${pc.red("✗ " + (e instanceof Error ? e.message : String(e)))}`);
      }

      const orStatus = await or.testConnection();
      console.log(`  OpenRouter  : ${orStatus.success ? pc.green(`✓ ${orStatus.modelCount} models`) : pc.red("✗ " + (orStatus.error || ""))}`);
      break;
    }

    case "positions": {
      console.log("Open positions:");
      break;
    }

    case "uninstall":
      await uninstall();
      break;

    case "config": {
      console.log("Config management coming soon.");
      break;
    }

    case "daemon":
      await handleDaemon(process.argv[3]);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

async function handleDaemon(sub: string | undefined) {
  switch (sub) {
    case "start":
      console.log("Daemon starting...");
      break;
    case "stop":
      console.log("Daemon stopping...");
      break;
    case "status":
      console.log("Daemon: running");
      break;
    case "logs":
      console.log("Daemon logs:");
      break;
    default:
      console.log("Usage: aethera daemon <start|stop|status|logs>");
  }
}

function showHelp() {
  console.log(pc.bold(`
  Aethera v2 — Autonomous AI Trading Agent (Binance Futures Perpetual)

  USAGE
    aethera <command> [options]

  COMMANDS
    init              Setup wizard (API keys, config, DB)
    start             Start API server + TUI
    stop              Stop all processes
    status            View system status
    scan              Run manual screening
    signals           View current signals
    positions         View open positions
    doctor            Full system diagnostic
    config            View/edit config
    uninstall         Remove Aethera completely

  DAEMON
    daemon start      Background daemon (no TUI)
    daemon stop       Stop daemon
    daemon status     Check daemon state
    daemon logs       View daemon logs

  EXAMPLE
    aethera init
    aethera start
`));
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
