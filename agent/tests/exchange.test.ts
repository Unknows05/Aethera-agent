import { describe, it, expect, vi, afterEach } from "vitest";
import { BinanceClient } from "../src/exchange/binance.js";

const mockFetchSuccess = () =>
  vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BinanceClient", () => {
  it("creates client with API keys", () => {
    const client = new BinanceClient("test-key", "test-secret");
    expect(client).toBeInstanceOf(BinanceClient);
  });

  it("ping returns true for public endpoint", async () => {
    vi.stubGlobal("fetch", mockFetchSuccess());
    const client = new BinanceClient("test-key", "test-secret");
    const result = await client.ping();
    expect(result).toBe(true);
  });
});

describe("getPublicIP", () => {
  it("returns a string (maybe unknown)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ip: "1.2.3.4" }),
    }));
    const { getPublicIP } = await import("../src/exchange/binance.js");
    const ip = await getPublicIP();
    expect(ip).toBe("1.2.3.4");
  });
});
