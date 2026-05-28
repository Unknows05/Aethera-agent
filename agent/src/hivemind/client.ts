import type { HivemindConfig, HivemindStatus, AggregatedSignal, HivemindEvent } from "./types.js";

interface SharedLesson {
  id: string;
  agentId: string;
  username?: string;
  lessonJson: string;
  tags: string;
  win: number;
  timestamp: string;
}

interface ParsedLesson {
  rule: string;
  tags: string[];
  outcome: string;
  confidence: number;
  pinned: boolean;
}

type EventHandler = (event: HivemindEvent) => void;

export class HivemindClient {
  private config: HivemindConfig;
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private handlers: EventHandler[] = [];
  private _agentId: string | null = null;
  private _username: string | null = null;
  private messageQueue: Array<Record<string, unknown>> = [];
  private flushing = false;
  private _httpUrl: string = "";

  status: HivemindStatus = {
    connected: false,
    agentId: null,
    username: null,
    onlineAgents: 0,
    lastSync: null,
  };

  constructor(config: HivemindConfig) {
    this.config = config;
    this._httpUrl = this.config.hub.replace(/^ws/, "http").replace(/\/ws.*$/, "");
  }

  on(handler: EventHandler): void {
    this.handlers.push(handler);
  }

  private emit(event: HivemindEvent): void {
    for (const h of this.handlers) h(event);
  }

  private get httpUrl(): string {
    return this._httpUrl;
  }

