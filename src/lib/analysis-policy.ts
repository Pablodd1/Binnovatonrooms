import type { DetailLevel, InspectionDiagnosis } from "./analysis-schema";
import { diagnosisSchema } from "./validation";

/** Detail is a user choice, never inferred from free-text notes or photo count. */
export function selectDetailLevel(value: unknown): DetailLevel {
  return value === "detailed" || value === "forensic" ? value : "standard";
}

export function shouldReview(detail: DetailLevel, remainingMs: number): boolean {
  return detail === "forensic" && remainingMs >= 12_000;
}

/** Validate provider output at the trust boundary, including photo ownership. */
export function parseDiagnosis(raw: string, imageCount: number): InspectionDiagnosis {
  const diagnosis = diagnosisSchema.parse(JSON.parse(raw));
  if (!diagnosis.outcome) throw new Error("Missing inspection outcome");
  if (diagnosis.outcome === "defect_detected" && diagnosis.evidencia_visual.length === 0) {
    throw new Error("A defect diagnosis requires observable evidence");
  }
  for (const marker of diagnosis.visual_indicators) {
    if (!marker.image_index || marker.image_index > imageCount) {
      throw new Error("Evidence marker refers to an unknown image");
    }
  }
  if (diagnosis.outcome !== "defect_detected" && diagnosis.visual_indicators.length > 0) {
    throw new Error("Non-defect outcome cannot contain defect markers");
  }
  if (diagnosis.outcome === "no_visible_defect" &&
      (diagnosis.riesgos.length > 0 || diagnosis.severidad !== "baja")) {
    throw new Error("Clean inspection contradicts its risks or severity");
  }
  if (diagnosis.outcome === "insufficient_evidence" || diagnosis.confianza < 0.7 ||
      diagnosis.severidad === "alta" || diagnosis.severidad === "critica") {
    diagnosis.requiere_revision_humana = true;
  }
  return diagnosis;
}
