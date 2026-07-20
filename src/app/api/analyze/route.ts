import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { inspectionJsonSchema, type InspectionDiagnosis, type DetailLevel } from "@/lib/analysis-schema";
import { matchInstallers } from "@/lib/installer-match";
import {
  checkRateLimit,
  getClientIp,
  imageExtension,
  sanitizeText,
  validateImageFile,
  isUploadedImage,
  numberOrNull,
  boundedCoordinate,
  MAX_ANALYSIS_IMAGES,
  MAX_TOTAL_IMAGE_BYTES,
} from "@/lib/request-guards";
import { requireGeminiConfig } from "@/lib/server-config";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { buildUserPrompt, buildFollowUpPrompt, SYSTEM_PROMPT } from "@/lib/vision-prompt";
import { auth } from "@/lib/auth";
import { createRequestLogger, generateRequestId, logger } from "@/lib/logger";
import {
  detectDefectsBatch,
  detectionToEvidenceMarkers,
  detectionSummary,
  depthToMeasurementContext,
  type DetectionResult,
  type DepthResult,
} from "@/lib/detection-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GEMINI_TIMEOUT_MS = 45_000;
const GEMINI_RETRY_COUNT = 2;
const GEMINI_RETRY_DELAY_MS = 2_000;
const DETAIL_LEVELS: DetailLevel[] = ["standard", "detailed", "forensic"];

async function fileToGeminiPart(file: File) {
  const bytes = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "image/jpeg";
  return {
    part: {
      inlineData: {
        mimeType,
        data: bytes.toString("base64"),
      },
    },
    bytes,
    mimeType,
  };
}

