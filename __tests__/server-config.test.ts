import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getRuntimeHealth, requireGeminiConfig } from "@/lib/server-config";

describe("server-config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Clone process.env to avoid mutating the original
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original process.env
    process.env = originalEnv;
  });

  describe("getRuntimeHealth", () => {
    it("identifies missing variables correctly", () => {
      delete process.env.GEMINI_API_KEY;
      delete process.env.KV_REST_API_URL;
      delete process.env.KV_REST_API_TOKEN;
      process.env.NODE_ENV = "production";

      const result = getRuntimeHealth();

      expect(result.geminiKeyConfigured).toBe(false);
      expect(result.kvConfigured).toBe(false);
      expect(result.isDevelopment).toBe(false);
    });

    it("identifies all configured variables correctly", () => {
      process.env.GEMINI_API_KEY = "test-gemini-key";
      process.env.KV_REST_API_URL = "test-kv-url";
      process.env.KV_REST_API_TOKEN = "test-kv-token";
      process.env.NODE_ENV = "development";

      const result = getRuntimeHealth();

      expect(result.geminiKeyConfigured).toBe(true);
      expect(result.kvConfigured).toBe(true);
      expect(result.isDevelopment).toBe(true);
    });

    it("handles partial KV configurations (missing token)", () => {
      process.env.GEMINI_API_KEY = "test-gemini-key";
      process.env.KV_REST_API_URL = "test-kv-url";
      delete process.env.KV_REST_API_TOKEN;

      const result = getRuntimeHealth();

      expect(result.geminiKeyConfigured).toBe(true);
      expect(result.kvConfigured).toBe(false);
    });

    it("handles partial KV configurations (missing URL)", () => {
      process.env.GEMINI_API_KEY = "test-gemini-key";
      delete process.env.KV_REST_API_URL;
      process.env.KV_REST_API_TOKEN = "test-kv-token";

      const result = getRuntimeHealth();

      expect(result.geminiKeyConfigured).toBe(true);
      expect(result.kvConfigured).toBe(false);
    });
  });

  describe("requireGeminiConfig", () => {
    it("throws an error when GEMINI_API_KEY is missing", () => {
      delete process.env.GEMINI_API_KEY;

      expect(() => requireGeminiConfig()).toThrow(
        "Missing GEMINI_API_KEY. Add it in Vercel Project Settings."
      );
    });

    it("returns configuration correctly when variables are set", () => {
      process.env.GEMINI_API_KEY = "test-gemini-key";
      process.env.GEMINI_MODEL = "test-model";

      const config = requireGeminiConfig();

      expect(config.apiKey).toBe("test-gemini-key");
      expect(config.model).toBe("test-model");
    });

    it("defaults model to gemini-3.5-flash when GEMINI_MODEL is not set", () => {
      process.env.GEMINI_API_KEY = "test-gemini-key";
      delete process.env.GEMINI_MODEL;

      const config = requireGeminiConfig();

      expect(config.apiKey).toBe("test-gemini-key");
      expect(config.model).toBe("gemini-3.5-flash");
    });
  });
});
