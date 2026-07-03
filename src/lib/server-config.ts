export type RuntimeHealth = {
  geminiConfigured: boolean;
  supabaseConfigured: boolean;
  storageConfigured: boolean;
  model: string;
  missing: string[];
};

export function getRuntimeHealth(): RuntimeHealth {
  const missing: string[] = [];
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";

  if (!process.env.GEMINI_API_KEY) missing.push("GEMINI_API_KEY");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!process.env.SUPABASE_BUCKET) missing.push("SUPABASE_BUCKET");

  return {
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    supabaseConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    storageConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_BUCKET),
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
    model: process.env.GEMINI_MODEL || "gemini-3.5-flash"
  };
}
