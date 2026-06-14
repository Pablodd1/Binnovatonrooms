const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
}

export function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = rateBuckets.get(key);

  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (current.count >= limit) {
    return { ok: false, remaining: 0, resetAt: current.resetAt };
  }

  current.count += 1;
  return { ok: true, remaining: Math.max(0, limit - current.count), resetAt: current.resetAt };
}

export function sanitizeText(value: FormDataEntryValue | null, fallback = "", maxLength = 500) {
  if (typeof value !== "string") return fallback;
  return value
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function validateImageFile(file: File) {
  if (file.size <= 0) return "Image is empty.";
  if (file.size > MAX_IMAGE_BYTES) return "Image is too large. Keep captures under 10MB.";
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return "Unsupported image type. Use JPEG, PNG, or WebP.";
  }
  return null;
}

export function imageExtension(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}
