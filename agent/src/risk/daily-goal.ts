import type { EquityTier } from "../config/schema.js";

export interface GoalState {
  targetEquity: number;
  currentEquity: number;
  startEquity: number;
  daysElapsed: number;
  daysRemaining: number;
  dailyTargetPct: number;
  progressPct: number;
  urgency: "ahead" | "on_track" | "behind" | "critical";
  urgencyMult: number;
  requiredDailyPct: number;
  tier: EquityTier;
}

export class DailyGoalTracker {
  private targetEquity: number;
  private totalDays: number;
  private startEquity: number;
  private startDate: Date;
  private customDailyPct: number | null;

  constructor(config: {
    targetEquity: number;
    totalDays: number;
    startEquity: number;
    customDailyPct?: number;
  }) {
    this.targetEquity = config.targetEquity;
    this.totalDays = config.totalDays;
    this.startEquity = config.startEquity;
    this.startDate = new Date();
    this.customDailyPct = config.customDailyPct ?? null;
  }

  getState(currentEquity: number, tiers: EquityTier[]): GoalState {
    const now = new Date();
    const msElapsed = now.getTime() - this.startDate.getTime();
    const daysElapsed = Math.max(0, msElapsed / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.max(1, this.totalDays - daysElapsed);

    const requiredReturn = this.targetEquity / currentEquity;
    const requiredDaily = (requiredReturn ** (1 / daysRemaining) - 1) * 100;

    const progress = this.targetEquity > this.startEquity
      ? ((currentEquity - this.startEquity) / (this.targetEquity - this.startEquity)) * 100
      : 0;
    const expectedProgress = (daysElapsed / this.totalDays) * 100;
    const progressRatio = expectedProgress > 0 ? progress / expectedProgress : 1;

    let urgency: GoalState["urgency"] = "on_track";
    let urgencyMult = 1.0;
    if (progressRatio > 1.2) { urgency = "ahead"; urgencyMult = 0.7; }
    else if (progressRatio < 0.5) { urgency = "critical"; urgencyMult = 1.5; }
    else if (progressRatio < 0.85) { urgency = "behind"; urgencyMult = 1.3; }

    const dailyTargetPct = this.customDailyPct ?? requiredDaily;
    const adjustedTarget = Math.max(0.5, Math.min(50, dailyTargetPct * urgencyMult));

    const tier = tiers.find((t) => currentEquity >= t.min && currentEquity < t.max)
      ?? tiers[tiers.length - 1];

    return {
      targetEquity: this.targetEquity,
      currentEquity,
      startEquity: this.startEquity,
      daysElapsed: Math.round(daysElapsed * 10) / 10,
      daysRemaining: Math.round(daysRemaining),
      dailyTargetPct: Math.round(adjustedTarget * 10) / 10,
      progressPct: Math.round(progress * 10) / 10,
      urgency,
      urgencyMult,
      requiredDailyPct: Math.round(requiredDaily * 10) / 10,
      tier,
    };
  }
}
