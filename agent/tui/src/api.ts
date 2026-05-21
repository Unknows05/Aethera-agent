import type { SystemStatus, Signal } from "./types.js";

const DEFAULT_BASE = "http://127.0.0.1:8000";

export function getWsUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  const proto = url.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${url.host}/ws`;
}

export async function fetchStatus(baseUrl: string): Promise<SystemStatus> {
  try {
    const r = await fetch(`${baseUrl}/api/status`);
    const d = await r.json();
    return {
      ok: true,
      mode: "LIVE",
      balance: d.balance ?? null,
      equity: d.equity ?? null,
      openPositions: d.openPositions ?? 0,
      positions: d.positions ?? [],
      cycleCount: 0,
      lastCycle: "-",
    };
  } catch {
    return { ok: false, mode: "OFFLINE", balance: null, equity: null, openPositions: 0, positions: [], cycleCount: 0, lastCycle: "-" };
  }
}

export async function fetchSignals(baseUrl: string): Promise<Signal[]> {
  try {
    const r = await fetch(`${baseUrl}/api/signals/top?count=10`);
    return await r.json() as Signal[];
  } catch {
    return [];
  }
}
