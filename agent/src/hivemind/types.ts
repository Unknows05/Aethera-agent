export interface HivemindConfig {
  enabled: boolean;
  hub: string;
  apiKey: string;
  username?: string;
  agentId?: string;
}

export interface HivemindStatus {
  connected: boolean;
  agentId: string | null;
  username: string | null;
  onlineAgents: number;
  lastSync: string | null;
}

export interface AggregatedSignal {
  symbol: string;
  longs: number;
  shorts: number;
  avgConfidence: number;
  totalVotes: number;
}

export interface HivemindLesson {
  id: string;
  agentId: string;
  username?: string;
  summary: string;
  timestamp: string;
}

export interface HivemindEvent {
  type:
    | "connected"
    | "signal_update"
    | "lesson_broadcast"
    | "weight_update"
    | "trade_broadcast"
    | "agent_join"
    | "agent_leave"
    | "pong"
    | "error";
  [key: string]: unknown;
}
