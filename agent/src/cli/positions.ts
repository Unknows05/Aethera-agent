import pc from "picocolors";
import { loadConfig } from "../config/index.js";
import { BinanceClient } from "../exchange/binance.js";

export async function showPositions(): Promise<void> {
  const cfg = loadConfig();
  const binance = new BinanceClient(cfg.binance.apiKey, cfg.binance.apiSecret);

  console.log(pc.bold("\nOpen Positions:\n"));

  try {
    const positions = await binance.getPositionRisk();
    const open = positions.filter((p) => parseFloat(p.positionAmt) !== 0);

    if (open.length === 0) {
      console.log("  No open positions.");
      return;
    }

    for (const pos of open) {
      const amt = parseFloat(pos.positionAmt);
      const entry = parseFloat(pos.entryPrice);
      const mark = parseFloat(pos.markPrice);
      const upnl = parseFloat(pos.unrealizedProfit);
      const liq = parseFloat(pos.liquidationPrice);
      const side = amt > 0 ? "LONG" : "SHORT";
      const pnlColor = upnl >= 0 ? pc.green : pc.red;

      console.log(`  ${pc.cyan(pos.symbol)} ${side === "LONG" ? pc.green(side) : pc.red(side)}`);
      console.log(`    Size : ${Math.abs(amt).toFixed(4)}`);
      console.log(`    Entry: ${entry.toFixed(4)} → Mark: ${mark.toFixed(4)}`);
      console.log(`    PnL  : ${pnlColor(`$${upnl.toFixed(2)}`)}`);
      console.log(`    Liq  : ${pc.yellow(liq.toFixed(4))}`);
      console.log(`    Lev  : ${pos.leverage}x`);
      console.log("");
    }
  } catch (e) {
    console.error(pc.red(`  Error: ${e instanceof Error ? e.message : String(e)}`));
  }
}
