export interface RecoveryState {
  active: boolean;
  level: "none" | "warning" | "critical" | "stopped";
  peakEquity: number;
  currentEquity: number;
  drawdownPct: number;
  riskMultiplier: number;
  daysSinceRecovery: number;
}

export class DrawdownRecovery {
  private peakEquity = 0;
  private recoveryStartDay: Date | null = null;
  private readonly warningDd = 0.10;
  private readonly criticalDd = 0.20;
  private readonly stopDd = 0.30;

  update(equity: number): RecoveryState {
    if (equity > this.peakEquity) {
      this.peakEquity = equity;
      this.recoveryStartDay = null;
    }

    const dd = this.peakEquity > 0
      ? (this.peakEquity - equity) / this.peakEquity
      : 0;

    let level: RecoveryState["level"] = "none";
    let riskMultiplier = 1.0;

    if (dd >= this.stopDd) {
      level = "stopped";
      riskMultiplier = 0;
    } else if (dd >= this.criticalDd) {
      level = "critical";
      riskMultiplier = 0.25;
    } else if (dd >= this.warningDd) {
      level = "warning";
      riskMultiplier = 0.5;
    }

    if (level !== "none" && !this.recoveryStartDay) {
      this.recoveryStartDay = new Date();
    }

    const daysSince = this.recoveryStartDay
      ? Math.floor((Date.now() - this.recoveryStartDay.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    if (level === "none" && this.recoveryStartDay) {
      const recovered = equity >= this.peakEquity * 0.95;
      if (recovered) {
        this.recoveryStartDay = null;
      }
    }

    return {
      active: level !== "none",
      level,
      peakEquity: this.peakEquity,
      currentEquity: equity,
      drawdownPct: Math.round(dd * 10000) / 100,
      riskMultiplier,
      daysSinceRecovery: daysSince,
    };
  }

  reset(equity: number): void {
    this.peakEquity = equity;
    this.recoveryStartDay = null;
  }
}
