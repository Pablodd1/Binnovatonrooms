export type RuntimeHealth = {
  geminiKeyConfigured: boolean;
  kvConfigured: boolean;
  isDevelopment: boolean;
};

export function getRuntimeHealth(): RuntimeHealth {
  const isDev = process.env.NODE_ENV !== "production";
  const geminiKey = !!process.env.GEMINI_API_KEY;
  const kvRestApi = !!process.env.KV_REST_API_URL;
  const kvRestToken = !!process.env.KV_REST_API_TOKEN;

  return {
    geminiKeyConfigured: geminiKey,
    kvConfigured: kvRestApi && kvRestToken,
    isDevelopment: isDev,
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
