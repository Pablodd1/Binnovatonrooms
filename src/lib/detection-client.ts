import { z } from "zod";
import { logger } from "./logger";

const DETECTION_SERVICE_URL = process.env.DETECTION_SERVICE_URL;

export type DetectionResult = {
  image_index?: number;
  defect_type: string;
  confidence: number;
  x_center: number;
  y_center: number;
  width: number;
  height: number;
  class_id: number;
};

export type DepthResult = {
  width: number;
  height: number;
  min_depth: number;
  max_depth: number;
  mean_depth: number;
};

export type DetectionResponse = {
  detections: DetectionResult[];
  depth: DepthResult | null;
  processing_time_ms: number;
  device: string;
  model_versions: Record<string, string>;
};

export type BatchDetectionResponse = {
  detections: DetectionResult[];
  depths: DepthResult[];
  processing_time_ms: number;
  image_count: number;
  device: string;
};

const detectionSchema = z.object({
  defect_type: z.string(), confidence: z.number().min(0).max(1),
  x_center: z.number().min(0).max(1), y_center: z.number().min(0).max(1),
  width: z.number().positive().max(1), height: z.number().positive().max(1),
  class_id: z.number().int(), image_index: z.number().int().min(1).max(6).optional(),
});
const depthSchema = z.object({ width: z.number(), height: z.number(),
  min_depth: z.number(), max_depth: z.number(), mean_depth: z.number() });

export function parseBatchDetection(value: unknown, imageCount: number): BatchDetectionResponse {
  const result = z.object({
    detections: z.array(detectionSchema).max(1000), depths: z.array(depthSchema),
    processing_time_ms: z.number(), image_count: z.number().int(), device: z.string(),
  }).parse(value);
  // Old detector services omit image IDs: accept those boxes only for a single image.
  result.detections = result.detections
    .map(det => ({ ...det, image_index: det.image_index ?? (imageCount === 1 ? 1 : undefined) }))
    .filter(det => det.image_index != null && det.image_index <= imageCount);
  return result;
}

export async function detectDefects(
  imageBuffer: Buffer,
  mimeType: string,
  options: {
    confidence?: number;
    useSahi?: boolean;
    includeDepth?: boolean;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {}
): Promise<DetectionResponse | null> {
  if (!DETECTION_SERVICE_URL) return null;
  const { confidence = 0.25, useSahi = true, includeDepth = true } = options;

  try {
    const formData = new FormData();
    const extension = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
    const uint8 = new Uint8Array(imageBuffer);
    const blob = new Blob([uint8], { type: mimeType });
    formData.append("file", blob, `image.${extension}`);
    formData.append("confidence", String(confidence));
    formData.append("use_sahi", String(useSahi));
    formData.append("include_depth", String(includeDepth));

    const response = await fetch(`${DETECTION_SERVICE_URL}/detect`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, "Detection service returned error");
      return null;
    }

    return await response.json();
  } catch (error) {
    logger.warn({ error: error instanceof Error ? error.message : "Unknown" }, "Detection service unavailable");
    return null;
  }
}

export async function detectDefectsBatch(
  images: Array<{ buffer: Buffer; mimeType: string }>,
  options: {
    confidence?: number;
    useSahi?: boolean;
    includeDepth?: boolean;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {}
): Promise<BatchDetectionResponse | null> {
  if (!DETECTION_SERVICE_URL) return null;
  const { confidence = 0.25, useSahi = true, includeDepth = true } = options;

  try {
    const formData = new FormData();
    for (const image of images.slice(0, 6)) {
      const extension = image.mimeType.includes("png") ? "png" : image.mimeType.includes("webp") ? "webp" : "jpg";
      const uint8 = new Uint8Array(image.buffer);
      const blob = new Blob([uint8], { type: image.mimeType });
      formData.append("files", blob, `image.${extension}`);
    }
    formData.append("confidence", String(confidence));
    formData.append("use_sahi", String(useSahi));
    formData.append("include_depth", String(includeDepth));

    const response = await fetch(`${DETECTION_SERVICE_URL}/detect-batch`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.any([AbortSignal.timeout(options.timeoutMs ?? 8_000),
        ...(options.signal ? [options.signal] : [])]),
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, "Batch detection service returned error");
      return null;
    }

    return parseBatchDetection(await response.json(), images.length);
  } catch (error) {
    logger.warn({ error: error instanceof Error ? error.message : "Unknown" }, "Batch detection service unavailable");
    return null;
  }
}

export function detectionToEvidenceMarkers(
  detections: DetectionResult[],
  imageWidth: number,
  imageHeight: number
): Array<{
  image_index?: number;
  label: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  return detections.map((det) => ({
    image_index: det.image_index,
    label: `${det.defect_type} (${Math.round(det.confidence * 100)}%)`,
    confidence: det.confidence,
    x: Math.max(0, Math.min(100, Math.round((det.x_center - det.width / 2) * 100))),
    y: Math.max(0, Math.min(100, Math.round((det.y_center - det.height / 2) * 100))),
    width: Math.max(1, Math.min(100, Math.round(det.width * 100))),
    height: Math.max(1, Math.min(100, Math.round(det.height * 100))),
  }));
}

export function detectionSummary(detections: DetectionResult[]): {
  totalDefects: number;
  defectTypes: Record<string, number>;
  avgConfidence: number;
  highConfidenceCount: number;
  spatialCoverage: number;
} {
  const defectTypes: Record<string, number> = {};
  let totalConfidence = 0;

  for (const det of detections) {
    defectTypes[det.defect_type] = (defectTypes[det.defect_type] || 0) + 1;
    totalConfidence += det.confidence;
  }

  const totalDefects = detections.length;
  const avgConfidence = totalDefects > 0 ? totalConfidence / totalDefects : 0;
  const highConfidenceCount = detections.filter((d) => d.confidence >= 0.7).length;

  let totalArea = 0;
  for (const det of detections) {
    totalArea += det.width * det.height;
  }
  const spatialCoverage = Math.min(1, totalArea);

  return {
    totalDefects,
    defectTypes,
    avgConfidence: Math.round(avgConfidence * 1000) / 1000,
    highConfidenceCount,
    spatialCoverage: Math.round(spatialCoverage * 1000) / 1000,
  };
}

export function depthToMeasurementContext(depth: DepthResult | null): string {
  if (!depth) return "No depth data available.";

  const depthRange = depth.max_depth - depth.min_depth;
  const relativeDepthVariation = depth.mean_depth > 0 ? depthRange / depth.mean_depth : 0;

  if (relativeDepthVariation > 0.5) {
    return `Significant depth variation detected (range: ${depthRange.toFixed(2)}). Surface may have uneven geometry, protrusions, or recesses.`;
  }
  if (relativeDepthVariation > 0.2) {
    return `Moderate depth variation (range: ${depthRange.toFixed(2)}). Some surface unevenness detected.`;
  }
  return `Relatively flat surface (range: ${depthRange.toFixed(2)}). Depth variation is minimal.`;
}