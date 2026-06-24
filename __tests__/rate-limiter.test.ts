import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';
import { kv } from '@vercel/kv';

vi.mock('@vercel/kv', () => ({
  kv: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

describe('rate-limiter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkRateLimit', () => {
    it('should initialize rate limit when no previous record exists', async () => {
      vi.useFakeTimers();
      const mockDateNow = 1000000;
      vi.setSystemTime(mockDateNow);

      vi.mocked(kv.get).mockResolvedValueOnce(null);

      const limit = 10;
      const windowMs = 60000;
      const result = await checkRateLimit('test-key', limit, windowMs);

      expect(kv.get).toHaveBeenCalledWith('ratelimit:test-key');
      expect(kv.set).toHaveBeenCalledWith(
        'ratelimit:test-key',
        { count: 1, resetAt: mockDateNow + windowMs },
        { ex: 60 }
      );
      expect(result).toEqual({
        ok: true,
        remaining: 9,
        resetAt: mockDateNow + windowMs,
        limit
      });

      vi.useRealTimers();
    });

    it('should initialize rate limit when previous record is expired', async () => {
      vi.useFakeTimers();
      const mockDateNow = 1000000;
      vi.setSystemTime(mockDateNow);

      vi.mocked(kv.get).mockResolvedValueOnce({
        count: 5,
        resetAt: mockDateNow - 100 // expired
      });

      const limit = 10;
      const windowMs = 60000;
      const result = await checkRateLimit('test-key', limit, windowMs);

      expect(kv.set).toHaveBeenCalledWith(
        'ratelimit:test-key',
        { count: 1, resetAt: mockDateNow + windowMs },
        { ex: 60 }
      );
      expect(result).toEqual({
        ok: true,
        remaining: 9,
        resetAt: mockDateNow + windowMs,
        limit
      });

      vi.useRealTimers();
    });

    it('should increment count and allow request when within limit', async () => {
      vi.useFakeTimers();
      const mockDateNow = 1000000;
      vi.setSystemTime(mockDateNow);

      vi.mocked(kv.get).mockResolvedValueOnce({
        count: 5,
        resetAt: mockDateNow + 10000 // future
      });

      const result = await checkRateLimit('test-key', 10, 60000);

      expect(kv.set).toHaveBeenCalledWith(
        'ratelimit:test-key',
        { count: 6, resetAt: mockDateNow + 10000 },
        { ex: 60 }
      );
      expect(result).toEqual({
        ok: true,
        remaining: 4,
        resetAt: mockDateNow + 10000,
        limit: 10
      });

      vi.useRealTimers();
    });

    it('should return ok: false when limit is exceeded', async () => {
      vi.useFakeTimers();
      const mockDateNow = 1000000;
      vi.setSystemTime(mockDateNow);

      vi.mocked(kv.get).mockResolvedValueOnce({
        count: 10,
        resetAt: mockDateNow + 10000 // future
      });

      const result = await checkRateLimit('test-key', 10, 60000);

      expect(kv.set).not.toHaveBeenCalled();
      expect(result).toEqual({
        ok: false,
        remaining: 0,
        resetAt: mockDateNow + 10000,
        limit: 10
      });

      vi.useRealTimers();
    });

    it('should handle remaining correctly if count is greater than limit', async () => {
      vi.useFakeTimers();
      const mockDateNow = 1000000;
      vi.setSystemTime(mockDateNow);

      vi.mocked(kv.get).mockResolvedValueOnce({
        count: 15,
        resetAt: mockDateNow + 10000 // future
      });

      const result = await checkRateLimit('test-key', 10, 60000);
      expect(result).toEqual({
        ok: false,
        remaining: 0,
        resetAt: mockDateNow + 10000,
        limit: 10
      });

      vi.useRealTimers();
    });

    it('should fallback and allow request when KV fails', async () => {
      vi.useFakeTimers();
      const mockDateNow = 1000000;
      vi.setSystemTime(mockDateNow);

      const mockError = new Error('KV connection failed');
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.mocked(kv.get).mockRejectedValueOnce(mockError);

      const limit = 10;
      const windowMs = 60000;
      const result = await checkRateLimit('test-key', limit, windowMs);

      expect(console.warn).toHaveBeenCalledWith("KV rate limit failed, allowing request:", mockError);
      expect(result).toEqual({
        ok: true,
        limit: limit,
        remaining: 1,
        resetAt: mockDateNow + windowMs
      });

      vi.useRealTimers();
    });
  });

  describe('getClientIp', () => {
    it('should extract IP from x-forwarded-for header', () => {
      const req = new Request('http://localhost', {
        headers: {
          'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178'
        }
      });
      expect(getClientIp(req)).toBe('203.0.113.195');
    });

    it('should fallback to x-real-ip if x-forwarded-for is absent', () => {
      const req = new Request('http://localhost', {
        headers: {
          'x-real-ip': '203.0.113.195'
        }
      });
      expect(getClientIp(req)).toBe('203.0.113.195');
    });

    it('should return unknown if no IP headers are present', () => {
      const req = new Request('http://localhost');
      expect(getClientIp(req)).toBe('unknown');
    });
  });
});
