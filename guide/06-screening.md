# 6 — Screening Engine

Multi-tier cryptocurrency screener untuk Binance Futures Perpetual.

## Files

```
src/screening/
├── index.ts           # Re-exports
├── types.ts           # Candle, IndicatorResult, ScoredCoin, Timeframe
├── scanner.ts         # Multi-tier pipeline
├── scorer.ts          # TF-weighted scoring + SL/TP
├── regime.ts          # ADX-based regime detection
├── microstructure.ts  # Orderbook, funding, L/S ratio
├── session-filter.ts  # ASIA/LONDON/NY session modifier
├── signals.ts         # Signal generation
└── indicators/
    ├── index.ts       # computeIndicators, computeRawScore
    ├── rsi.ts
    ├── macd.ts
    ├── bollinger.ts
    ├── atr.ts
    ├── adx.ts
    ├── volume.ts
    └── ema.ts
```

## Scanner Pipeline — 5 Layers

```
Layer 1: Discover Coin (500 max)
  ├── exchangeInfo → filter PERPETUAL + USDT + TRADING
  └── exclude leveraged tokens (UP/DOWN/BULL/BEAR)

Layer 2: Prefilter by Volume (→ 200)
  ├── getTickers → sort by quoteVolume DESC
  └── min volume: $1M USDT

Layer 3: Quick Score (→ 80)
  ├── 15m RSI + Volume Z-score
  └── fast pass untuk masuk full scan

Layer 4: Full Score (→ 20)
  ├── fetch 200 candles for 15m, 1h, 4h
  ├── computeIndicators → scoreSymbol
  ├── batch parallel 10 workers per chunk
  └── microstructure hanya jika score 45-65 (borderline)

Layer 5: Session Filter
  ├── ASIA: ×1.0
  ├── LONDON: ×1.03 score, ×1.2 vol
  ├── NY: ×1.03 score, ×1.2 vol
  └── LONDON_NY overlap: ×1.05 score, ×1.3 vol
```

## Indicator Formulas

### RSI (14)
```
RSI = 100 - 100/(1 + RS)
RS = avg_gain_14 / avg_loss_14
RSI Signal: <30 oversold, >70 overbought
RSI Score: (rsi - 50) × 0.8
```

### MACD (12, 26, 9)
```
MACD = EMA_12 - EMA_26
Signal = EMA_9(MACD)
Histogram = MACD - Signal
MACD Score: (histogram / price) × 8000
```

### Bollinger Bands (20, 2)
```
Middle = SMA_20
Upper = Middle + 2×σ
Lower = Middle - 2×σ
%B = (price - Lower) / (Upper - Lower)
Squeeze: bandwidth < 0.1 → ±15 score bonus
```

### ATR (14)
```
ATR = EMA_14(TR)
TR = max(high-low, |high-prev_close|, |low-prev_close|)
ATR% = ATR / close × 100
```

### ADX (14)
```
ADX = EMA_14(|+DI - -DI| / (+DI + -DI))
+DI = Smoothed +DM / ATR
-DI = Smoothed -DM / ATR
Trend: ADX > 25 = strong
Direction: +DI > -DI = bullish
```

### Volume
```
Volume Ratio = current_vol / SMA_20_vol
Volume Z-score = (current_vol - mean_vol_20) / std_vol_20
Spike: z-score > 2 → +8 score
OBV Momentum = OBV - EMA_14(OBV)
```

### EMA Alignment
```
EMA_20, EMA_50, EMA_200
Bullish: 20 > 50 > 200
Bearish: 20 < 50 < 200
Score bonus: +10 aligned, -10 anti-aligned
```

## Scoring Formula

```
raw_score = 50
  + rsi_score × 0.8
  + macd_score
  + volume_zscore × 2
  + bb_bonus (±15)
  + ema_bonus (±10)
  + pattern_bonus (±5)

tf_score = 0.6 × 15m_score + 0.3 × 1h_score + 0.1 × 4h_score
```

## Regime Detection

```
ADX < 25 → SIDEWAYS
ADX 25-40 → +DI > -DI ? BULL : BEAR
ADX > 40 → HIGH_VOL

Microstructure Override:
  - funding < -0.1% annualized → bearish bias
  - long/short ratio > 2 → crowded long → bearish
  - orderbook imbalance > 10% → follow imbalance
```

## SL/TP Calculation

```
LONG:  SL = low_15m × 0.995,  TP = SL + 2 × ATR
SHORT: SL = high_15m × 1.005, TP = SL - 2 × ATR
Dynamic: adjust by ATR% (wider SL untuk high vol)
```
