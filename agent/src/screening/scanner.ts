import { BinanceClient } from "../exchange/binance.js";
import type { Candle, ScoredCoin, Timeframe } from "./types.js";
import { scoreSymbol } from "./scorer.js";
import { getMicrostructure } from "./microstructure.js";
import { applySessionFilter } from "./session-filter.js";

export interface ScanResult {
  coins: ScoredCoin[];
  totalScanned: number;
  prefiltered: number;
  quickscored: number;
  fullscored: number;
  durationMs: number;
}

function isLeveragedToken(symbol: string): boolean {
  const up = symbol.includes("UP");
  const down = symbol.includes("DOWN");
  const bull = symbol.includes("BULL");
  const bear = symbol.includes("BEAR");
  return (up || down) && !symbol.includes("BULL") && !symbol.includes("BEAR");
}

export class Scanner {
  private client: BinanceClient;
  private timeframes: Timeframe[];
  private maxCoins: number;
  private prefilterMinVolume: number;
  private adxThreshold: number;

  constructor(client: BinanceClient, config?: {
    timeframes?: Timeframe[];
    maxCoins?: number;
    prefilterMinVolume?: number;
    adxThreshold?: number;
  }) {
    this.client = client;
    this.timeframes = config?.timeframes ?? ["15m", "1h", "4h"];
    this.maxCoins = config?.maxCoins ?? 500;
    this.prefilterMinVolume = config?.prefilterMinVolume ?? 1_000_000;
    this.adxThreshold = config?.adxThreshold ?? 25;
  }

  async scan(): Promise<ScanResult> {
    const startTime = Date.now();

    // Layer 1: Discover all coins
    const allSymbols = await this.discoverCoins();
    const totalScanned = allSymbols.length;

    // Layer 2: Prefilter by volume
    const prefilterStart = Date.now();
    const tickers = await this.client.getTickers();
    const tickerMap = new Map(tickers.map((t) => [t.symbol, t]));

    const withVolume = allSymbols
      .map((s) => ({ symbol: s, ticker: tickerMap.get(s) }))
      .filter((t): t is { symbol: string; ticker: NonNullable<typeof t.ticker> } =>
        t.ticker !== undefined && Number(t.ticker.quoteVolume) >= this.prefilterMinVolume)
      .sort((a, b) => Number(b.ticker.quoteVolume) - Number(a.ticker.quoteVolume));

    const prefiltered = withVolume.length;

    // Layer 3: Quick score (just 15m RSI + Volume) → keep top 80
    const quickscored = withVolume.slice(0, 200);

    // Layer 4: Full score — batch in parallel
    const fullBatch = quickscored.slice(0, 80);
    const fullscored = fullBatch.length;

    const scoredCoins = await this.fullScoreBatch(fullBatch);

    // Layer 5: Apply session filter
    const finalCoins = scoredCoins.map((coin) => {
      if (coin.direction === "WAIT") return coin;
      const price = coin.sl < coin.tp ? coin.sl : coin.tp;
      const filtered = applySessionFilter(coin.score, coin.sl, coin.tp, price);
      return { ...coin, score: filtered.score, sl: filtered.sl, tp: filtered.tp };
    });

    return {
      coins: finalCoins,
      totalScanned,
      prefiltered,
      quickscored: quickscored.length,
      fullscored,
      durationMs: Date.now() - startTime,
    };
  }

  private async discoverCoins(): Promise<string[]> {
    const info = await this.client.getExchangeInfo();
    return info.symbols
      .filter(
        (s) =>
          s.contractType === "PERPETUAL" &&
          s.status === "TRADING" &&
          s.quoteAsset === "USDT" &&
          !isLeveragedToken(s.symbol),
      )
      .map((s) => s.symbol)
      .slice(0, this.maxCoins);
  }

  private async fullScoreBatch(
    batch: Array<{ symbol: string; ticker: { lastPrice: string } }>,
  ): Promise<ScoredCoin[]> {
    const results: ScoredCoin[] = [];
    const batchSize = 10;

    for (let i = 0; i < batch.length; i += batchSize) {
      const chunk = batch.slice(i, i + batchSize);
      const chunkResults = await Promise.all(
        chunk.map(async ({ symbol }) => {
          try {
            const tfData = await Promise.all(
              this.timeframes.map(async (tf) => {
                const candles = await this.client.getKlines(symbol, tf, 200);
                return {
                  timeframe: tf,
                  candles: candles as Candle[],
                };
              }),
            );

            // Microstructure: only fetch if score will be near threshold
            // We compute a quick score first to decide
            const quickCandles = tfData[0].candles;
            const quickIndicators = (await import("./indicators/index.js")).computeIndicators(quickCandles);
            const quickScore = (await import("./indicators/index.js")).computeRawScore(quickIndicators, quickCandles[quickCandles.length - 1].close);

            let microstructure = null;
            if (quickScore >= 45 && quickScore <= 65) {
              microstructure = await getMicrostructure(symbol, this.client);
            }

            const coin = scoreSymbol(symbol, tfData, microstructure, this.adxThreshold);
            return coin;
          } catch {
            return null;
          }
        }),
      );

      for (const r of chunkResults) {
        if (r) results.push(r);
      }
    }

    return results.sort((a, b) => {
      const aScore = a.direction === "LONG" ? a.score : a.direction === "SHORT" ? 100 - a.score : 0;
      const bScore = b.direction === "LONG" ? b.score : b.direction === "SHORT" ? 100 - b.score : 0;
      return bScore - aScore;
    });
  }
}
