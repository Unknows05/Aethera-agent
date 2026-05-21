# 2 — Config Module

Lapisan konfigurasi: Zod schema → encrypted YAML.

## Files

```
src/config/
├── schema.ts     # Zod validation + equity tiers
├── crypto.ts     # AES-256-GCM encrypt/decrypt
└── index.ts      # YAML loader/saver
```

## 2a — Schema (`schema.ts`)

Definisi tipe dan validasi dengan Zod:

```ts
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

const GrowthConfigSchema = z.object({
  targetEquity: z.number().min(1),
  targetDays: z.number().int().min(1).max(365),
  dailyTargetPct: z.number().min(0).max(100),
  riskProfile: z.enum(["aggressive", "moderate", "conservative"]),
  llmCanRefuse: z.boolean().default(true),
  equityTiers: z.array(EquityTierSchema),
});

const ConfigSchema = z.object({
  version: z.string().default("2.0"),
  binance: z.object({ apiKey: z.string(), apiSecret: z.string() }),
  openrouter: z.object({
    apiKey: z.string(),
    primary: z.string().default("deepseek/deepseek-chat"),
    fallback: z.array(z.string()).default(["google/gemini-2.0-flash"]),
    temperature: z.number().min(0).max(2).default(0.3),
    maxTokens: z.number().int().default(512),
  }),
  growth: GrowthConfigSchema,
  screening: z.object({ ... }).optional().default({}),
});
```

**Key Concept — Equity Tiers:**
- $0-$100: agresif (25% risk, 3x lev, max 5 trades)
- $100-$300: moderate (18% risk, 5x lev, max 4 trades)
- $300-$600: conservative (15% risk, 5x lev, max 3 trades)
- $600-$1000: defensive (10% risk, 3x lev, max 2 trades)

## 2b — Crypto (`crypto.ts`)

Encrypt/decrypt secrets AES-256-GCM:

```ts
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

function deriveKey(password: string): Buffer {
  return scryptSync(password, "aethera-v2-salt", 32);
}

export function encrypt(text: string, password: string): string {
  const key = deriveKey(password);
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString("hex") + ":" + tag.toString("hex") + ":" + encrypted.toString("hex");
}

export function decrypt(encrypted: string, password: string): string {
  const [ivHex, tagHex, dataHex] = encrypted.split(":");
  const key = deriveKey(password);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return decipher.update(dataHex, "hex", "utf8") + decipher.final("utf8");
}
```

## 2c — Loader (`index.ts`)

```ts
const CONFIG_PATH = "data/config.yaml";
const KEY_PATH = "data/.key";

export function loadConfig(): Config { ... }
export function saveConfig(config: Config): void { ... }
```

**Flow:**
1. Generate random 32-byte key di `data/.key` jika belum ada
2. Load YAML dari `data/config.yaml`
3. Decrypt binance.apiKey, binance.apiSecret, openrouter.apiKey
4. Validasi dengan Zod
5. Return typed Config

## Key Decisions
- **Encrypted secrets**: API keys tidak pernah disimpan plain text
- **Zod validation**: Catch misconfiguration di startup
- **Equity tiers auto**: Dari config schema, risk profile menentukan level agresivitas
