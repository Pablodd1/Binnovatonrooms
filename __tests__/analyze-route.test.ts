import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generate: vi.fn(), detect: vi.fn(), match: vi.fn() }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class { models = { generateContent: mocks.generate }; },
  MediaResolution: { MEDIA_RESOLUTION_HIGH: "MEDIA_RESOLUTION_HIGH" },
}));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/server-config", () => ({ requireGeminiConfig: () => ({ apiKey: "test", model: "test-model" }) }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => null }));
vi.mock("@/lib/installer-match", () => ({ matchInstallers: mocks.match }));
vi.mock("@/lib/detection-client", () => ({ detectDefectsBatch: mocks.detect }));
vi.mock("@/lib/rate-limiter", () => ({ checkRateLimit: async () => ({ ok: true }), getClientIp: () => "test" }));
vi.mock("@/lib/logger", () => {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { logger: log, createRequestLogger: () => log, generateRequestId: () => "test" };
});
import { POST } from "@/app/api/analyze/route";

const fixture = {
  outcome: "defect_detected", tipo_defecto: "grieta", severidad: "media", ubicacion: "Foto 1",
  causa_probable: "Causa no confirmada", solucion_paso_a_paso: [], urgencia_dias: 7,
  especialista_requerido: "estructurista", mediciones_recomendadas: [], riesgos: [],
  confianza: 0.8, evidencia_visual: ["Linea visible"], requiere_revision_humana: false,
  visual_indicators: [{ image_index: 1, label: "Fisura", confidence: 0.8, x: 10, y: 10, width: 20, height: 20 }],
};
function request(detailLevel?: string, count = 2) {
  const body = new FormData();
  for (let i = 0; i < count; i++) body.append(i ? "images" : "image",
    new File(["synthetic image fixture"], `image-${i}.jpg`, { type: "image/jpeg" }));
  body.set("qualityNotes", "R/mala. P 0");
  if (detailLevel) body.set("detailLevel", detailLevel);
  return new Request("http://localhost/api/analyze", { method: "POST", body });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.generate.mockReset().mockResolvedValue({ text: JSON.stringify(fixture) });
  mocks.detect.mockResolvedValue(null);
  mocks.match.mockResolvedValue([]);
});

describe("analysis route", () => {
  it("uses one AI pass and no optional detector on the default two-photo flow", async () => {
    const response = await POST(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.detect).not.toHaveBeenCalled();
    expect(body.diagnosis.analysis_metadata.analysis_pass).toBe(1);
    expect(body.saved).toBe(false);
    expect(body.warnings.join(" ")).toContain("no se guardo");
    const call = mocks.generate.mock.calls[0][0];
    expect(call.config.systemInstruction).toContain("evidencia observable");
    expect(call.contents.filter((p: { text?: string }) => p.text?.startsWith("Foto "))).toHaveLength(2);
  });
  it("can retract a first-pass finding instead of unioning contradictory diagnoses", async () => {
    const revised = { ...fixture, outcome: "no_visible_defect", tipo_defecto: "otro",
      severidad: "baja", confianza: 0.6, evidencia_visual: [], visual_indicators: [] };
    mocks.generate.mockResolvedValueOnce({ text: JSON.stringify(fixture) })
      .mockResolvedValueOnce({ text: JSON.stringify(revised) });
    const body = await (await POST(request("forensic"))).json();
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(body.diagnosis.outcome).toBe("no_visible_defect");
    expect(body.diagnosis.confianza).toBe(0.6);
    expect(body.diagnosis.visual_indicators).toEqual([]);
    expect(body.diagnosis.analysis_metadata.analysis_pass).toBe(2);
    expect(mocks.match).not.toHaveBeenCalled();
  });
  it("preserves a valid first pass when second-pass JSON is malformed", async () => {
    mocks.generate.mockResolvedValueOnce({ text: JSON.stringify(fixture) }).mockResolvedValueOnce({ text: "{}" });
    const body = await (await POST(request("forensic"))).json();
    expect(body.diagnosis.outcome).toBe("defect_detected");
    expect(body.diagnosis.analysis_metadata.analysis_pass).toBe(1);
    expect(body.warnings.join(" ")).toContain("segunda revision no se completo");
  });
  it("rejects malformed first-pass output instead of saving it", async () => {
    mocks.generate.mockResolvedValue({ text: "{}" });
    expect((await POST(request())).status).toBe(502);
    expect(mocks.match).not.toHaveBeenCalled();
  });
  it("does not inflate severity or confidence using detector counts", async () => {
    mocks.detect.mockResolvedValue({ detections: Array(5).fill({ confidence: 0.99 }), depths: [], device: "test" });
    const body = await (await POST(request("forensic"))).json();
    expect(body.diagnosis.confianza).toBe(0.8);
    expect(body.diagnosis.severidad).toBe("media");
  });
  it("rejects an oversized image set before any paid API call", async () => {
    const body = new FormData();
    body.append("image", new File([new Uint8Array(4_000_001)], "large.jpg", { type: "image/jpeg" }));
    expect((await POST(new Request("http://localhost/api/analyze", { method: "POST", body }))).status).toBe(413);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