async function storeImage(bytes: Buffer, mimeType: string) {
  const supabase = getSupabaseAdmin();
  const bucket = process.env.SUPABASE_BUCKET;
  if (!supabase || !bucket) return null;

  const extension = imageExtension(mimeType);
  const path = `inspections/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType: mimeType,
    upsert: false,
  });

  if (error) {
    logger.error({ error: error.message, path }, "Image upload failed");
    return null;
  }

  const useSignedUrls = process.env.SUPABASE_SIGNED_URLS === "true";
  if (useSignedUrls) {
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 86400);
    return data?.signedUrl || null;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

async function saveReport(input: {
  diagnosis: InspectionDiagnosis;
  imageUrl: string | null;
  images: Array<{
    url: string | null;
    mimeType: string;
    sizeBytes: number;
    quality: unknown;
  }>;
  cameraLabel: string;
  locationLabel: string;
  lat: number | null;
  lng: number | null;
  quality: unknown;
  userId: string | undefined;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  // Compute initial workflow status from severity
  const needsReview = input.diagnosis.requiere_revision_humana
    || ["critica", "alta"].includes(input.diagnosis.severidad);
  const initialStatus = input.diagnosis.severidad === "critica"
    ? "asignar"
    : needsReview
      ? "revision"
      : "nuevo";

  const { data, error } = await supabase
    .from("reportes")
    .insert({
      tipo_defecto: input.diagnosis.tipo_defecto,
      severidad: input.diagnosis.severidad,
      especialista_requerido: input.diagnosis.especialista_requerido,
      diagnostico: input.diagnosis,
      image_url: input.imageUrl,
      camera_label: input.cameraLabel,
      location_label: input.locationLabel,
      lat: input.lat,
      lng: input.lng,
      quality: input.quality,
      user_id: input.userId || null,
      status: initialStatus,
    })
    .select("id")
    .single();

  if (error) {
    logger.error({ error: error.message }, "Report save failed");
    return null;
  }

  const reportId = data?.id ?? null;

  if (reportId && input.images.length > 0) {
    const { error: imagesError } = await supabase.from("report_images").insert(
      input.images.map((image, index) => ({
        report_id: reportId,
        sort_order: index + 1,
        image_url: image.url,
        mime_type: image.mimeType,
        size_bytes: image.sizeBytes,
        quality: image.quality,
      }))
    );

    if (imagesError) {
      logger.error({ error: imagesError.message }, "Report image save failed");
    }
  }

  return reportId;
}

async function callGeminiWithRetry(
  client: GoogleGenAI,
  model: string,
  contents: Parameters<GoogleGenAI["models"]["generateContent"]>[0]["contents"],
  config: Parameters<GoogleGenAI["models"]["generateContent"]>[0]["config"],
  log: ReturnType<typeof createRequestLogger>
): Promise<{ raw: string; durationMs: number }> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= GEMINI_RETRY_COUNT; attempt++) {
    const startTime = Date.now();
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), GEMINI_TIMEOUT_MS);

    try {
      log.info({ attempt, model }, "Gemini API call starting");

      const response = await client.models.generateContent({
        model,
        contents,
        config,
      } as Parameters<typeof client.models.generateContent>[0]);

      clearTimeout(timeoutId);
      const raw = response.text || "";
      const durationMs = Date.now() - startTime;

      if (!raw) {
        log.warn({ attempt, durationMs }, "Gemini returned empty response");
        lastError = new Error("Empty response");
        if (attempt < GEMINI_RETRY_COUNT) {
          await new Promise((r) => setTimeout(r, GEMINI_RETRY_DELAY_MS * attempt));
          continue;
        }
        return { raw: "", durationMs };
      }

      log.info({ attempt, durationMs, rawLength: raw.length }, "Gemini API call succeeded");
      return { raw, durationMs };
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      lastError = error;
      const durationMs = Date.now() - startTime;
      const message = error instanceof Error ? error.message : "Unknown error";
      log.error({ attempt, durationMs, error: message }, "Gemini API call failed");

      if (error instanceof Error && error.name === "AbortError") {
        log.warn({ attempt }, "Gemini call timed out");
        if (attempt < GEMINI_RETRY_COUNT) {
          await new Promise((r) => setTimeout(r, GEMINI_RETRY_DELAY_MS * attempt));
          continue;
        }
        return { raw: "", durationMs };
      }

      if (attempt < GEMINI_RETRY_COUNT) {
        const delay = GEMINI_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        log.info({ attempt, delay }, "Retrying Gemini call");
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
    }
  }

  throw lastError;
}

function detectDetailLevel(lidarNotes: string, qualityNotes: string, imageCount: number): DetailLevel {
  const hasScale = /\d|cm|mm|m\b|metro|metros|inch|in\b|ft\b|pie|pies|lidar|laser|nivel|escala/i.test(lidarNotes);
  const hasHighRes = qualityNotes.includes("P") || qualityNotes.includes("2MP") || qualityNotes.includes("4MP");
  const hasMultipleImages = imageCount >= 3;

  if (hasScale && hasHighRes && hasMultipleImages) return "forensic";
  if (hasScale || hasHighRes || hasMultipleImages) return "detailed";
  return "standard";
}

function mergeDiagnoses(
  first: InspectionDiagnosis,
  second: InspectionDiagnosis | null
): InspectionDiagnosis {
  if (!second) return first;

  const merged = { ...first };

  if (second.severidad === "critica" || (first.severidad !== "critica" && second.severidad === "alta")) {
    merged.severidad = second.severidad;
  }

  merged.confianza = Math.max(first.confianza, second.confianza);

  if (second.requiere_revision_humana) merged.requiere_revision_humana = true;

  const evidenceSet = new Set([...first.evidencia_visual, ...second.evidencia_visual]);
  merged.evidencia_visual = [...evidenceSet].slice(0, 12);

  const indicatorSet = new Map(
    first.visual_indicators.map((ind) => [`${ind.label}-${Math.round(ind.x)}-${Math.round(ind.y)}`, ind])
  );
  for (const ind of second.visual_indicators) {
    const key = `${ind.label}-${Math.round(ind.x)}-${Math.round(ind.y)}`;
    if (!indicatorSet.has(key) || ind.confidence > (indicatorSet.get(key)?.confidence || 0)) {
      indicatorSet.set(key, ind);
    }
  }
  merged.visual_indicators = [...indicatorSet.values()].slice(0, 8);

  if (second.causa_probable && second.causa_probable.length > first.causa_probable.length) {
    merged.causa_probable = second.causa_probable;
  }

  const riskSet = new Set([...first.riesgos, ...second.riesgos]);
  merged.riesgos = [...riskSet].slice(0, 6);

  const solutionSet = new Set([...first.solucion_paso_a_paso, ...second.solucion_paso_a_paso]);
  merged.solucion_paso_a_paso = [...solutionSet].slice(0, 8);

  const measurementSet = new Set([...first.mediciones_recomendadas, ...second.mediciones_recomendadas]);
  merged.mediciones_recomendadas = [...measurementSet].slice(0, 6);

  return merged;
}

function mergeYoloIntoDiagnosis(
  diagnosis: InspectionDiagnosis,
  detections: DetectionResult[],
  depth: DepthResult | null
): InspectionDiagnosis {
  if (detections.length === 0) return diagnosis;

  const merged = { ...diagnosis };
  const summary = detectionSummary(detections);

  const yoloMarkers = detectionToEvidenceMarkers(detections, 1, 1);
  const existingKeys = new Set(
    merged.visual_indicators.map((ind) => `${ind.label}-${Math.round(ind.x)}-${Math.round(ind.y)}`)
  );

  for (const marker of yoloMarkers) {
    if (!existingKeys.has(`${marker.label}-${Math.round(marker.x)}-${Math.round(marker.y)}`)) {
      merged.visual_indicators.push(marker);
    }
  }
  merged.visual_indicators = merged.visual_indicators.slice(0, 12);

  const defectTypeMap: Record<string, string> = {
    // Construction-specific model classes (cazzz307/yolov8-crack-detection and similar)
    crack: "grieta",
    cracks: "grieta",
    longitudinal: "grieta",
    transverse: "grieta",
    alligator: "grieta",
    spalling: "acabado",
    spall: "acabado",
    pothole: "acabado",
    rust: "oxido",
    corrosion: "oxido",
    corrosion_rust: "oxido",
    exposed_rebar: "instalacion",
    rebar: "instalacion",
    moisture: "humedad",
    damp: "humedad",
    efflorescence: "humedad",
    stain: "acabado",
    staining: "acabado",
    water_stain: "humedad",
    structural: "desplome",
    collapse: "desplome",
    // Fallback for unrecognized classes
  };

  for (const [yoloType, count] of Object.entries(summary.defectTypes)) {
    const mappedType = defectTypeMap[yoloType.toLowerCase()] || "otro";
    if (mappedType === merged.tipo_defecto && count >= 2) {
      merged.confianza = Math.min(1, merged.confianza + 0.05);
    }
  }

  if (summary.highConfidenceCount >= 3 && merged.severidad !== "critica") {
    merged.severidad = "alta";
    merged.requiere_revision_humana = true;
  }

  if (depth) {
    const depthContext = depthToMeasurementContext(depth);
    if (!merged.mediciones_recomendadas.some((m) => m.includes("depth"))) {
      merged.mediciones_recomendadas.push(`Depth analysis: ${depthContext}`);
    }
  }

  const yoloEvidences = detections.map(
    (d) => `YOLO detection: ${d.defect_type} (${Math.round(d.confidence * 100)}% confidence)`
  );
  const evidenceSet = new Set([...merged.evidencia_visual, ...yoloEvidences]);
  merged.evidencia_visual = [...evidenceSet].slice(0, 12);

  return merged;
}

export async function POST(request: Request) {
  const requestId = generateRequestId();
  const log = createRequestLogger(requestId, request);

  // Auth optional — record user if logged in, but allow anonymous use
  const session = await auth().catch(() => null);
  const userId = session?.user?.id;

  log.info({ userId: userId || "anonymous" }, "Analyze request started");

  const rateLimit = await checkRateLimit(`analyze:${getClientIp(request)}`, 20, 5 * 60 * 1000);
  if (!rateLimit.ok) {
    log.warn({ ip: getClientIp(request) }, "Rate limit exceeded");
    return NextResponse.json(
      { error: "Too many analysis requests. Try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
          "X-RateLimit-Limit": String(rateLimit.limit),
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    log.warn("Invalid form data");
    return NextResponse.json({ error: "Send multipart form data with an image field named image." }, { status: 400 });
  }

  const imageEntries = [formData.get("image"), ...formData.getAll("images")].filter(isUploadedImage);

  if (imageEntries.length === 0) {
    return NextResponse.json({ error: "Upload at least one image field named image or images." }, { status: 400 });
  }

  if (imageEntries.length > MAX_ANALYSIS_IMAGES) {
    return NextResponse.json({ error: `Use ${MAX_ANALYSIS_IMAGES} images or fewer per inspection.` }, { status: 400 });
  }

  const totalImageBytes = imageEntries.reduce((sum, image) => sum + image.size, 0);
  if (totalImageBytes > MAX_TOTAL_IMAGE_BYTES) {
    return NextResponse.json({ error: "Inspection image set is too large. Keep total uploads under 30MB." }, { status: 413 });
  }

  for (const image of imageEntries) {
    const imageError = validateImageFile(image);
    if (imageError) {
      return NextResponse.json({ error: imageError }, { status: imageError.includes("large") ? 413 : 400 });
    }
  }

  const cameraLabel = sanitizeText(formData.get("cameraLabel"), "unknown camera", 160);
  const locationLabel = sanitizeText(formData.get("locationLabel"), "", 180);
  const lidarNotes = sanitizeText(formData.get("lidarNotes"), "", 700);
  const qualityNotes = sanitizeText(formData.get("qualityNotes"), "", 500);
  const lat = boundedCoordinate(numberOrNull(formData.get("lat")), -90, 90);
  const lng = boundedCoordinate(numberOrNull(formData.get("lng")), -180, 180);
  const requestedDetailLevel = formData.get("detailLevel") as DetailLevel | null;
  const detailLevel = requestedDetailLevel && DETAIL_LEVELS.includes(requestedDetailLevel)
    ? requestedDetailLevel
    : detectDetailLevel(lidarNotes, qualityNotes, imageEntries.length);

  log.info({ detailLevel, imageCount: imageEntries.length, cameraLabel, locationLabel }, "Analysis parameters");

  let geminiConfig: ReturnType<typeof requireGeminiConfig>;
  try {
    geminiConfig = requireGeminiConfig();
  } catch (error) {
    log.error("Gemini not configured");
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gemini is not configured." }, { status: 500 });
  }

  const imagePayloads = await Promise.all(imageEntries.map((image) => fileToGeminiPart(image)));
  const client = new GoogleGenAI({ apiKey: geminiConfig.apiKey });
  const model = geminiConfig.model;

  const startTime = Date.now();

  const imageBuffers = imageEntries.map((image, index) => ({
    buffer: imagePayloads[index].bytes,
    mimeType: imagePayloads[index].mimeType,
  }));

  log.info("Starting YOLO detection and Gemini analysis in parallel");

  const [yoloResult, geminiResult] = await Promise.all([
    detectDefectsBatch(imageBuffers, {
      confidence: 0.25,
      useSahi: detailLevel === "forensic" || detailLevel === "detailed",
      includeDepth: true,
    }).catch((error) => {
      log.warn({ error: error instanceof Error ? error.message : "Unknown" }, "YOLO detection failed, continuing with Gemini only");
      return null;
    }),
    (async () => {
      const userPrompt = buildUserPrompt({
        cameraLabel,
        locationLabel,
        lidarNotes,
        qualityNotes,
        imageCount: imagePayloads.length,
        detailLevel,
      });

      let firstPassRaw = "";
      let firstPassDurationMs = 0;
      try {
        const result = await callGeminiWithRetry(
          client,
          model,
          [
            { text: `${SYSTEM_PROMPT}\n\n${userPrompt}` },
            ...imagePayloads.map((payload) => payload.part),
          ],
          {
            responseMimeType: "application/json",
            responseSchema: inspectionJsonSchema,
          },
          log
        );
        firstPassRaw = result.raw;
        firstPassDurationMs = result.durationMs;
      } catch (error) {
        log.error({ error: error instanceof Error ? error.message : "Unknown" }, "Gemini first pass failed");
        return { error: "The visual analysis service is temporarily unavailable.", status: 502 as const };
      }

      if (!firstPassRaw) {
        log.warn("AI model returned empty response on first pass");
        return { error: "AI model returned no diagnosis.", status: 502 as const };
      }

      let firstPassDiagnosis: InspectionDiagnosis;
      try {
        firstPassDiagnosis = JSON.parse(firstPassRaw) as InspectionDiagnosis;
      } catch (error) {
        log.error({ raw: firstPassRaw.slice(0, 200) }, "Failed to parse first pass response");
        return { error: "The visual analysis service returned an invalid diagnosis.", status: 502 as const };
      }

      let finalDiagnosis = firstPassDiagnosis;
      let secondPassDurationMs = 0;

      if (imageEntries.length >= 2 && (detailLevel === "detailed" || detailLevel === "forensic")) {
        log.info("Starting second pass analysis for multi-image forensic review");
        try {
          const followUpPrompt = buildFollowUpPrompt({
            firstPassDiagnosis: firstPassDiagnosis,
            imageCount: imagePayloads.length,
            cameraLabel,
            locationLabel,
          });

          const result = await callGeminiWithRetry(
            client,
            model,
            [
              { text: `${SYSTEM_PROMPT}\n\n${followUpPrompt}` },
              ...imagePayloads.map((payload) => payload.part),
            ],
            {
              responseMimeType: "application/json",
              responseSchema: inspectionJsonSchema,
            },
            log
          );

          secondPassDurationMs = result.durationMs;

          if (result.raw) {
            const secondPassDiagnosis = JSON.parse(result.raw) as InspectionDiagnosis;
            finalDiagnosis = mergeDiagnoses(firstPassDiagnosis, secondPassDiagnosis);
            log.info({ firstPassConfidence: firstPassDiagnosis.confianza, secondPassConfidence: secondPassDiagnosis.confianza }, "Second pass completed");
          }
        } catch (error) {
          log.warn({ error: error instanceof Error ? error.message : "Unknown" }, "Second pass failed, using first pass results");
        }
      }

      return { diagnosis: finalDiagnosis, firstPassDurationMs, secondPassDurationMs };
    })(),
  ]);

  if ("error" in geminiResult) {
    return NextResponse.json({ error: geminiResult.error }, { status: geminiResult.status });
  }

  let finalDiagnosis = geminiResult.diagnosis;

  if (yoloResult && yoloResult.detections.length > 0) {
    const firstDepth = yoloResult.depths?.[0] || null;
    log.info({ yoloDetections: yoloResult.detections.length, depthAvailable: !!firstDepth }, "Merging YOLO detections into diagnosis");
    finalDiagnosis = mergeYoloIntoDiagnosis(finalDiagnosis, yoloResult.detections, firstDepth);
  }

  const totalDurationMs = Date.now() - startTime;

  finalDiagnosis.analysis_metadata = {
    detail_level: detailLevel,
    image_count: imagePayloads.length,
    analysis_pass: geminiResult.secondPassDurationMs > 0 ? 2 : 1,
    processing_time_ms: totalDurationMs,
    total_defects_found: finalDiagnosis.evidencia_visual.length,
    micro_defects_detected: finalDiagnosis.riesgos.filter(
      (r) => r.includes("micro") || r.includes("fina") || r.includes("incipiente") || r.includes("incip")
    ),
    surface_conditions: finalDiagnosis.mediciones_recomendadas.filter(
      (m) => m.includes("superficie") || m.includes("textura") || m.includes("acabado")
    ),
    environmental_factors: finalDiagnosis.riesgos.filter(
      (r) => r.includes("humedad") || r.includes("temperatura") || r.includes("condensacion")
    ),
  };

  const [imageUrls, installers] = await Promise.all([
    Promise.all(imagePayloads.map((payload) => storeImage(payload.bytes, payload.mimeType))),
    matchInstallers({ diagnosis: finalDiagnosis, lat, lng }),
  ]);

  const imageUrl = imageUrls[0] ?? null;

  const qualityPayload = {
    notes: qualityNotes,
    imageCount: imageEntries.length,
    totalImageBytes,
    brightness: numberOrNull(formData.get("quality-brightness")),
    sharpness: numberOrNull(formData.get("quality-sharpness")),
    glarePercent: numberOrNull(formData.get("quality-glare")),
    contrast: numberOrNull(formData.get("quality-contrast")),
    grade: sanitizeText(formData.get("quality-grade"), "", 1),
    detailLevel,
    analysisDurationMs: totalDurationMs,
    analysisPasses: geminiResult.secondPassDurationMs > 0 ? 2 : 1,
    yoloDetections: yoloResult?.detections.length || 0,
    yoloDevice: yoloResult?.device || "unavailable",
    depthAvailable: !!yoloResult?.depths?.[0],
    images: imageEntries.map((image, index) => ({
      index: index + 1,
      sizeBytes: image.size,
      mimeType: imagePayloads[index]?.mimeType || image.type,
      url: imageUrls[index] ?? null,
    })),
  };

  const reportImages = imageEntries.map((image, index) => ({
    url: imageUrls[index] ?? null,
    mimeType: imagePayloads[index]?.mimeType || image.type,
    sizeBytes: image.size,
    quality: qualityPayload.images[index],
  }));

  const reportId = await saveReport({
    diagnosis: finalDiagnosis,
    imageUrl,
    images: reportImages,
    cameraLabel,
    locationLabel,
    lat,
    lng,
    quality: qualityPayload,
    userId,
  });

  log.info({
    reportId,
    model,
    detailLevel,
    durationMs: totalDurationMs,
    firstPassMs: geminiResult.firstPassDurationMs,
    secondPassMs: geminiResult.secondPassDurationMs,
    yoloDetections: yoloResult?.detections.length || 0,
    depthAvailable: !!yoloResult?.depths?.[0],
    userId: userId || "anonymous",
    totalDefects: finalDiagnosis.evidencia_visual.length,
  }, "Analysis complete");

  return NextResponse.json({
    reportId,
    diagnosis: finalDiagnosis,
    installers,
    imageUrl,
    imageUrls,
    model,
    detailLevel,
    analysisDurationMs: totalDurationMs,
    yolo: yoloResult
      ? {
          detections: yoloResult.detections,
          depths: yoloResult.depths,
          processingTimeMs: yoloResult.processing_time_ms,
          device: yoloResult.device,
        }
      : null,
  });
}