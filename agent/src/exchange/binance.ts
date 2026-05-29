import { createHmac } from "node:crypto";
import { globalLimiter } from "./rateLimiter.js";

const BASE = "https://fapi.binance.com";

function isBanned(status: number): boolean {
  return status === 418;
}

async function rateLimitedFetch(url: string, init?: RequestInit): Promise<Response> {
  await globalLimiter.acquire();
  return fetch(url, init);
}

interface BinanceResponse {
  code?: number;
  msg?: string;
}

interface AccountInfo {
  totalWalletBalance: string;
  totalUnrealizedProfit: string;
  availableBalance: string;
  positions: Array<{
    symbol: string;
    positionAmt: string;
    entryPrice: string;
    markPrice: string;
    unrealizedProfit: string;
    liquidationPrice: string;
    leverage: string;
  }>;
}

interface Ticker {
  symbol: string;
  lastPrice: string;
  volume: string;
  quoteVolume: string;
  priceChangePercent: string;
}

interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

function signRequest(queryString: string, secret: string): string {
  return createHmac("sha256", secret).update(queryString).digest("hex");
}

async function request<T>(
  method: string,
  path: string,
  apiKey: string,
  secret: string,
  params: Record<string, string | number> = {},
): Promise<T> {
  const queryString = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const timestamp = Date.now();
  const withRecv = queryString
    ? `${queryString}&recvWindow=15000&timestamp=${timestamp}`
    : `recvWindow=15000&timestamp=${timestamp}`;
  const signature = signRequest(withRecv, secret);
  const fullQuery = withRecv;

  const url = `${BASE}${path}?${fullQuery}&signature=${signature}`;

  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await rateLimitedFetch(url, {
      method,
      headers: {
        "X-MBX-APIKEY": apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (res.ok) return res.json() as Promise<T>;

    const body = (await res.json()) as BinanceResponse;

    // 418 = IP banned — tunggu 60s sebelum retry
    if (isBanned(res.status)) {
      const banUntil = body.msg?.match(/banned until (\d+)/);
      const waitMs = banUntil ? Math.min(Number(banUntil[1]) - Date.now() + 1000, 120_000) : 60_000;
      if (waitMs > 0 && attempt < 4) {
        await new Promise((r) => setTimeout(r, Math.max(waitMs, 10_000)));
        continue;
      }
    }

    if (res.status === 429 && attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
      continue;
    }

    throw new Error(`Binance API error: ${body.code} — ${body.msg || res.statusText}`);
  }

  throw new Error(`Binance API error: max retries`);
}

async function publicRequest<T>(method: string, path: string, params: Record<string, string | number> = {}): Promise<T> {
  const queryString = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const url = `${BASE}${path}${queryString ? `?${queryString}` : ""}`;

  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await rateLimitedFetch(url);
    if (r.ok) return r.json() as Promise<T>;

    // 418 = IP banned — tunggu 60s sebelum retry
    if (isBanned(r.status)) {
      if (attempt < 4) {
        await new Promise((r) => setTimeout(r, 60_000));
        continue;
      }
    }

    if (r.status === 429 && attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
      continue;
    }

    throw new Error(`Binance public API error: ${r.status}`);
  }

  throw new Error(`Binance public API error: max retries`);
}

export class BinanceClient {
  private apiKey: string;
  private secret: string;

  constructor(apiKey: string, secret: string) {
    this.apiKey = apiKey;
    this.secret = secret;
  }

  async ping(): Promise<boolean> {
    try {
      await publicRequest("GET", "/fapi/v1/ping");
      return true;
    } catch {
      return false;
    }
  }

  async getAccount(): Promise<AccountInfo> {
    return request<AccountInfo>("GET", "/fapi/v2/account", this.apiKey, this.secret);
  }

  async getBalance(): Promise<number> {
    const acct = await this.getAccount();
    return Number.parseFloat(acct.availableBalance);
  }

  async getTickers(): Promise<Ticker[]> {
    return publicRequest<Ticker[]>("GET", "/fapi/v1/ticker/24hr");
  }

  async getKlines(symbol: string, interval: string, limit = 200): Promise<Kline[]> {
    const raw = await publicRequest<unknown[][]>("GET", "/fapi/v1/klines", {
      symbol,
      interval,
      limit,
    });
    return raw.map((k) => ({
      openTime: k[0] as number,
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
      closeTime: Number(k[6]),
    }));
  }

  async getExchangeInfo(): Promise<{ symbols: Array<{ symbol: string; contractType: string; status: string; quoteAsset: string; filters: Array<{ filterType: string; stepSize?: string; minQty?: string; tickSize?: string }> }> }> {
    return publicRequest("GET", "/fapi/v1/exchangeInfo");
  }

  private lotSizeCache = new Map<string, number>();

  async getLotStepSize(symbol: string): Promise<number> {
    if (this.lotSizeCache.has(symbol)) return this.lotSizeCache.get(symbol)!;
    const info = await this.getExchangeInfo();
    const s = info.symbols.find((x) => x.symbol === symbol);
    if (!s) return 0.001; // default
    const lotFilter = s.filters?.find((f) => f.filterType === "LOT_SIZE");
    const step = lotFilter?.stepSize ? Number(lotFilter.stepSize) : 0.001;
    this.lotSizeCache.set(symbol, step);
    return step;
  }

  async roundQuantity(symbol: string, qty: number): Promise<number> {
    const step = await this.getLotStepSize(symbol);
    const precision = Math.max(0, Math.ceil(-Math.log10(step)));
    return Number(qty.toFixed(precision));
  }

  async getMarkPrice(symbol: string): Promise<{ markPrice: string }> {
    return publicRequest("GET", "/fapi/v1/premiumIndex", { symbol });
  }

  async getPremiumIndices(): Promise<Array<{ symbol: string; markPrice: string; indexPrice: string; lastFundingRate: string; nextFundingTime: number }>> {
    return publicRequest("GET", "/fapi/v1/premiumIndex");
  }

  async getFundingRate(symbol: string, limit = 100): Promise<Array<{ fundingRate: string; fundingTime: number }>> {
    return publicRequest("GET", "/fapi/v1/fundingRate", { symbol, limit });
  }

  async getOpenInterest(symbol: string): Promise<{ openInterest: string }> {
    return publicRequest("GET", "/fapi/v1/openInterest", { symbol });
  }

  async getLongShortRatio(symbol: string, period = "5m", limit = 100): Promise<Array<{ longShortRatio: string; longAccount: string; shortAccount: string }>> {
    return publicRequest("GET", "/futures/data/globalLongShortAccountRatio", {
      symbol,
      period,
      limit,
    });
  }

  async getTopTraderRatio(symbol: string, period = "5m", limit = 100): Promise<Array<{ longShortRatio: string; longAccount: string; shortAccount: string }>> {
    return publicRequest("GET", "/futures/data/topLongShortPositionRatio", {
      symbol,
      period,
      limit,
    });
  }

  async getTakerVolume(symbol: string, period = "5m", limit = 100): Promise<Array<{ buySellRatio: string; buyVol: string; sellVol: string }>> {
    return publicRequest("GET", "/futures/data/takerlongshortRatio", {
      symbol,
      period,
      limit,
    });
  }

  async getOpenInterestHist(symbol: string, period = "5m", limit = 2): Promise<Array<{ sumOpenInterest: string; sumOpenInterestValue: string; timestamp: number }>> {
    return publicRequest("GET", "/futures/data/openInterestHist", {
      symbol,
      period,
      limit,
    });
  }

  async getDepth(symbol: string, limit = 100): Promise<{ bids: string[][]; asks: string[][] }> {
    return publicRequest("GET", "/fapi/v1/depth", { symbol, limit });
  }

  async testConnection(): Promise<{ success: boolean; balance: number; error?: string }> {
    try {
      const ping = await this.ping();
      if (!ping) return { success: false, balance: 0, error: "Binance API tidak reachable" };

      const balance = await this.getBalance();
      return { success: true, balance };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("-2015")) {
        return { success: false, balance: 0, error: "API Key invalid atau IP belum diwhitelist" };
      }
      if (msg.includes("-2014")) {
        return { success: false, balance: 0, error: "Secret Key salah" };
      }
      return { success: false, balance: 0, error: msg };
    }
  }

  async placeOrder(params: {
    symbol: string;
    side: "BUY" | "SELL";
    type: "MARKET" | "LIMIT";
    quantity: number;
    price?: number;
    stopPrice?: number;
    reduceOnly?: boolean;
  }): Promise<{ orderId: number; status: string }> {
    const qty = await this.roundQuantity(params.symbol, params.quantity);
    const body: Record<string, string | number> = {
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      quantity: qty,
    };

    if (params.price) body.price = params.price;
    if (params.stopPrice) body.stopPrice = params.stopPrice;
    if (params.reduceOnly) body.reduceOnly = "true";

    if (params.type === "LIMIT") body.timeInForce = "GTC";

    return request("POST", "/fapi/v1/order", this.apiKey, this.secret, body);
  }

  async setLeverage(symbol: string, leverage: number): Promise<void> {
    await request("POST", "/fapi/v1/leverage", this.apiKey, this.secret, {
      symbol,
      leverage,
    });
  }

  async getPositionRisk(): Promise<Array<{
    symbol: string;
    positionAmt: string;
    entryPrice: string;
    markPrice: string;
    unrealizedProfit: string;
    liquidationPrice: string;
    leverage: string;
  }>> {
    return request("GET", "/fapi/v2/positionRisk", this.apiKey, this.secret);
  }
}

export async function getPublicIP(): Promise<string> {
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    const data = (await res.json()) as { ip: string };
    return data.ip;
  } catch {
    return "unknown";
  }
}
