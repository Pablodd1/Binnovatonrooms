import { kv } from "@vercel/kv";

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
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

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
}