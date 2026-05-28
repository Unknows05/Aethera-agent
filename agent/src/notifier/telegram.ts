const BASE = "https://api.telegram.org/bot";

export interface TelegramConfig {
  enabled: boolean;
  token: string;
  chatId: string;
}

export class TelegramNotifier {
  private config: TelegramConfig;

  constructor(config: TelegramConfig) {
    this.config = config;
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
