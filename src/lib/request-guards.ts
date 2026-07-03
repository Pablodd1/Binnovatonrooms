import { checkRateLimit as kvCheckRateLimit, getClientIp as kvGetClientIp } from "./rate-limiter";
import { validateRequest, analyzeRequestSchema, installersMatchRequestSchema } from "./validation";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_IMAGE_BYTES = 30 * 1024 * 1024;
export const MAX_ANALYSIS_IMAGES = 6;
export const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function getClientIp(request: Request): string {
  return kvGetClientIp(request);
}

export async function checkRateLimit(key: string, limit: number, windowMs: number) {
  return kvCheckRateLimit(key, limit, windowMs);
}

export function sanitizeText(value: FormDataEntryValue | null, fallback = "", maxLength = 500): string {
  if (typeof value !== "string") return fallback;
  return value
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function validateImageFile(file: File): string | null {
  if (file.size <= 0) return "Image is empty.";
  if (file.size > MAX_IMAGE_BYTES) return "Image is too large. Keep captures under 10MB.";
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return "Unsupported image type. Use JPEG, PNG, or WebP.";
  }
  return null;
}

export function imageExtension(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

export function numberOrNull(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function boundedCoordinate(value: number | null, min: number, max: number): number | null {
  if (value === null) return null;
  if (value < min || value > max) return null;
  return value;
}

export function isUploadedImage(entry: FormDataEntryValue | null): entry is File {
  if (!entry || typeof entry !== "object") return false;
  const candidate = entry as File;
  return (
    typeof candidate.arrayBuffer === "function" &&
    typeof candidate.size === "number" &&
    typeof candidate.type === "string"
  );
}

export function validateAnalyzeFormData(formData: FormData) {
  const data = {
    cameraLabel: formData.get("cameraLabel"),
    locationLabel: formData.get("locationLabel"),
    lidarNotes: formData.get("lidarNotes"),
    qualityNotes: formData.get("qualityNotes"),
    lat: formData.get("lat"),
    lng: formData.get("lng"),
  };
  return validateRequest(analyzeRequestSchema, data);
}

export function validateInstallersMatchBody(body: unknown) {
  return validateRequest(installersMatchRequestSchema, body);
}