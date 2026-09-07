import { describe, it, expect } from "vitest";
import { parseDiagnosis, selectDetailLevel, shouldReview } from "@/lib/analysis-policy";
import { markersForImage, containImage } from "@/lib/evidence";
import { validateImageSet, MAX_TOTAL_UPLOAD_BYTES } from "@/lib/image-limits";

export const diagnosisFixture = {
  outcome: "defect_detected", tipo_defecto: "grieta", severidad: "media",
  ubicacion: "Foto 1", causa_probable: "Fisura visible; causa no confirmada",
  solucion_paso_a_paso: ["Verificar con un especialista"], urgencia_dias: 7,
  especialista_requerido: "estructurista", mediciones_recomendadas: ["Medir con escala"],
  riesgos: [], confianza: 0.8, evidencia_visual: ["Linea visible"],
  visual_indicators: [{ image_index: 1, label: "Fisura", confidence: 0.8,
    x: 10, y: 20, width: 30, height: 40 }], requiere_revision_humana: false,
};

describe("analysis evidence policy", () => {
  it("defaults to one-pass standard, ignoring old free-text quality hints", () => {
    expect(selectDetailLevel("R/mala: P 0" )).toBe("standard");
    expect(selectDetailLevel(null)).toBe("standard");
    expect(shouldReview("detailed", 40_000)).toBe(false);
    expect(shouldReview("forensic", 11_000)).toBe(false);
    expect(shouldReview("forensic", 12_000)).toBe(true);
  });
  it("accepts explicit clean inspections with no invented repairs or boxes", () => {
    const clean = { ...diagnosisFixture, outcome: "no_visible_defect", tipo_defecto: "otro",
      severidad: "baja", visual_indicators: [], solucion_paso_a_paso: [] };
    expect(parseDiagnosis(JSON.stringify(clean), 1).visual_indicators).toEqual([]);
    expect(() => parseDiagnosis(JSON.stringify({ ...clean, riesgos: ["Immediate danger"] }), 1)).toThrow();
  });
  it("rejects malformed JSON and missing fields", () => {
    expect(() => parseDiagnosis("{", 1)).toThrow();
    expect(() => parseDiagnosis("{}", 1)).toThrow();
  });
  it("rejects out-of-photo boxes and unknown photo IDs", () => {
    for (const changes of [{ x: 95 }, { image_index: 2 }, { image_index: undefined }]) {
      const diag = { ...diagnosisFixture, visual_indicators: [{ ...diagnosisFixture.visual_indicators[0], ...changes }] };
      expect(() => parseDiagnosis(JSON.stringify(diag), 1)).toThrow();
    }
  });
  it("requires review on weak evidence and high severity without boosting confidence", () => {
    for (const changes of [{ confianza: 0.4 }, { severidad: "alta" }]) {
      const diag = parseDiagnosis(JSON.stringify({ ...diagnosisFixture, ...changes }), 1);
      expect(diag.requiere_revision_humana).toBe(true);
      expect(diag.confianza).toBe(changes.confianza ?? 0.8);
    }
  });
  it("does not move markers between photos or guess legacy multi-photo evidence", () => {
    const diag = parseDiagnosis(JSON.stringify(diagnosisFixture), 2);
    expect(markersForImage(diag, 1, 2)).toHaveLength(1);
    expect(markersForImage(diag, 2, 2)).toEqual([]);
    delete diag.visual_indicators[0].image_index;
    expect(markersForImage(diag, 1, 2)).toEqual([]);
    expect(markersForImage(diag, 1, 1)).toHaveLength(1);
  });
  it("fits uncropped landscape and portrait evidence into a phone viewport", () => {
    expect(containImage(390, 600, 1200, 600)).toEqual({ width: 390, height: 195 });
    expect(containImage(390, 600, 600, 1200)).toEqual({ width: 300, height: 600 });
  });
  it("checks the whole upload budget without modifying original images", () => {
    const file = { size: 2_000_000, type: "image/jpeg" };
    expect(validateImageSet([file, file])).toBeNull();
    expect(validateImageSet([file, file, file])).toContain("4 MB");
    expect(validateImageSet([{ ...file, size: MAX_TOTAL_UPLOAD_BYTES + 1 }])).toContain("4 MB");
    expect(validateImageSet([{ ...file, type: "image/svg+xml" }])).toContain("JPEG");
    expect(validateImageSet([])).not.toBeNull();
  });
});
