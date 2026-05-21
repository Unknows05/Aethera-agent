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
