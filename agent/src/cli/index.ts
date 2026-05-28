#!/usr/bin/env node

import * as p from "@clack/prompts";
import pc from "picocolors";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, rmSync, writeFileSync, readFileSync, unlinkSync, mkdirSync } from "node:fs";
import { execSync, spawn } from "node:child_process";

const PID_FILE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "daemon.pid");
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
    case "model": {
      const { changeModel } = await import("./model.js");
      await changeModel();
      break;
    }

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
    case "start": {
      // Cek apakah udah jalan
      const existing = readPid();
      if (existing && isRunning(existing)) {
        console.log(pc.yellow(`Daemon already running (PID ${existing})`));
        return;
      }
      const { startServer } = await import("./start.js");
      // Fork ke background
      const child = spawn(process.argv[0], [process.argv[1], "start"], {
        detached: true,
        stdio: "ignore",
        env: { ...process.env, NO_TUI: "1" },
      });
      child.unref();
      if (child.pid) {
        writePid(child.pid);
        console.log(pc.green(`Daemon started (PID ${child.pid})`));
      } else {
        console.log(pc.red("Failed to start daemon — no PID"));
      }
      break;
    }
    case "stop": {
      const pid = readPid();
      if (!pid) {
        console.log(pc.yellow("No PID file found — daemon not running?"));
        return;
      }
      try {
        process.kill(pid, "SIGTERM");
        // Tunggu sebentar
        setTimeout(() => {
          try { process.kill(pid, "SIGKILL"); } catch { /* sudah mati */ }
        }, 5000);
        removePid();
        console.log(pc.green(`Daemon (PID ${pid}) stopped`));
      } catch (e) {
        removePid();
        console.log(pc.yellow(`PID ${pid} not found — cleaned up`));
      }
      break;
    }
    case "status": {
      const pid = readPid();
      if (pid && isRunning(pid)) {
        // Cek via API
        try {
          const res = await fetch("http://localhost:8000/api/health");
          if (res.ok) {
            const data = await res.json() as { uptime: number };
            console.log(pc.green(`Daemon: running (PID ${pid}, uptime ${Math.floor(data.uptime / 1000)}s)`));
          } else {
            console.log(pc.yellow(`Daemon: running (PID ${pid}), but API not responding`));
          }
        } catch {
          console.log(pc.yellow(`Daemon: process running (PID ${pid}), but API unreachable`));
        }
      } else if (pid) {
        removePid();
        console.log(pc.red("Daemon: not running (stale PID cleaned up)"));
      } else {
        console.log(pc.red("Daemon: not running"));
      }
      break;
    }
    case "logs": {
      try {
        const logs = execSync(
          `journalctl -u aethera-agent --since "1 hour ago" --no-pager -n 50 2>/dev/null || echo "(logs via systemctl journalctl)"`,
          { encoding: "utf8", timeout: 5000 }
        );
        console.log(logs);
      } catch {
        console.log("No journalctl logs available — try systemctl status aethera-agent");
      }
      break;
    }
    default:
      console.log("Usage: aethera daemon <start|stop|status|logs>");
  }
}

function readPid(): number | null {
  try {
    if (existsSync(PID_FILE)) {
      return Number(readFileSync(PID_FILE, "utf8").trim());
    }
  } catch { /* ignore */ }
  return null;
}

function writePid(pid: number): void {
  try {
    const dir = resolve(PID_FILE, "..");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(PID_FILE, String(pid));
  } catch { /* non-critical */ }
}

function removePid(): void {
  try { unlinkSync(PID_FILE); } catch { /* ignore */ }
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function showHelp() {
  console.log(pc.bold(`
  Aethera v2 — Autonomous AI Trading Agent (Binance Futures Perpetual)

  USAGE
    aethera <command> [options]

  COMMANDS
    init              Setup wizard (API keys, config, DB)
    model             Change LLM model (no re-setup needed)
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
