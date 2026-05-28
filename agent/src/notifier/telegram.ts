const BASE = "https://api.telegram.org/bot";

export interface TelegramConfig {
  enabled: boolean;
  token: string;
  chatId: string;
}

export interface TelegramCommandContext {
  getBalance: () => Promise<number>;
  getPositions: () => Promise<Array<{
    symbol: string; side: string; size: number; entryPrice: number;
    markPrice: number; pnl: number; leverage: number;
  }>>;
  closePosition: (symbol: string) => Promise<{ success: boolean; error?: string }>;
  getSignals: () => Promise<Array<{
    symbol: string; direction: string; confidence: number; score: number; reasons: string[];
  }>>;
  getNetworkStats: () => Promise<{ totalAgents: number; onlineNow: number } | null>;
}

export class TelegramNotifier {
  private config: TelegramConfig;
  private cmdCtx: TelegramCommandContext | null = null;
  private lastUpdateId = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: TelegramConfig) {
    this.config = config;
  }

  setCommandContext(ctx: TelegramCommandContext): void {
    this.cmdCtx = ctx;
  }

  async send(text: string): Promise<void> {
    if (!this.config.enabled || !this.config.token || !this.config.chatId) return;
    try {
      const url = `${BASE}${this.config.token}/sendMessage`;
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: this.config.chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      });
    } catch {
      // non-blocking
    }
  }

  async reply(chatId: string, text: string): Promise<void> {
    if (!this.config.enabled || !this.config.token) return;
    try {
      const url = `${BASE}${this.config.token}/sendMessage`;
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      });
    } catch {
      // non-blocking
    }
  }

  startPolling(): void {
    if (!this.config.enabled || !this.config.token) return;
    this.pollTimer = setInterval(() => this.poll(), 3000);
  }

  stopPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  private async poll(): Promise<void> {
    if (!this.cmdCtx) return;
    try {
      const url = `${BASE}${this.config.token}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=10`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json() as {
        ok: boolean; result: Array<{
          update_id: number;
          message?: {
            chat: { id: number };
            text?: string;
            from?: { id: number; first_name?: string };
          };
        }>;
      };
      if (!data.ok || !data.result) return;

      for (const update of data.result) {
        if (update.update_id >= this.lastUpdateId) {
          this.lastUpdateId = update.update_id;
        }
        const msg = update.message;
        if (!msg?.text) continue;
        await this.handleCommand(String(msg.chat.id), msg.text);
      }
    } catch {
      // polling non-blocking
    }
  }

  private async handleCommand(chatId: string, text: string): Promise<void> {
    const cmd = text.trim().toLowerCase().split(" ");
    const ctx = this.cmdCtx;
    if (!ctx) return;

    switch (cmd[0]) {
      case "/start":
      case "/help":
        await this.reply(chatId,
          `<b>Aethera Agent</b>\n\n` +
          `/status — Agent status & equity\n` +
          `/positions — Open positions\n` +
          `/close &lt;symbol&gt; — Close a position\n` +
          `/signals — Top trade signals\n` +
          `/network — Hivemind network stats\n` +
          `/help — This message`,
        );
        break;

      case "/status": {
        const [balance, positions] = await Promise.all([ctx.getBalance(), ctx.getPositions()]);
        const posCount = positions.length;
        const totalPnl = positions.reduce((s, p) => s + p.pnl, 0);
        const uptime = Math.floor((Date.now() - Number(process.uptime() * 1000)) / 1000);
        const hours = Math.floor(uptime / 3600);
        const mins = Math.floor((uptime % 3600) / 60);
        await this.reply(chatId,
          `<b>📊 Status</b>\n` +
          `Balance: $${balance.toFixed(2)}\n` +
          `Open: ${posCount} | Unrealized PnL: $${totalPnl.toFixed(2)}\n` +
          `Uptime: ${hours}h ${mins}m`,
        );
        break;
      }

      case "/positions": {
        const positions = await ctx.getPositions();
        if (positions.length === 0) {
          await this.reply(chatId, "No open positions.");
          return;
        }
        const lines = positions.map((p) => {
          const emoji = p.pnl >= 0 ? "🟢" : "🔴";
          return `${emoji} <b>${p.symbol}</b> ${p.side}\n` +
            `  Entry: $${p.entryPrice} | Mark: $${p.markPrice}\n` +
            `  PnL: $${p.pnl.toFixed(2)} | Lev: ${p.leverage}x`;
        });
        await this.reply(chatId, `<b>📌 Positions (${positions.length})</b>\n\n${lines.join("\n\n")}`);
        break;
      }

      case "/close": {
        if (cmd.length < 2) {
          await this.reply(chatId, "Usage: /close &lt;symbol&gt;\nExample: /close BTCUSDT");
          return;
        }
        const symbol = cmd[1].toUpperCase();
        const result = await ctx.closePosition(symbol);
        if (result.success) {
          await this.reply(chatId, `✅ Closed ${symbol}`);
        } else {
          await this.reply(chatId, `❌ Failed: ${result.error}`);
        }
        break;
      }

      case "/signals": {
        const signals = await ctx.getSignals();
        if (signals.length === 0) {
          await this.reply(chatId, "No signals available.");
          return;
        }
        const lines = signals.slice(0, 10).map((s) => {
          const arrow = s.direction === "LONG" ? "🟢" : "🔴";
          return `${arrow} ${s.symbol} ${s.direction} (${s.confidence}) Score:${s.score} ${s.reasons?.[0] || ""}`;
        });
        await this.reply(chatId, `<b>📡 Top Signals</b>\n\n${lines.join("\n")}`);
        break;
      }

      case "/network": {
        const stats = await ctx.getNetworkStats();
        if (!stats) {
          await this.reply(chatId, "Hivemind not available.");
          return;
        }
        await this.reply(chatId,
          `<b>🌐 Hivemind Network</b>\n` +
          `Total agents: ${stats.totalAgents}\n` +
          `Online now: ${stats.onlineNow}`,
        );
        break;
      }

      default:
        await this.reply(chatId, `Unknown command: ${cmd[0]}\nUse /help to see available commands.`);
    }
  }

  async notifyDeploy(symbol: string, side: string, size: number, reason: string): Promise<void> {
    await this.send(
      `🚀 <b>DEPLOY</b>\n${symbol} ${side}\nSize: ${size.toFixed(4)}\nReason: ${reason}`,
    );
  }

  async notifyClose(symbol: string, side: string, pnl: number, reason: string): Promise<void> {
    const emoji = pnl >= 0 ? "✅" : "❌";
    await this.send(
      `${emoji} <b>CLOSE</b>\n${symbol} ${side}\nPnL: $${pnl.toFixed(2)}\nReason: ${reason}`,
    );
  }

  async notifyError(context: string, error: string): Promise<void> {
    await this.send(
      `⚠️ <b>ERROR</b>\nContext: ${context}\nError: ${error.slice(0, 500)}`,
    );
  }

  async notifyStartup(balance: number): Promise<void> {
    await this.send(
      `🤖 <b>Aethera Agent Online</b>\nBalance: $${balance.toFixed(2)} USDT`,
    );
  }

  async notifyShutdown(openPositions: number, totalPnl: number): Promise<void> {
    await this.send(
      `🛑 <b>Aethera Agent Shutdown</b>\nOpen positions: ${openPositions}\nUnrealized PnL: $${totalPnl.toFixed(2)}`,
    );
  }
}
