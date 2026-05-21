import { describe, it, expect } from "vitest";
import { getDefaultConfig, ConfigSchema } from "../src/config/schema.js";

// These functions are internal to init.ts but we test the math/logic
// by importing the schema and testing related calculations

describe("Growth Strategy Math", () => {
  it("default config has 4 equity tiers", () => {
    const cfg = getDefaultConfig();
    expect(cfg.growth.equityTiers).toHaveLength(4);
  });

  it("equity tiers are sequential and non-overlapping", () => {
    const cfg = getDefaultConfig();
    for (let i = 0; i < cfg.growth.equityTiers.length - 1; i++) {
      const current = cfg.growth.equityTiers[i];
      const next = cfg.growth.equityTiers[i + 1];
      expect(current.max).toBe(next.min);
    }
  });

  it("risk decreases as equity increases", () => {
    const cfg = getDefaultConfig();
    for (let i = 0; i < cfg.growth.equityTiers.length - 1; i++) {
      expect(cfg.growth.equityTiers[i].maxRisk)
        .toBeGreaterThan(cfg.growth.equityTiers[i + 1].maxRisk);
    }
  });

  it("daily target decreases as equity increases", () => {
    const cfg = getDefaultConfig();
    for (let i = 0; i < cfg.growth.equityTiers.length - 1; i++) {
      expect(cfg.growth.equityTiers[i].dailyTarget)
        .toBeGreaterThan(cfg.growth.equityTiers[i + 1].dailyTarget);
    }
  });

  it("leverage decreases at high equity", () => {
    const cfg = getDefaultConfig();
    const last = cfg.growth.equityTiers[cfg.growth.equityTiers.length - 1];
    const first = cfg.growth.equityTiers[0];
    expect(last.maxLeverage).toBeLessThanOrEqual(first.maxLeverage);
  });

  it("accepts all risk profile values", () => {
    for (const profile of ["aggressive", "moderate", "conservative"] as const) {
      const cfg = getDefaultConfig();
      cfg.growth.riskProfile = profile;
      const result = ConfigSchema.safeParse(cfg);
      expect(result.success).toBe(true);
    }
  });

  it("llmCanRefuse is true by default", () => {
    const cfg = getDefaultConfig();
    expect(cfg.growth.llmCanRefuse).toBe(true);
  });

  it("target days default is 21", () => {
    const cfg = getDefaultConfig();
    expect(cfg.growth.targetDays).toBe(21);
  });

  it("target equity default is 1000", () => {
    const cfg = getDefaultConfig();
    expect(cfg.growth.targetEquity).toBe(1000);
  });

  it("maxTrades decreases as equity grows", () => {
    const cfg = getDefaultConfig();
    for (let i = 0; i < cfg.growth.equityTiers.length - 1; i++) {
      expect(cfg.growth.equityTiers[i].maxTrades)
        .toBeGreaterThanOrEqual(cfg.growth.equityTiers[i + 1].maxTrades);
    }
  });

  it("maxConsecutive losses increases with equity (more tolerance)", () => {
    const cfg = getDefaultConfig();
    for (let i = 0; i < cfg.growth.equityTiers.length - 1; i++) {
      expect(cfg.growth.equityTiers[i].maxConsecutive)
        .toBeLessThanOrEqual(cfg.growth.equityTiers[i + 1].maxConsecutive);
    }
  });
});

describe("Screening defaults", () => {
  it("default min score for long is 55", () => {
    const cfg = getDefaultConfig();
    expect(cfg.screening?.longMinScore).toBe(55);
  });

  it("default timeframes include 15m, 1h, 4h", () => {
    const cfg = getDefaultConfig();
    expect(cfg.screening?.timeframes).toContain("15m");
    expect(cfg.screening?.timeframes).toContain("1h");
    expect(cfg.screening?.timeframes).toContain("4h");
  });
});
