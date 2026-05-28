import pc from "picocolors";
import { evolveThresholds, getThresholdState } from "../learning/index.js";

export async function runEvolve(): Promise<void> {
  console.log(pc.bold("\nEvolving thresholds...\n"));

  const before = getThresholdState();
  console.log(`  Before:`);
  console.log(`    longMinScore   : ${before.longMinScore}`);
  console.log(`    shortMinScore  : ${before.shortMinScore}`);
  console.log(`    highConfidence : ${before.highConfidence}`);
  console.log(`    evolveCount    : ${before.evolveCount}`);
  console.log(`    recentWinRate  : ${before.recentWinRate}% (${before.recentTrades} trades)`);
  console.log("");

  const result = evolveThresholds();

  console.log(`  After:`);
  console.log(`    longMinScore   : ${result.state.longMinScore}`);
  console.log(`    shortMinScore  : ${result.state.shortMinScore}`);
  console.log(`    highConfidence : ${result.state.highConfidence}`);
  console.log(`    evolveCount    : ${result.state.evolveCount}`);
  console.log(`    recentWinRate  : ${result.state.recentWinRate}% (${result.state.recentTrades} trades)`);
  console.log("");

  if (result.changes.length === 0) {
    console.log(pc.yellow("  No changes — not enough data."));
  } else {
    console.log(pc.green("  Changes:"));
    for (const ch of result.changes) {
      console.log(`    ✓ ${ch}`);
    }
  }

  if (result.weightChanges.length > 0) {
    console.log(pc.green("\n  Weight adjustments:"));
    for (const w of result.weightChanges) {
      console.log(`    ${w.signal}: ${w.from.toFixed(3)} → ${w.to.toFixed(3)}`);
    }
  }
  console.log("");
}
