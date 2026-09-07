import type { InspectionDiagnosis } from "./analysis-schema";

/** Legacy multi-photo reports without IDs must never guess the source photo. */
export function markersForImage(diagnosis: InspectionDiagnosis | null | undefined,
  imageIndex: number, imageCount: number) {
  return (diagnosis?.visual_indicators || []).filter(marker =>
    marker.image_index === imageIndex ||
    (marker.image_index == null && imageCount === 1 && imageIndex === 1));
}

export function containImage(containerWidth: number, containerHeight: number,
  imageWidth: number, imageHeight: number) {
  const scale = Math.min(containerWidth / imageWidth, containerHeight / imageHeight);
  return { width: imageWidth * scale, height: imageHeight * scale };
}

export function diagnosisTitle(diagnosis: InspectionDiagnosis) {
  if (diagnosis.outcome === "no_visible_defect") return "Sin defectos visibles";
  if (diagnosis.outcome === "insufficient_evidence") return "Evidencia insuficiente";
  return diagnosis.tipo_defecto;
}
