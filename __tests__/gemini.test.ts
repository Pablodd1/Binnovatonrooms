import { describe, it, expect, vi } from "vitest";
import type { GoogleGenAI } from "@google/genai";
import { generateDiagnosis } from "@/lib/gemini";

function clientWith(generateContent: ReturnType<typeof vi.fn>) {
  return { models: { generateContent } } as unknown as GoogleGenAI;
}

describe("bounded Gemini calls", () => {
  it("passes cancellation to the SDK and never retries invalid credentials", async () => {
    const generate = vi.fn().mockRejectedValue({ status: 403 });
    await expect(generateDiagnosis(clientWith(generate), "test", "photo", {},
      new AbortController().signal, Date.now() + 10_000)).rejects.toEqual({ status: 403 });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0].config.abortSignal).toBeInstanceOf(AbortSignal);
  });
  it("retries a transient failure once within the shared deadline", async () => {
    const generate = vi.fn().mockRejectedValueOnce({ status: 503 }).mockResolvedValue({ text: "{}" });
    expect((await generateDiagnosis(clientWith(generate), "test", "photo", {},
      new AbortController().signal, Date.now() + 10_000)).raw).toBe("{}");
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it("does not start a call after the deadline", async () => {
    const generate = vi.fn();
    await expect(generateDiagnosis(clientWith(generate), "test", "photo", {},
      new AbortController().signal, Date.now() - 1)).rejects.toThrow("deadline");
    expect(generate).not.toHaveBeenCalled();
  });
  it("cancels a hanging provider call at the deadline without retrying it", async () => {
    const generate = vi.fn(({ config }) => new Promise((_, reject) => {
      config.abortSignal.addEventListener("abort", () => reject(config.abortSignal.reason), { once: true });
    }));
    await expect(generateDiagnosis(clientWith(generate), "test", "photo", {},
      new AbortController().signal, Date.now() + 30)).rejects.toHaveProperty("name", "TimeoutError");
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
