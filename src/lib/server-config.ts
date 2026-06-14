export type RuntimeHealth = {
  openaiConfigured: boolean;
  supabaseConfigured: boolean;
  storageConfigured: boolean;
  model: string;
  missing: string[];
};

export function getRuntimeHealth(): RuntimeHealth {
  const missing: string[] = [];
  const model = process.env.OPENAI_MODEL || "gpt-5.5";

  if (!process.env.OPENAI_API_KEY) missing.push("OPENAI_API_KEY");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!process.env.SUPABASE_BUCKET) missing.push("SUPABASE_BUCKET");

  return {
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    supabaseConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    storageConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_BUCKET),
    model,
    missing
  };
}

export function requireOpenAIConfig() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY. Add it in Vercel Project Settings.");
  }

  return {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || "gpt-5.5"
  };
}