  private async resolveApi(path: string, body: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await fetch(`${this.httpUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": this.config.apiKey },
        body: JSON.stringify(body),
      });
      if (!res.ok) return false;
      const data = await res.json() as { ok: boolean };
      return data.ok === true;
    } catch {
      return false;
    }
  }

  private enqueue(msg: Record<string, unknown>): void {
    this.messageQueue.push(msg);
    if (this.messageQueue.length > 100) this.messageQueue.shift();
  }

  private async flushQueue(): Promise<void> {
    if (this.flushing || this.messageQueue.length === 0) return;
    this.flushing = true;

    const batch = [...this.messageQueue];
    this.messageQueue = [];

    for (const msg of batch) {
      let sent = false;
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(msg));
        sent = true;
      } else {
        sent = await this.sendViaREST(msg);
      }
      if (!sent) this.enqueue(msg); // re-queue if both fail
    }

    this.flushing = false;
  }

  private async sendViaREST(msg: Record<string, unknown>): Promise<boolean> {
    switch (msg.type) {
      case "signal_vote":
        return this.resolveApi("/api/hivemind/signal/submit", {
          symbol: msg.symbol,
          direction: msg.direction,
          confidence: msg.confidence,
          funding_rate: msg.funding_rate,
          open_interest: msg.open_interest,
          oi_change: msg.oi_change,
          taker_buy_ratio: msg.taker_buy_ratio,
          top_long_short_ratio: msg.top_long_short_ratio,
          global_long_short_ratio: msg.global_long_short_ratio,
          depth_imbalance: msg.depth_imbalance,
          volume_24h: msg.volume_24h,
        });
      case "lesson_share":
        return this.resolveApi("/api/hivemind/lesson/share", {
          lessonJson: JSON.stringify(msg.lesson || {}),
          tags: msg.tags || "",
          win: msg.win || 0,
          agentId: this._agentId,
        });
      case "trade_result":
        return this.resolveApi("/api/hivemind/trade/result", {
          win: msg.win,
          pnl: msg.pnl,
        });
      default:
        return false;
    }
  }

  async connect(): Promise<void> {
    if (!this.config.enabled) return;

    // Use stored agentId if available from config
    if (this.config.agentId) {
      this._agentId = this.config.agentId;
    }

    // Register dulu via REST
    try {
      const registerRes = await fetch(`${this.httpUrl}/api/hivemind/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: this.config.username || `agent_${Date.now()}`,
          apiKey: this.config.apiKey,
        }),
      });
      const registerData = await registerRes.json() as { ok: boolean; agentId?: string };
      if (registerData.ok && registerData.agentId) {
        this._agentId = registerData.agentId;
      }
    } catch {
      // Hub might already have this agent registered
    }

    // Login
    try {
      const loginRes = await fetch(`${this.httpUrl}/api/hivemind/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: this.config.apiKey }),
      });
      const loginData = await loginRes.json() as { ok: boolean; agent?: { id: string; username: string } };
      if (loginData.ok && loginData.agent) {
        this._agentId = loginData.agent.id;
        this._username = loginData.agent.username;
      }
    } catch {
      // Will try WS directly
    }

    // WebSocket connection
    this.connectWs();
  }

  private connectWs(): void {
    if (!this.config.enabled) return;

    try {
      const wsUrl = `${this.config.hub}?api_key=${this.config.apiKey}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.status.connected = true;
        this.status.agentId = this._agentId;
        this.status.username = this._username;
        this.emit({ type: "connected", agentId: this._agentId, username: this._username });

        // Flush queued messages
        this.flushQueue();

        this.pingTimer = setInterval(() => {
          this.send({ type: "ping" });
        }, 30_000);
      };

      this.ws.onmessage = (e: MessageEvent) => {
        try {
          const event = JSON.parse(e.data) as HivemindEvent;
          this.handleEvent(event);
        } catch { /* ignore */ }
      };

      this.ws.onclose = () => {
        this.status.connected = false;
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.reconnectTimer = setTimeout(() => this.connectWs(), 5000);
      };

      this.ws.onerror = () => {
        // ws udah error state — close() bakal trigger loop infinite di undici
      };
    } catch {
      this.reconnectTimer = setTimeout(() => this.connectWs(), 5000);
    }
  }

  private handleEvent(event: HivemindEvent): void {
    switch (event.type) {
      case "connected":
        this._agentId = event.agentId as string;
        this._username = event.username as string;
        this.status.agentId = this._agentId;
        this.status.username = this._username;
        break;
      case "agent_join":
      case "agent_leave":
        this.status.onlineAgents = event.online as number;
        break;
      case "signal_update":
      case "lesson_broadcast":
      case "weight_update":
      case "trade_broadcast":
        this.status.lastSync = new Date().toISOString();
        break;
    }
    this.emit(event);
  }

  send(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      // WS not available — try REST fallback, or queue if REST also fails
      this.sendViaREST(data).then((sent) => {
        if (!sent) this.enqueue(data);
      });
    }
  }

  // ============================================================
  // Agent API
  // ============================================================
  publishSignal(symbol: string, direction: "LONG" | "SHORT" | "WAIT", confidence: number, enrichment?: {
    fundingRate?: number;
    openInterest?: number;
    oiChange?: number;
    takerBuyRatio?: number;
    topLongShortRatio?: number;
    globalLongShortRatio?: number;
    depthImbalance?: number;
    volume24h?: number;
  }): void {
    this.send({
      type: "signal_vote", symbol, direction, confidence,
      funding_rate: enrichment?.fundingRate,
      open_interest: enrichment?.openInterest,
      oi_change: enrichment?.oiChange,
      taker_buy_ratio: enrichment?.takerBuyRatio,
      top_long_short_ratio: enrichment?.topLongShortRatio,
      global_long_short_ratio: enrichment?.globalLongShortRatio,
      depth_imbalance: enrichment?.depthImbalance,
      volume_24h: enrichment?.volume24h,
    });
  }

  publishLesson(lesson: Record<string, unknown>, tags: string, win: boolean): void {
    this.send({ type: "lesson_share", lesson, tags, win: win ? 1 : 0 });
  }

  publishWeightUpdate(signalName: string, weight: number): void {
    this.send({ type: "weight_update", signalName, weight });
  }

  publishTradeResult(win: boolean, pnl: number): void {
    this.send({ type: "trade_result", win, pnl });
  }

  // ============================================================
  // PULL data from hub — dipanggil orchestrator tiap cycle
  // ============================================================

  async fetchSharedLessons(limit = 20): Promise<ParsedLesson[]> {
    if (!this.config.enabled) return [];
    try {
      const httpUrl = this.config.hub.replace(/^ws/, "http").replace(/\/ws.*$/, "");
      const res = await fetch(`${httpUrl}/api/hivemind/lessons/list?limit=${limit}`);
      if (!res.ok) return [];
      const data = await res.json() as { lessons: SharedLesson[] };
      return (data.lessons || []).map((l) => {
        let rule = l.lessonJson;
        try {
          const parsed = JSON.parse(l.lessonJson);
          rule = parsed.pattern || parsed.rule || parsed.summary || l.lessonJson;
        } catch { /* use raw string */ }
        return {
          rule: typeof rule === "string" ? rule.slice(0, 500) : String(rule).slice(0, 500),
          tags: l.tags ? l.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
          outcome: l.win ? "win" : "loss",
          confidence: 70,
          pinned: false,
        };
      });
    } catch {
      return [];
    }
  }

  async fetchAggregatedSignals(minVotes = 2): Promise<AggregatedSignal[]> {
    if (!this.config.enabled) return [];
    try {
      const httpUrl = this.config.hub.replace(/^ws/, "http").replace(/\/ws.*$/, "");
      const res = await fetch(`${httpUrl}/api/hivemind/signal/aggregated?min=${minVotes}`);
      if (!res.ok) return [];
      const data = await res.json() as { signals: AggregatedSignal[] };
      return data.signals || [];
    } catch {
      return [];
    }
  }

  async fetchLeaderboard(limit = 10): Promise<Array<{ username: string; wins: number; totalPnl: number; wr: number }>> {
    if (!this.config.enabled) return [];
    try {
      const httpUrl = this.config.hub.replace(/^ws/, "http").replace(/\/ws.*$/, "");
      const res = await fetch(`${httpUrl}/api/hivemind/stats/leaderboard?limit=${limit}`);
      if (!res.ok) return [];
      const data = await res.json() as { leaderboard: Array<{ username: string; wins: number; totalPnl: number; wr: number }> };
      return data.leaderboard || [];
    } catch {
      return [];
    }
  }

  async fetchNetworkStats(): Promise<{ totalAgents: number; onlineNow: number; totalLessons: number } | null> {
    if (!this.config.enabled) return null;
    try {
      const httpUrl = this.config.hub.replace(/^ws/, "http").replace(/\/ws.*$/, "");
      const res = await fetch(`${httpUrl}/api/hivemind/stats/network`);
      if (!res.ok) return null;
      return await res.json() as { totalAgents: number; onlineNow: number; totalLessons: number };
    } catch {
      return null;
    }
  }

  async deregister(): Promise<boolean> {
    if (!this.config.enabled) return false;
    try {
      const httpUrl = this.config.hub.replace(/^ws/, "http").replace(/\/ws.*$/, "");
      const res = await fetch(`${httpUrl}/api/hivemind/auth/deregister`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: this.config.apiKey }),
      });
      const data = await res.json() as { ok: boolean };
      return data.ok === true;
    } catch {
      return false;
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close();
    this.ws = null;
    this.status.connected = false;
  }
}
