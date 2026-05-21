import type { HivemindConfig, HivemindStatus, AggregatedSignal, HivemindEvent } from "./types.js";

type EventHandler = (event: HivemindEvent) => void;

export class HivemindClient {
  private config: HivemindConfig;
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private handlers: EventHandler[] = [];
  private _agentId: string | null = null;
  private _username: string | null = null;

  status: HivemindStatus = {
    connected: false,
    agentId: null,
    username: null,
    onlineAgents: 0,
    lastSync: null,
  };

  constructor(config: HivemindConfig) {
    this.config = config;
  }

  on(handler: EventHandler): void {
    this.handlers.push(handler);
  }

  private emit(event: HivemindEvent): void {
    for (const h of this.handlers) h(event);
  }

  async connect(): Promise<void> {
    if (!this.config.enabled) return;

    // Register dulu via REST
    try {
      const httpUrl = this.config.hub.replace(/^ws/, "http").replace(/\/ws.*$/, "");
      const registerRes = await fetch(`${httpUrl}/api/hivemind/auth/register`, {
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
      const httpUrl = this.config.hub.replace(/^ws/, "http").replace(/\/ws.*$/, "");
      const loginRes = await fetch(`${httpUrl}/api/hivemind/auth/login`, {
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
        this.ws?.close();
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
    }
  }

  // ============================================================
  // Agent API
  // ============================================================
  publishSignal(symbol: string, direction: "LONG" | "SHORT" | "WAIT", confidence: number): void {
    this.send({ type: "signal_vote", symbol, direction, confidence });
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

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close();
    this.ws = null;
    this.status.connected = false;
  }
}
