import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getRuntimeHealth } from "@/lib/server-config";

describe("getRuntimeHealth", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("identifies all missing variables", () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_BUCKET;

    const health = getRuntimeHealth();

    expect(health.geminiConfigured).toBe(false);
    expect(health.supabaseConfigured).toBe(false);
    expect(health.storageConfigured).toBe(false);
    expect(health.missing).toEqual([
      "GEMINI_API_KEY",
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_BUCKET"
    ]);
  });

  it("identifies fully configured state", () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "test-url";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-role-key";
    process.env.SUPABASE_BUCKET = "test-bucket";
    process.env.GEMINI_MODEL = "test-model";

    const health = getRuntimeHealth();

    expect(health.geminiConfigured).toBe(true);
    expect(health.supabaseConfigured).toBe(true);
    expect(health.storageConfigured).toBe(true);
    expect(health.model).toBe("test-model");
    expect(health.missing).toEqual([]);
  });

  it("identifies partial configuration (Gemini only)", () => {
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_BUCKET;

    const health = getRuntimeHealth();

    expect(health.geminiConfigured).toBe(true);
    expect(health.supabaseConfigured).toBe(false);
    expect(health.storageConfigured).toBe(false);
    expect(health.missing).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_BUCKET"
    ]);
  });

  it("identifies partial configuration (Supabase no bucket)", () => {
    delete process.env.GEMINI_API_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "test-url";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-role-key";
    delete process.env.SUPABASE_BUCKET;

    const health = getRuntimeHealth();

    expect(health.geminiConfigured).toBe(false);
    expect(health.supabaseConfigured).toBe(true);
    expect(health.storageConfigured).toBe(false);
    expect(health.missing).toEqual([
      "GEMINI_API_KEY",
      "SUPABASE_BUCKET"
    ]);
  });

  it("uses default model when GEMINI_MODEL is missing", () => {
    delete process.env.GEMINI_MODEL;

    const health = getRuntimeHealth();

    expect(health.model).toBe("gemini-3.5-flash");
  });
});
