import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";
import { kv } from "@vercel/kv";

// Mock @vercel/kv
vi.mock("@vercel/kv", () => ({
  kv: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

describe("rate-limiter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("checkRateLimit", () => {
    const NOW = 1000000000000;
    const WINDOW_MS = 60000;
    const LIMIT = 5;
    const KEY = "test-key";
    const REDIS_KEY = `ratelimit:${KEY}`;

    beforeEach(() => {
      vi.setSystemTime(NOW);
    });

    it("handles initial request when no rate limit data exists", async () => {
      vi.mocked(kv.get).mockResolvedValueOnce(null);

      const result = await checkRateLimit(KEY, LIMIT, WINDOW_MS);

      expect(kv.get).toHaveBeenCalledWith(REDIS_KEY);
      expect(kv.set).toHaveBeenCalledWith(
        REDIS_KEY,
        { count: 1, resetAt: NOW + WINDOW_MS },
        { ex: Math.ceil(WINDOW_MS / 1000) },
      );
      expect(result).toEqual({
        ok: true,
        remaining: LIMIT - 1,
        resetAt: NOW + WINDOW_MS,
        limit: LIMIT,
      });
    });

    it("resets limit when window is expired", async () => {
      const pastResetAt = NOW - 1000;
      vi.mocked(kv.get).mockResolvedValueOnce({
        count: 5,
        resetAt: pastResetAt,
      });

      const result = await checkRateLimit(KEY, LIMIT, WINDOW_MS);

      expect(kv.set).toHaveBeenCalledWith(
        REDIS_KEY,
        { count: 1, resetAt: NOW + WINDOW_MS },
        { ex: Math.ceil(WINDOW_MS / 1000) },
      );
      expect(result).toEqual({
        ok: true,
        remaining: LIMIT - 1,
        resetAt: NOW + WINDOW_MS,
        limit: LIMIT,
      });
    });

    it("increments count when within window and below limit", async () => {
      const futureResetAt = NOW + 30000;
      vi.mocked(kv.get).mockResolvedValueOnce({
        count: 2,
        resetAt: futureResetAt,
      });

      const result = await checkRateLimit(KEY, LIMIT, WINDOW_MS);

      expect(kv.set).toHaveBeenCalledWith(
        REDIS_KEY,
        { count: 3, resetAt: futureResetAt },
        { ex: Math.ceil(WINDOW_MS / 1000) },
      );
      expect(result).toEqual({
        ok: true,
        remaining: LIMIT - 3,
        resetAt: futureResetAt,
        limit: LIMIT,
      });
    });

    it("blocks request when limit is reached within window", async () => {
      const futureResetAt = NOW + 30000;
      vi.mocked(kv.get).mockResolvedValueOnce({
        count: LIMIT,
        resetAt: futureResetAt,
      });

      const result = await checkRateLimit(KEY, LIMIT, WINDOW_MS);

      expect(kv.set).not.toHaveBeenCalled();
      expect(result).toEqual({
        ok: false,
        remaining: 0,
        resetAt: futureResetAt,
        limit: LIMIT,
      });
    });
  });

  describe("getClientIp", () => {
    it("returns first IP from x-forwarded-for header", () => {
      const request = new Request("https://example.com", {
        headers: {
          "x-forwarded-for": "203.0.113.195, 70.41.3.18, 150.172.238.178",
        },
      });
      expect(getClientIp(request)).toBe("203.0.113.195");
    });

    it("returns trimmed IP from x-forwarded-for header", () => {
      const request = new Request("https://example.com", {
        headers: {
          "x-forwarded-for": "  203.0.113.195  ",
        },
      });
      expect(getClientIp(request)).toBe("203.0.113.195");
    });

    it("falls back to x-real-ip if x-forwarded-for is missing", () => {
      const request = new Request("https://example.com", {
        headers: {
          "x-real-ip": "198.51.100.1",
        },
      });
      expect(getClientIp(request)).toBe("198.51.100.1");
    });

    it("returns unknown if neither header is present", () => {
      const request = new Request("https://example.com");
      expect(getClientIp(request)).toBe("unknown");
    });

    it("handles empty x-forwarded-for correctly", () => {
      const request = new Request("https://example.com", {
        headers: {
          "x-forwarded-for": "",
          "x-real-ip": "198.51.100.1",
        },
      });
      expect(getClientIp(request)).toBe("198.51.100.1");
    });
  });
});
