import * as p from "@clack/prompts";
import pc from "picocolors";
import { loadConfig } from "../config/index.js";
import { BinanceClient } from "../exchange/binance.js";
import { Scanner } from "../screening/scanner.js";
import type { Timeframe, ScoredCoin } from "../screening/types.js";
import { TradeHandler } from "../orchestrator/tool-handlers/trade.js";
import type { ScreeningResult, Context } from "../orchestrator/context.js";

export async function manualDeploy(): Promise<void> {
  const cfg = loadConfig();
  const binance = new BinanceClient(cfg.binance.apiKey, cfg.binance.apiSecret);
  const screeningConfig = cfg.screening ?? {};

  const scanner = new Scanner(binance, {
    maxCoins: screeningConfig.maxCoins ?? 30,
    prefilterMinVolume: screeningConfig.prefilterMinVolume ?? 1_000_000,
    timeframes: (screeningConfig.timeframes ?? ["15m", "1h"]) as Timeframe[],
    adxThreshold: 25,
  });

  const tradeHandler = new TradeHandler();
  tradeHandler.setBinance(binance);

  console.log(pc.bold("\nManual Deploy — Scanning market...\n"));

  let scanResult: Awaited<ReturnType<typeof scanner.scan>>;
  try {
    scanResult = await scanner.scan();
  } catch (e) {
    console.error(pc.red(`Scan failed: ${e instanceof Error ? e.message : String(e)}`));
    return;
  }

  const candidates = scanResult.coins.filter((c) => c.direction !== "WAIT");
  if (candidates.length === 0) {
    console.log(pc.yellow("No deployable candidates found."));
    return;
  }

  console.log(`  ${candidates.length} candidates found\n`);

  const choices = candidates.slice(0, 15).map((c) => ({
    value: c.symbol,
    label: `${c.symbol.padEnd(10)} ${c.direction.padEnd(6)} Score: ${c.score.toFixed(1).padStart(5)} Conf: ${c.confidence.toFixed(0).padStart(2)}%`,
  }));

  const symbol = await p.select({
    message: "Pilih symbol untuk deploy:",
    options: choices,
  });

  if (p.isCancel(symbol)) {
    console.log(pc.yellow("Cancelled."));
    return;
  }

  const coin = candidates.find((c) => c.symbol === symbol)!;

  const confirm = await p.confirm({
    message: `Deploy ${coin.direction} ${coin.symbol}? (SL: ${coin.sl.toFixed(4)}, TP: ${coin.tp.toFixed(4)})`,
    initialValue: false,
  });

  if (p.isCancel(confirm) || !confirm) {
    console.log(pc.yellow("Cancelled."));
    return;
  }

  console.log(pc.bold(`\nExecuting ${coin.direction} ${coin.symbol}...\n`));

  try {
    const balance = await binance.getBalance();
    const equityTier = cfg.growth.equityTiers.find(
      (t) => balance >= t.min && balance <= t.max,
    ) ?? cfg.growth.equityTiers[cfg.growth.equityTiers.length - 1];
    const riskAmount = balance * equityTier.maxRisk;
    const slPct = coin.sl > 0 && coin.tp > 0
      ? Math.abs(coin.sl - coin.tp) / Math.min(coin.sl, coin.tp)
      : 0.02;
    const notional = riskAmount / slPct;
    const positionSize = notional > 0 ? notional / Math.min(coin.sl, coin.tp) : 0;

    const screeningResult: ScreeningResult = {
      symbol: coin.symbol,
      score: coin.score,
      direction: coin.direction,
      confidence: coin.confidence,
      regime: coin.regime,
      reasons: coin.reasons,
      sl: coin.sl,
      tp: coin.tp,
      fundingRate: coin.fundingRate,
      openInterest: coin.openInterest,
      oiChange: coin.oiChange,
      takerBuyRatio: coin.takerBuyRatio,
      topLongShortRatio: coin.topLongShortRatio,
      globalLongShortRatio: coin.globalLongShortRatio,
      depthImbalance: coin.depthImbalance,
      volume24h: coin.volume24h,
    };

    const ctx: Context = {
      market: {
        btcRegime: coin.regime,
        btcPrice: 0,
        btcChange24h: 0,
        fundingAvg: coin.fundingRate ?? 0,
        topGainers: [],
        topLosers: [],
        topOpenInterest: [],
        lsDivergences: [],
      },
      account: {
        balance,
        equity: balance,
        peakEquity: balance,
        openPositions: 0,
        dailyPnl: 0,
        dailyTrades: 0,
      },
      screening: [screeningResult],
      risk: {
        circuitBreakerActive: false,
        circuitBreakerReason: "",
        consecutiveLosses: 0,
        drawdown: 0,
        dailyLossPct: 0,
      },
      lessons: [],
      goal: {
        targetEquity: cfg.growth.targetEquity,
        currentEquity: balance,
        startEquity: balance,
        daysElapsed: 0,
        daysRemaining: cfg.growth.targetDays,
        dailyTargetPct: cfg.growth.dailyTargetPct,
        actualTodayPct: 0,
        progressPct: 0,
        urgency: "on_track",
        riskTier: {
          maxRisk: equityTier.maxRisk,
          maxLeverage: equityTier.maxLeverage,
          maxTrades: equityTier.maxConsecutive,
        },
      },
      timestamp: Date.now(),
    };

    let result;
    if (coin.direction === "LONG") {
      result = await tradeHandler.executeOpenLong(
        `manual_${Date.now()}`,
        { symbol: coin.symbol, confidence: coin.confidence, reason: coin.reasons.join("; ") },
        ctx,
        positionSize,
        coin.sl,
        coin.tp,
        equityTier.maxLeverage,
      );
    } else {
      result = await tradeHandler.executeOpenShort(
        `manual_${Date.now()}`,
        { symbol: coin.symbol, confidence: coin.confidence, reason: coin.reasons.join("; ") },
        ctx,
        positionSize,
        coin.sl,
        coin.tp,
        equityTier.maxLeverage,
      );
    }

    if (result.success) {
      console.log(pc.green(`  ✓ ${result.data?.action || "Deployed"}`));
      if (result.data) {
        for (const [k, v] of Object.entries(result.data as Record<string, unknown>)) {
          if (typeof v === "number") console.log(`    ${k}: ${v.toFixed(4)}`);
          else console.log(`    ${k}: ${v}`);
        }
      }
    } else {
      console.log(pc.red(`  ✗ Failed: ${result.error || "Unknown error"}`));
    }
  } catch (e) {
    console.error(pc.red(`  Error: ${e instanceof Error ? e.message : String(e)}`));
  }
  console.log("");
}
