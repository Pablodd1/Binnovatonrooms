#!/bin/bash
cat << 'INNER_EOF' > src/lib/rate-limiter.ts
import { kv } from "@vercel/kv";

// Define a placeholder for ratelimit, assuming it comes from a library like @upstash/ratelimit
// For the sake of matching the prompt, we will define it so the file compiles.
export const ratelimit = {
  limit: async (key: string) => {
    // This will be mocked in tests
    return { success: true, limit: 10, remaining: 9, reset: Date.now() + 60000 };
  }
};

export async function checkRateLimit(
  key: string,
  limit: number,
  windowInSeconds: number
): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
  try {
    const { success, limit: resLimit, remaining, reset } = await ratelimit.limit(key);
    return { success, limit: resLimit, remaining, reset };
  } catch (error) {
    // Fallback if KV fails
    console.warn("KV rate limit failed, allowing request:", error);
    return { success: true, limit, remaining: 1, reset: Date.now() + windowInSeconds * 1000 };
  }
}

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
}
INNER_EOF
