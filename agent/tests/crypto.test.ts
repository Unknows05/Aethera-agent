import { describe, it, expect } from "vitest";
import { encrypt, decrypt, generateEncryptionKey } from "../src/config/crypto.js";

describe("generateEncryptionKey", () => {
  it("generates 64 character hex string", () => {
    const key = generateEncryptionKey();
    expect(key).toHaveLength(64);
    expect(key).toMatch(/^[0-9a-f]+$/);
  });

  it("generates unique keys each call", () => {
    const keys = new Set(Array.from({ length: 100 }, () => generateEncryptionKey()));
    expect(keys.size).toBe(100);
  });
});

describe("encrypt/decrypt roundtrip", () => {
  const key = generateEncryptionKey();

  const testCases = [
    { name: "simple", input: "hello" },
    { name: "API key format", input: "sk-or-v1-abcdef1234567890abcdef1234567890" },
    { name: "long string", input: "a".repeat(1000) },
    { name: "with special chars", input: "!@#$%^&*()_+-=[]{}|;':\",./<>?`~" },
    { name: "unicode", input: "日本語 español العربية" },
    { name: "numbers", input: "1234567890" },
    { name: "empty", input: "" },
  ];

  for (const { name, input } of testCases) {
    it(`roundtrips ${name}`, () => {
      const encrypted = encrypt(input, key);
      const decrypted = decrypt(encrypted, key);
      expect(decrypted).toBe(input);
    });
  }
});

describe("encrypt security properties", () => {
  const key = generateEncryptionKey();

  it("produces different output each encryption", () => {
    const a = encrypt("same-value", key);
    const b = encrypt("same-value", key);
    expect(a).not.toBe(b);
  });

  it("fails decryption with wrong key", () => {
    const wrongKey = generateEncryptionKey();
    const encrypted = encrypt("my-data", key);
    expect(() => decrypt(encrypted, wrongKey)).toThrow();
  });

  it("fails with tampered iv", () => {
    const encrypted = encrypt("data", key);
    const [iv, tag, payload] = encrypted.split(":");
    const tamperedIv = "ff" + iv.slice(2);
    expect(() => decrypt(`${tamperedIv}:${tag}:${payload}`, key)).toThrow();
  });

  it("fails with truncated ciphertext", () => {
    const encrypted = encrypt("data", key);
    expect(() => decrypt(encrypted.slice(0, -10), key)).toThrow();
  });
});

describe("edge cases", () => {
  const key = generateEncryptionKey();

  it("handles extremely long strings (10k chars)", () => {
    const input = "x".repeat(10000);
    const encrypted = encrypt(input, key);
    const decrypted = decrypt(encrypted, key);
    expect(decrypted).toBe(input);
    expect(decrypted).toHaveLength(10000);
  });

  it("handles whitespace-only strings", () => {
    const input = "   \t\n  ";
    const encrypted = encrypt(input, key);
    const decrypted = decrypt(encrypted, key);
    expect(decrypted).toBe(input);
  });

  it("produces ciphertext that is different from plaintext", () => {
    const encrypted = encrypt("not-this", key);
    expect(encrypted).not.toContain("not-this");
  });

  it("consistent IV length (16 bytes = 32 hex chars)", () => {
    const encrypted = encrypt("test", key);
    const iv = encrypted.split(":")[0];
    expect(iv).toHaveLength(32);
  });
});
