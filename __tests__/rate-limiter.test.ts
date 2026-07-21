import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";

describe("checkRateLimit", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("without KV configured", () => {
    beforeEach(() => {
      delete process.env.KV_REST_API_URL;
      delete process.env.KV_REST_API_TOKEN;
      delete process.env.RATE_LIMIT_DISABLED;
    });

    it("allows requests in development", async () => {
      process.env.NODE_ENV = "development";
      const result = await checkRateLimit("test-key", 5, 60000);
      expect(result.ok).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
    });

    it("allows requests in production (graceful degradation)", async () => {
      process.env.NODE_ENV = "production";
      const result = await checkRateLimit("test-key", 5, 60000);
      expect(result.ok).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
    });
  });

  describe("with RATE_LIMIT_DISABLED", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "production";
    });

    it("allows all requests when RATE_LIMIT_DISABLED=1", async () => {
      process.env.RATE_LIMIT_DISABLED = "1";
      const result = await checkRateLimit("test-key", 5, 60000);
      expect(result.ok).toBe(true);
    });

    it("allows all requests when RATE_LIMIT_DISABLED=true", async () => {
      process.env.RATE_LIMIT_DISABLED = "true";
      const result = await checkRateLimit("test-key", 5, 60000);
      expect(result.ok).toBe(true);
    });
  });
});

describe("getClientIp", () => {
  it("extracts first IP from x-forwarded-for", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    const req = new Request("https://example.com", {
      headers: { "x-real-ip": "9.9.9.9" },
    });
    expect(getClientIp(req)).toBe("9.9.9.9");
  });

  it("returns unknown when no IP headers", () => {
    const req = new Request("https://example.com");
    expect(getClientIp(req)).toBe("unknown");
  });
});
