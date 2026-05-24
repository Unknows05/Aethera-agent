import { z } from "zod";

const EquityTierSchema = z.object({
  min: z.number().min(0),
  max: z.number().min(0),
  maxRisk: z.number().min(0).max(1),
  dailyTarget: z.number().min(0).max(1),
  maxLeverage: z.number().int().min(1).max(10),
  maxTrades: z.number().int().min(1).max(10),
  maxConsecutive: z.number().int().min(1).max(10),
});

const BinanceConfigSchema = z.object({
  apiKey: z.string(),
  apiSecret: z.string(),
});

const OpenRouterConfigSchema = z.object({
  apiKey: z.string(),
  primary: z.string().default("deepseek/deepseek-chat"),
  fallback: z.array(z.string()).default(["google/gemini-2.0-flash"]),
  temperature: z.number().min(0).max(2).default(0.3),
  maxTokens: z.number().int().default(512),
});

const GrowthConfigSchema = z.object({
  targetEquity: z.number().min(1),
  targetDays: z.number().int().min(1).max(365),
  dailyTargetPct: z.number().min(0).max(100),
  riskProfile: z.enum(["aggressive", "moderate", "conservative"]),
  llmCanRefuse: z.boolean().default(true),
  equityTiers: z.array(EquityTierSchema),
});

const ScreeningConfigSchema = z.object({
  maxCoins: z.number().int().default(500),
  prefilterMinVolume: z.number().default(1_000_000),
  timeframes: z.array(z.string()).default(["15m", "1h", "4h"]),
  tfWeights: z.record(z.number()).default({ "15m": 0.6, "1h": 0.3, "4h": 0.1 }),
  longMinScore: z.number().default(55),
  shortMinScore: z.number().default(55),
  highConfidence: z.number().default(70),
  agentHunterInterval: z.number().default(1800),
  agentHealerInterval: z.number().default(300),
});

const HivemindConfigSchema = z.object({
  enabled: z.boolean().default(false),
  hub: z.string().default("ws://localhost:8900/api/hivemind/ws"),
  apiKey: z.string().default(""),
  username: z.string().optional(),
});

export const ConfigSchema = z.object({
  version: z.string().default("2.0"),
  binance: BinanceConfigSchema,
  openrouter: OpenRouterConfigSchema,
  growth: GrowthConfigSchema,
  screening: ScreeningConfigSchema.optional().default({}),
  hivemind: HivemindConfigSchema.optional().default({
    enabled: false,
    hub: "ws://localhost:8900/api/hivemind/ws",
    apiKey: "",
  }),
});

export type Config = z.infer<typeof ConfigSchema>;
export type EquityTier = z.infer<typeof EquityTierSchema>;

export function getDefaultConfig(): Config {
  return {
    version: "2.0",
    binance: { apiKey: "", apiSecret: "" },
    openrouter: {
      apiKey: "",
      primary: "deepseek/deepseek-chat",
      fallback: ["google/gemini-2.0-flash"],
      temperature: 0.3,
      maxTokens: 512,
    },
    growth: {
      targetEquity: 1000,
      targetDays: 21,
      dailyTargetPct: 5.2,
      riskProfile: "moderate",
      llmCanRefuse: true,
      equityTiers: [
        { min: 0, max: 100, maxRisk: 0.25, dailyTarget: 0.12, maxLeverage: 3, maxTrades: 5, maxConsecutive: 2 },
        { min: 100, max: 300, maxRisk: 0.18, dailyTarget: 0.06, maxLeverage: 5, maxTrades: 4, maxConsecutive: 3 },
        { min: 300, max: 600, maxRisk: 0.15, dailyTarget: 0.04, maxLeverage: 5, maxTrades: 3, maxConsecutive: 4 },
        { min: 600, max: 999_999, maxRisk: 0.10, dailyTarget: 0.025, maxLeverage: 3, maxTrades: 2, maxConsecutive: 5 },
      ],
    },
    screening: {
      maxCoins: 500,
      prefilterMinVolume: 1_000_000,
      timeframes: ["15m", "1h", "4h"],
      tfWeights: { "15m": 0.6, "1h": 0.3, "4h": 0.1 },
      longMinScore: 55,
      shortMinScore: 55,
      highConfidence: 70,
      agentHunterInterval: 1800,
      agentHealerInterval: 300,
    },
    hivemind: {
      enabled: false,
      hub: "ws://localhost:8000/api/hivemind/ws",
      apiKey: "",
    },
  };
}
