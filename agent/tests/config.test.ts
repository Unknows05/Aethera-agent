import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { existsSync, unlinkSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { getDefaultConfig, ConfigSchema } from "../src/config/schema.js";
import { encrypt, decrypt, generateEncryptionKey } from "../src/config/crypto.js";

describe("ConfigSchema", () => {
  it("produces valid default config", () => {
    const cfg = getDefaultConfig();
    const result = ConfigSchema.safeParse(cfg);
    expect(result.success).toBe(true);
  });

  it("allows empty apiKey (validated at init, not schema)", () => {
    const cfg = getDefaultConfig();
    cfg.binance.apiKey = "";
    cfg.binance.apiSecret = "";
    const result = ConfigSchema.safeParse(cfg);
    expect(result.success).toBe(true);
  });

  it("accepts valid equity tiers", () => {
    const cfg = getDefaultConfig();
    expect(cfg.growth.equityTiers[0].maxRisk).toBe(0.25);
    expect(cfg.growth.equityTiers[0].maxLeverage).toBe(3);
    expect(cfg.growth.equityTiers[3].maxRisk).toBe(0.10);
  });

  it("defaults openrouter temperature to 0.3", () => {
    const cfg = getDefaultConfig();
    expect(cfg.openrouter.temperature).toBe(0.3);
  });

  it("validates risk profile values", () => {
    const cfg = getDefaultConfig();
    cfg.growth.riskProfile = "aggressive";
    expect(ConfigSchema.safeParse(cfg).success).toBe(true);

    cfg.growth.riskProfile = "moderate";
    expect(ConfigSchema.safeParse(cfg).success).toBe(true);

    cfg.growth.riskProfile = "conservative";
    expect(ConfigSchema.safeParse(cfg).success).toBe(true);

    (cfg.growth.riskProfile as string) = "invalid";
    expect(ConfigSchema.safeParse(cfg).success).toBe(false);
  });

  it("validates leverage is 1-10", () => {
    const cfg = getDefaultConfig();
    cfg.growth.equityTiers[0].maxLeverage = 20;
    expect(ConfigSchema.safeParse(cfg).success).toBe(false);

    cfg.growth.equityTiers[0].maxLeverage = 0;
    expect(ConfigSchema.safeParse(cfg).success).toBe(false);
  });
});

describe("Crypto", () => {
  let key: string;
  let key2: string;

  beforeEach(() => {
    key = generateEncryptionKey();
    key2 = generateEncryptionKey();
  });

  it("encrypts and decrypts keys", () => {
    const original = "my-super-secret-api-key-12345";
    const encrypted = encrypt(original, key);
    const decrypted = decrypt(encrypted, key);
    expect(decrypted).toBe(original);
  });

  it("produces different ciphertext each time", () => {
    const e1 = encrypt("same-value", key);
    const e2 = encrypt("same-value", key);
    expect(e1).not.toBe(e2);
  });

  it("fails with wrong key", () => {
    const k = generateEncryptionKey();
    const wk = generateEncryptionKey();
    const encrypted = encrypt("secret", k);
    expect(() => decrypt(encrypted, wk)).toThrow();
  });

  it("fails with tampered ciphertext", () => {
    const k = generateEncryptionKey();
    const encrypted = encrypt("secret", k);
    const tampered = encrypted.slice(0, -1) + "0";
    expect(() => decrypt(tampered, k)).toThrow();
  });

  it("has correct format (iv:tag:payload)", () => {
    const encrypted = encrypt("test", key);
    const parts = encrypted.split(":");
    expect(parts.length).toBe(3);
    expect(parts[0].length).toBe(32); // 16 bytes hex
    expect(parts[1].length).toBe(32); // 16 bytes tag hex
  });

  it("generates 64-char hex key", () => {
    expect(key.length).toBe(64);
    expect(/^[0-9a-f]+$/.test(key)).toBe(true);
  });

  it("handles empty string", () => {
    const encrypted = encrypt("", key);
    const decrypted = decrypt(encrypted, key);
    expect(decrypted).toBe("");
  });
});

describe("Config integration", () => {
  const testDir = join(process.cwd(), "data-test");

  beforeAll(() => {
    mkdirSync(testDir, { recursive: true });
    process.env.AETHERA_CONFIG = join(testDir, "config.yaml");
  });

  afterAll(() => {
    delete process.env.AETHERA_CONFIG;
    rmSync(testDir, { recursive: true, force: true });
  });

  it("loads default when no config file exists", async () => {
    const { loadConfig } = await import("../src/config/index.js");
    process.env.AETHERA_CONFIG = join(testDir, "nonexistent.yaml");
    const cfg = loadConfig();
    expect(cfg.version).toBe("2.0");
    expect(cfg.binance.apiKey).toBe("");
  });

  it("saves and reloads config with encrypted secrets", async () => {
    const { saveConfig, loadConfig } = await import("../src/config/index.js");
    const cfg = getDefaultConfig();
    cfg.binance.apiKey = "my-test-key-12345";
    cfg.binance.apiSecret = "my-test-secret-67890";
    cfg.openrouter.apiKey = "or-test-key-99999";
    cfg.growth.targetEquity = 500;
    cfg.growth.targetDays = 14;

    saveConfig(cfg);

    const loaded = loadConfig();
    expect(loaded.binance.apiKey).toBe("my-test-key-12345");
    expect(loaded.binance.apiSecret).toBe("my-test-secret-67890");
    expect(loaded.openrouter.apiKey).toBe("or-test-key-99999");
    expect(loaded.growth.targetEquity).toBe(500);
    expect(loaded.growth.targetDays).toBe(14);
  });
});
