import type { GoogleGenAI, GenerateContentConfig, ContentListUnion } from "@google/genai";
import { setTimeout as delay } from "node:timers/promises";

export const ANALYSIS_BUDGET_MS = 45_000;

/** Retries share a deadline. Invalid credentials/requests are never retried. */
export async function generateDiagnosis(client: GoogleGenAI, model: string,
  contents: ContentListUnion, config: GenerateContentConfig,
  signal: AbortSignal, deadline: number): Promise<{ raw: string; durationMs: number }> {
  const started = Date.now();
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new DOMException("Analysis deadline exceeded", "TimeoutError");
    const timeout = AbortSignal.timeout(Math.max(1, Math.min(30_000, remaining)));
    const abortSignal = AbortSignal.any([signal, timeout]);
    try {
      const response = await client.models.generateContent({
        model, contents, config: { ...config, abortSignal },
      });
      const raw = response.text || "";
      if (!raw) throw new Error("AI returned an empty diagnosis");
      return { raw, durationMs: Date.now() - started };
    } catch (error) {
      // Cancellation may still consume provider tokens; never repeat an aborted call.
      if (abortSignal.aborted) throw abortSignal.reason;
      const status = Number((error as { status?: unknown })?.status);
      if (attempt >= 1 || ![429, 500, 502, 503, 504].includes(status) ||
          deadline - Date.now() < 5_000) throw error;
      await delay(500, undefined, { signal });
    }
  }
}
