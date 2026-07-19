export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

/** Sentinel used when rate limiting is disabled (dev mode). Avoids Infinity which
 *  serializes to an invalid HTTP header value in X-RateLimit-Remaining. */
const UNLIMITED = Number.MAX_SAFE_INTEGER;

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
  const isProduction = process.env.NODE_ENV === "production";
  const kvConfigured = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN;
  // Explicit opt-out for self-hosted deployments without Vercel KV
  const explicitlyDisabled = process.env.RATE_LIMIT_DISABLED === "1" ||
    process.env.RATE_LIMIT_DISABLED === "true";

  // Explicit disable always wins (escape hatch for self-hosted)
  if (explicitlyDisabled) {
    return { ok: true, remaining: UNLIMITED, resetAt: 0, limit: UNLIMITED };
  }

  // If Vercel KV is not configured:
  // - In production, FAIL CLOSED (deny) to prevent abuse of expensive endpoints
  // - In development, allow (no KV needed for local dev)
  if (!kvConfigured) {
    if (isProduction) {
      console.error("Rate limiter KV not configured in production — denying request. Set KV_REST_API_URL and KV_REST_API_TOKEN, or RATE_LIMIT_DISABLED=1 to bypass.");
      return { ok: false, remaining: 0, resetAt: Date.now() + windowMs, limit };
    }
    return { ok: true, remaining: UNLIMITED, resetAt: 0, limit: UNLIMITED };
  }

  try {
    return await checkRateLimitWithKv(key, limit, windowMs);
  } catch (error) {
    console.error("Rate limiter error:", error);
    // In production, fail closed on KV errors; in dev, allow
    if (isProduction) {
      return { ok: false, remaining: 0, resetAt: Date.now() + windowMs, limit };
    }
    return { ok: true, remaining: UNLIMITED, resetAt: 0, limit: UNLIMITED };
  }
}

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
}
