export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

async function checkRateLimitWithKv(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  // Dynamic import so the module doesn't crash when @vercel/kv is unavailable (local dev)
  const { kv } = await import("@vercel/kv");

  const now = Date.now();
  const windowSec = Math.ceil(windowMs / 1000);
  const redisKey = `ratelimit:${key}`;

  const current = await kv.get<{ count: number; resetAt: number }>(redisKey);

  if (!current || current.resetAt <= now) {
    const resetAt = now + windowMs;
    await kv.set(redisKey, { count: 1, resetAt }, { ex: windowSec });
    return { ok: true, remaining: limit - 1, resetAt, limit };
  }

  if (current.count >= limit) {
    return { ok: false, remaining: 0, resetAt: current.resetAt, limit };
  }

  const newCount = current.count + 1;
  await kv.set(redisKey, { count: newCount, resetAt: current.resetAt }, { ex: windowSec });
  return { ok: true, remaining: Math.max(0, limit - newCount), resetAt: current.resetAt, limit };
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  // If Vercel KV is not configured, skip rate limiting (local dev fallback)
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return { ok: true, remaining: Infinity, resetAt: 0, limit: Infinity };
  }

  try {
    return await checkRateLimitWithKv(key, limit, windowMs);
  } catch (error) {
    // If KV is misconfigured or unavailable, allow the request rather than crashing
    console.error("Rate limiter unavailable, allowing request:", error);
    return { ok: true, remaining: Infinity, resetAt: 0, limit: Infinity };
  }
}

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
}
