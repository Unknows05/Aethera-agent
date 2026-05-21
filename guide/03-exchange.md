# 3 — Exchange Module (Binance Futures)

Full REST client untuk Binance Futures USDT-M Perpetual.

## File

```
src/exchange/binance.ts
```

## Design

Class `BinanceClient` dengan semua method trading:

```ts
export class BinanceClient {
  constructor(
    private apiKey: string,
    private apiSecret: string,
    private baseUrl = "https://fapi.binance.com",
  ) {}
  ...
}
```

## Method List (16 total)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `ping()` | `GET /fapi/v1/ping` | Test connectivity |
| `getExchangeInfo()` | `GET /fapi/v1/exchangeInfo` | All trading pairs + specs |
| `getTickers()` | `GET /fapi/v1/ticker/24hr` | 24h stats |
| `getKlines(symbol, interval, limit)` | `GET /fapi/v1/klines` | OHLCV candles |
| `getMarkPrice(symbol)` | `GET /fapi/v1/premiumIndex` | Mark price + funding rate |
| `getFundingRate(symbol, limit)` | `GET /fapi/v1/fundingRate` | Historical funding rates |
| `getOpenInterest(symbol)` | `GET /fapi/v1/openInterest` | Open interest |
| `getLongShortRatio(symbol, period)` | `GET /futures/data/globalLongShortAccountRatio` | L/S ratio |
| `getTakerVolume(symbol, period)` | `GET /futures/data/takerlongshortRatio` | Taker buy/sell volume |
| `getDepth(symbol, limit)` | `GET /fapi/v1/depth` | Orderbook |
| `getBalance()` | `GET /fapi/v2/account` | Wallet balance |
| `getPositionRisk()` | `GET /fapi/v2/positionRisk` | Open positions |
| `setLeverage(symbol, leverage)` | `POST /fapi/v1/leverage` | Set leverage |
| `placeOrder(params)` | `POST /fapi/v1/order` | Place trade |
| `cancelOrder(symbol, orderId)` | `DELETE /fapi/v1/order` | Cancel order |
| `getIpRestriction()` | `GET /sapi/v1/account/apiRestrictions` | IP whitelist check |

## Signature (HMAC SHA256)

```ts
private sign(queryString: string): string {
  return createHmac("sha256", this.apiSecret)
    .update(queryString)
    .digest("hex");
}
```

## Key Implementation Details

### Rate Limiting
- Binance Futures: 1200 weight per minute
- Implement `lastRequestTime` tracking + delay jika perlu

### Error Handling
- 429: hit weight limit → sleep 1s → retry max 3x
- -2015: invalid API key → throw clear message
- -2019: IP not whitelisted → suggest whitelist

### Order Types
```ts
interface OrderParams {
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT" | "STOP_MARKET" | "TAKE_PROFIT_MARKET";
  quantity: number;
  price?: number;
  stopPrice?: number;
  reduceOnly?: boolean;
}
```

## Test Pattern

```ts
// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

it("ping returns true", async () => {
  mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
  const client = new BinanceClient("key", "secret");
  await expect(client.ping()).resolves.toBe(true);
});
```

## Key Gotchas
- **Base URL**: `fapi.binance.com` (Futures), BUKAN `api.binance.com` (Spot)
- **Quantity precision**: Gunakan `exchangeInfo` untuk dapatkan `quantityPrecision` dan `pricePrecision` per symbol
- **Reduce-only**: Wajib untuk close position agar tidak accidental open
