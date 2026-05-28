import pc from "picocolors";
import { loadConfig } from "../config/index.js";
import { BinanceClient } from "../exchange/binance.js";
import { Scanner } from "../screening/scanner.js";
import type { Timeframe } from "../screening/types.js";

export async function showCandidates(): Promise<void> {
  const cfg = loadConfig();
  const binance = new BinanceClient(cfg.binance.apiKey, cfg.binance.apiSecret);
  const screeningConfig = cfg.screening ?? {};

  const scanner = new Scanner(binance, {
    maxCoins: screeningConfig.maxCoins ?? 30,
    prefilterMinVolume: screeningConfig.prefilterMinVolume ?? 1_000_000,
    timeframes: (screeningConfig.timeframes ?? ["15m", "1h"]) as Timeframe[],
    adxThreshold: 25,
  });

  console.log(pc.bold("\nScanning market...\n"));

  try {
    const result = await scanner.scan();
    const coins = result.coins.slice(0, 10);

    console.log(`  Scanned: ${result.totalScanned} | Scored: ${result.fullscored} | Duration: ${result.durationMs}ms\n`);

    if (coins.length === 0) {
      console.log("  No candidates found.");
      return;
    }

    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      const dirColor = c.direction === "LONG" ? pc.green : c.direction === "SHORT" ? pc.red : pc.yellow;
      console.log(
        `  ${(i + 1).toString().padStart(2)}. ${pc.cyan(c.symbol.padEnd(10))} ` +
        `${dirColor(c.direction.padEnd(6))} ` +
        `Score: ${c.score.toFixed(1).padStart(5)} ` +
        `Conf: ${(c.confidence).toFixed(0).padStart(2)}% ` +
        `Regime: ${c.regime.padEnd(10)}`
      );
    }
    console.log("");
  } catch (e) {
    console.error(pc.red(`  Error: ${e instanceof Error ? e.message : String(e)}`));
  }
}
