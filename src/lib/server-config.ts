export type RuntimeHealth = {
  geminiConfigured: boolean;
  supabaseConfigured: boolean;
  storageConfigured: boolean;
  authConfigured: boolean;
  model: string;
  missing: string[];
};

export function getRuntimeHealth(): RuntimeHealth {
  const missing: string[] = [];
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  if (!process.env.GEMINI_API_KEY) missing.push("GEMINI_API_KEY");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!process.env.SUPABASE_BUCKET) missing.push("SUPABASE_BUCKET");
  // AUTH_SECRET required in production for NextAuth JWT signing
  if (process.env.NODE_ENV === "production" && !process.env.AUTH_SECRET) {
    missing.push("AUTH_SECRET");
  }

  return {
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    supabaseConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    storageConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_BUCKET),
    authConfigured: Boolean(process.env.AUTH_SECRET) || process.env.NODE_ENV !== "production",
    model,
    missing
  };
}

export function requireGeminiConfig() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY. Add it in Vercel Project Settings.");
  }

  return {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash"
  };
}

/** Throws if AUTH_SECRET is missing in production (NextAuth needs it for JWT signing). */
export function requireAuthSecret() {
  if (process.env.NODE_ENV === "production" && !process.env.AUTH_SECRET) {
    throw new Error("Missing AUTH_SECRET. Required in production for secure JWT sessions.");
  }
}

/**
 * Validate all required environment variables at server boot in production.
 * Called from instrumentation.ts so the app fails fast instead of producing
 * cryptic per-request errors. In non-production environments this is a no-op.
 */
export function validateProductionEnv() {
  if (process.env.NODE_ENV !== "production") return;

  const missing: string[] = [];
  if (!process.env.AUTH_SECRET) missing.push("AUTH_SECRET");
  if (!process.env.GEMINI_API_KEY) missing.push("GEMINI_API_KEY");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!process.env.SUPABASE_BUCKET) missing.push("SUPABASE_BUCKET");
  if (!process.env.NEXT_PUBLIC_APP_URL) missing.push("NEXT_PUBLIC_APP_URL");

  if (missing.length > 0) {
    throw new Error(
      `Missing required production environment variables: ${missing.join(", ")}. ` +
      `Add them in your deployment dashboard (Vercel Project Settings → Environment Variables).`
    );
  }
}
