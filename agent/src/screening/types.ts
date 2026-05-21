export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface IndicatorResult {
  rsi: number;
  rsiSignal: "oversold" | "overbought" | "neutral";
  macd: {
    macd: number;
    signal: number;
    histogram: number;
    status: "bullish" | "bearish" | "neutral";
  };
  ema: {
    ema20: number | null;
    ema50: number | null;
    ema200: number | null;
    alignment: "bullish" | "bearish" | "neutral";
  };
  adx: {
    value: number;
    trendStrength: "strong" | "weak" | "none";
    direction: "bullish" | "bearish" | "neutral";
  };
  atr: {
    value: number;
    percent: number;
  };
  bollinger: {
    upper: number;
    middle: number;
    lower: number;
    percentB: number;
    squeeze: boolean;
    squeezePct: number;
  };
  volume: {
    ratio: number;
    zscore: number;
    spike: boolean;
    trend: "increasing" | "decreasing" | "neutral";
    obvMomentum: number;
  };
  vwap: number;
  vwapDeviation: number;
}

export interface ScoredCoin {
  symbol: string;
  score: number;
  direction: "LONG" | "SHORT" | "WAIT";
  confidence: number;
  regime: string;
  regimeConfidence: number;
  indicators: IndicatorResult;
  sl: number;
  tp: number;
  reasons: string[];
  microstructure?: MicrostructureResult;
}

export interface MicrostructureResult {
  sentiment: number;
  longShortRatio: number;
  takerBuyRatio: number;
  fundingAnnualized: number;
  whaleSignal: string;
  orderbookImbalance: number;
  liquidationRisk: string;
  adjustments: {
    sentiment: number;
    funding: number;
    whale: number;
    liquidity: number;
    total: number;
  };
}

export type Timeframe = "15m" | "1h" | "4h";
