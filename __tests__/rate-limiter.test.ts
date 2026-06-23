import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkRateLimit, getClientIp } from '../src/lib/rate-limiter';
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

  describe('checkRateLimit', () => {
    it('returns success and sets initial count for a new key', async () => {
      const now = 1000000000;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      vi.mocked(kv.get).mockResolvedValueOnce(null);

      const result = await checkRateLimit('new-key', 20, 60000);

      expect(kv.get).toHaveBeenCalledWith('ratelimit:new-key');
      expect(kv.set).toHaveBeenCalledWith(
        'ratelimit:new-key',
        { count: 1, resetAt: now + 60000 },
        { ex: 60 }
      );
      expect(result).toEqual({
        ok: true,
        limit: 20,
        remaining: 19,
        resetAt: now + 60000
      });

      vi.restoreAllMocks();
    });

    it('returns success and increments count for an existing key within limit', async () => {
      const resetAt = 1000060000;
      vi.spyOn(Date, 'now').mockReturnValue(1000000000);

      vi.mocked(kv.get).mockResolvedValueOnce({ count: 5, resetAt });

      const result = await checkRateLimit('existing-key', 20, 60000);

      expect(kv.get).toHaveBeenCalledWith('ratelimit:existing-key');
      expect(kv.set).toHaveBeenCalledWith(
        'ratelimit:existing-key',
        { count: 6, resetAt },
        { ex: 60 }
      );
      expect(result).toEqual({
        ok: true,
        limit: 20,
        remaining: 14,
        resetAt
      });

      vi.restoreAllMocks();
    });

    it('returns failure when limit is exceeded', async () => {
      const resetAt = 1000060000;
      vi.spyOn(Date, 'now').mockReturnValue(1000000000);

      vi.mocked(kv.get).mockResolvedValueOnce({ count: 20, resetAt });

      const result = await checkRateLimit('exceeded-key', 20, 60000);

      expect(kv.get).toHaveBeenCalledWith('ratelimit:exceeded-key');
      expect(kv.set).not.toHaveBeenCalled();
      expect(result).toEqual({
        ok: false,
        limit: 20,
        remaining: 0,
        resetAt
      });

      vi.restoreAllMocks();
    });

    it('resets count if previous window has expired', async () => {
      const pastResetAt = 900000000;
      const now = 1000000000;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      vi.mocked(kv.get).mockResolvedValueOnce({ count: 20, resetAt: pastResetAt });

      const result = await checkRateLimit('expired-key', 20, 60000);

      expect(kv.get).toHaveBeenCalledWith('ratelimit:expired-key');
      expect(kv.set).toHaveBeenCalledWith(
        'ratelimit:expired-key',
        { count: 1, resetAt: now + 60000 },
        { ex: 60 }
      );
      expect(result).toEqual({
        ok: true,
        limit: 20,
        remaining: 19,
        resetAt: now + 60000
      });

      vi.restoreAllMocks();
    });
  });

  describe('getClientIp', () => {
    it('extracts IP from x-forwarded-for header', () => {
      const request = new Request('https://example.com', {
        headers: {
          'x-forwarded-for': '203.0.113.195, 203.0.113.1'
        }
      });
      expect(getClientIp(request)).toBe('203.0.113.195');
    });

    it('extracts IP from x-real-ip header if x-forwarded-for is missing', () => {
      const request = new Request('https://example.com', {
        headers: {
          'x-real-ip': '203.0.113.195'
        }
      });
      expect(getClientIp(request)).toBe('203.0.113.195');
    });

    it('returns unknown if neither header is present', () => {
      const request = new Request('https://example.com');
      expect(getClientIp(request)).toBe('unknown');
    });
  });
});
