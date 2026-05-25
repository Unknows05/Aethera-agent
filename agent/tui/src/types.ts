export interface Position {
  symbol: string;
  side: "LONG" | "SHORT";
  size: number;
  entryPrice: number;
  markPrice: number;
  pnl: number;
  leverage: number;
  liquidationPrice: number;
}

export interface SystemStatus {
  ok: boolean;
  mode: string;
  balance: number | null;
  equity: number | null;
  openPositions: number;
  positions: Position[];
  cycleCount: number;
  lastCycle: string;
}

export interface Signal {
  symbol: string;
  score: number;
  direction: "LONG" | "SHORT" | "WAIT";
  confidence: number;
  regime: string;
  reasons: string[];
  fundingRate?: number;
  openInterest?: number;
  takerBuyRatio?: number;
  depthImbalance?: number;
  volume24h?: number;
}

export interface StateResponse {
  balance: number;
  equity: number;
  btcPrice: number;
  fundingAvg: number;
  openPositions: number;
  positions: Position[];
  signals: Signal[];
  uptime: number;
}

export interface SignalsResponse {
  total: number;
  signals: Signal[];
  scanDuration: number;
}

export interface WsMessage {
  type: "init" | "update" | "pong" | "trade" | "alert" | "cycle";
  [key: string]: unknown;
}

export interface AgentMessage {
  id: string;
  agent: "hunter" | "healer" | "system";
  content: string;
  timestamp: number;
  color?: string;
}
