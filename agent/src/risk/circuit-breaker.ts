export interface CircuitBreakerState {
  active: boolean;
  reason: string;
  triggeredAt: number | null;
  dailyLossCount: number;
  consecutiveLosses: number;
  peakEquity: number;
  dailyStartEquity: number;
  tradesToday: number;
  cooldownUntil: number | null;
}

export interface CBConfig {
  maxDailyLossPct: number;
  maxConsecutiveLosses: number;
  maxDailyTrades: number;
  maxDrawdownPct: number;
  cooldownMinutes: number;
}

export class CircuitBreaker {
  private state: CircuitBreakerState;
  private config: CBConfig;

  constructor(config?: Partial<CBConfig>) {
    this.config = {
      maxDailyLossPct: config?.maxDailyLossPct ?? 0.25,
      maxConsecutiveLosses: config?.maxConsecutiveLosses ?? 3,
      maxDailyTrades: config?.maxDailyTrades ?? 5,
      maxDrawdownPct: config?.maxDrawdownPct ?? 0.20,
      cooldownMinutes: config?.cooldownMinutes ?? 1440,
    };
    this.state = this.freshState();
  }

  freshState(): CircuitBreakerState {
    return {
      active: false,
      reason: "",
      triggeredAt: null,
      dailyLossCount: 0,
      consecutiveLosses: 0,
      peakEquity: 0,
      dailyStartEquity: 0,
      tradesToday: 0,
      cooldownUntil: null,
    };
  }

  reset(): void {
    this.state = this.freshState();
  }

  getState(): CircuitBreakerState {
    return { ...this.state };
  }

  onTradeResult(win: boolean, pnlPct: number, currentEquity: number): void {
    this.state.tradesToday++;
    this.state.dailyLossCount += pnlPct < 0 ? 1 : 0;

    if (!win) this.state.consecutiveLosses++;
    else this.state.consecutiveLosses = 0;

    if (currentEquity > this.state.peakEquity) {
      this.state.peakEquity = currentEquity;
    }

    this.check(currentEquity);
  }

  setEquity(equity: number): void {
    if (equity > this.state.peakEquity) {
      this.state.peakEquity = equity;
    }
    if (this.state.dailyStartEquity === 0) {
      this.state.dailyStartEquity = equity;
    }
  }

  check(currentEquity: number): void {
    // Cooldown check
    if (this.state.cooldownUntil && Date.now() < this.state.cooldownUntil) {
      this.state.active = true;
      this.state.reason = "Dalam cooldown";
      return;
    }

    this.state.active = false;
    this.state.reason = "";

    // Max consecutive losses
    if (this.state.consecutiveLosses >= this.config.maxConsecutiveLosses) {
      this.state.active = true;
      this.state.triggeredAt = Date.now();
      this.state.reason = `${this.state.consecutiveLosses}x consecutive losses (max ${this.config.maxConsecutiveLosses})`;
      this.state.cooldownUntil = Date.now() + this.config.cooldownMinutes * 60 * 1000;
      return;
    }

    // Max daily loss
    const dailyLossPct = this.state.dailyStartEquity > 0
      ? (this.state.dailyStartEquity - currentEquity) / this.state.dailyStartEquity
      : 0;
    if (dailyLossPct >= this.config.maxDailyLossPct) {
      this.state.active = true;
      this.state.triggeredAt = Date.now();
      this.state.reason = `Daily loss ${(dailyLossPct * 100).toFixed(1)}% exceeds ${(this.config.maxDailyLossPct * 100).toFixed(0)}% limit`;
      this.state.cooldownUntil = Date.now() + this.config.cooldownMinutes * 60 * 1000;
      return;
    }

    // Max drawdown
    if (this.state.peakEquity > 0) {
      const drawdown = (this.state.peakEquity - currentEquity) / this.state.peakEquity;
      if (drawdown >= this.config.maxDrawdownPct) {
        this.state.active = true;
        this.state.triggeredAt = Date.now();
        this.state.reason = `Drawdown ${(drawdown * 100).toFixed(1)}% exceeds ${(this.config.maxDrawdownPct * 100).toFixed(0)}% limit`;
        this.state.cooldownUntil = Date.now() + this.config.cooldownMinutes * 60 * 1000;
        return;
      }
    }

    // Max trades per day
    if (this.state.tradesToday >= this.config.maxDailyTrades) {
      this.state.active = true;
      this.state.reason = `Max ${this.config.maxDailyTrades} trades/day reached`;
      return;
    }

    // Flash crash detection (>5% in short time)
    if (this.state.dailyStartEquity > 0) {
      const drop = (this.state.dailyStartEquity - currentEquity) / this.state.dailyStartEquity;
      if (drop > 0.05 && this.state.tradesToday <= 2) {
        this.state.active = true;
        this.state.triggeredAt = Date.now();
        this.state.reason = `Flash crash suspected: equity dropped ${(drop * 100).toFixed(1)}%`;
        this.state.cooldownUntil = Date.now() + 30 * 60 * 1000;
        return;
      }
    }
  }

  canTrade(): boolean {
    return !this.state.active;
  }

  get dailyLossPct(): number {
    if (this.state.dailyStartEquity <= 0) return 0;
    const current = this.state.peakEquity;
    return (this.state.dailyStartEquity - current) / this.state.dailyStartEquity;
  }

  get consecutiveLosses(): number {
    return this.state.consecutiveLosses;
  }

  get drawdown(): number {
    if (this.state.peakEquity <= 0) return 0;
    return (this.state.peakEquity - this.state.dailyStartEquity) / this.state.peakEquity;
  }
}
