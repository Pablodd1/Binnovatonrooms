import { GoogleGenAI, MediaResolution } from "@google/genai";
import { NextResponse } from "next/server";
import { inspectionJsonSchema, type InspectionDiagnosis } from "@/lib/analysis-schema";
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
import { parseDiagnosis, selectDetailLevel, shouldReview } from "@/lib/analysis-policy";
import { generateDiagnosis, ANALYSIS_BUDGET_MS } from "@/lib/gemini";
import { validateImageSet } from "@/lib/image-limits";
import { buildUserPrompt, buildFollowUpPrompt, SYSTEM_PROMPT } from "@/lib/vision-prompt";
import { auth } from "@/lib/auth";
import { createRequestLogger, generateRequestId, logger } from "@/lib/logger";
import { detectDefectsBatch } from "@/lib/detection-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function POST(request: Request) {
  const requestId = generateRequestId();
  const log = createRequestLogger(requestId, request);

  try {
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
  const detailLevel = selectDetailLevel(formData.get("detailLevel"));

  log.info({ detailLevel, imageCount: imageEntries.length, cameraLabel, locationLabel }, "Analysis parameters");

  let geminiConfig: ReturnType<typeof requireGeminiConfig>;
  try {
    geminiConfig = requireGeminiConfig();
  } catch (error) {
    log.error("Gemini not configured");
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gemini is not configured." }, { status: 500 });
  }

  const setError = validateImageSet(imageEntries);
  if (setError) return NextResponse.json({ error: setError }, { status: 413 });

  const imagePayloads = await Promise.all(imageEntries.map((image) => fileToGeminiPart(image)));
  const client = new GoogleGenAI({ apiKey: geminiConfig.apiKey });
  const model = geminiConfig.model;

  const startTime = Date.now();
  const deadline = startTime + ANALYSIS_BUDGET_MS;
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(ANALYSIS_BUDGET_MS)]);
  const warnings: string[] = [];
  let reviewCompleted = false;
  const imageParts = imagePayloads.flatMap((payload, index) => [
    { text: `Foto ${index + 1} (image_index=${index + 1}):` }, payload.part,
  ]);
  const generationConfig = {
    systemInstruction: SYSTEM_PROMPT,
    responseMimeType: "application/json",
    responseSchema: inspectionJsonSchema,
    mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH,
  };

  const imageBuffers = imageEntries.map((image, index) => ({
    buffer: imagePayloads[index].bytes,
    mimeType: imagePayloads[index].mimeType,
  }));

  log.info("Starting YOLO detection and Gemini analysis in parallel");

  const [yoloResult, geminiResult] = await Promise.all([
    (detailLevel === "forensic" ? detectDefectsBatch(imageBuffers, {
      confidence: 0.25,
      useSahi: true,
      includeDepth: false, // Relative monocular depth is not a calibrated measurement.
      signal,
      timeoutMs: 8_000,
    }) : Promise.resolve(null)).catch((error) => {
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
        const result = await generateDiagnosis(
          client,
          model,
          [
            { text: userPrompt },
            ...imageParts,
          ],
          generationConfig,
          signal, deadline
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
        firstPassDiagnosis = parseDiagnosis(firstPassRaw, imageEntries.length);
      } catch (error) {
        log.error({ raw: firstPassRaw.slice(0, 200) }, "Failed to parse first pass response");
        return { error: "The visual analysis service returned an invalid diagnosis.", status: 502 as const };
      }

      let finalDiagnosis = firstPassDiagnosis;
      let secondPassDurationMs = 0;

      if (shouldReview(detailLevel, deadline - Date.now())) {
        log.info("Starting second pass analysis for multi-image forensic review");
        try {
          const followUpPrompt = buildFollowUpPrompt({
            firstPassDiagnosis: firstPassDiagnosis,
            imageCount: imagePayloads.length,
            cameraLabel,
            locationLabel,
          });

          const result = await generateDiagnosis(
            client,
            model,
            [
              { text: followUpPrompt },
              ...imageParts,
            ],
            generationConfig,
            signal, deadline
          );

          secondPassDurationMs = result.durationMs;

          if (result.raw) {
            const secondPassDiagnosis = parseDiagnosis(result.raw, imageEntries.length);
            // A coherent revised diagnosis can retract unsupported first-pass findings.
            finalDiagnosis = secondPassDiagnosis;
            reviewCompleted = true;
            log.info({ firstPassConfidence: firstPassDiagnosis.confianza, secondPassConfidence: secondPassDiagnosis.confianza }, "Second pass completed");
          }
        } catch (error) {
          warnings.push("La segunda revision no se completo; se muestra el primer analisis validado.");
          log.warn({ error: error instanceof Error ? error.message : "Unknown" }, "Second pass failed, using first pass results");
        }
      }

      if (detailLevel === "forensic" && !reviewCompleted && warnings.length === 0) {
        warnings.push("No hubo tiempo para una segunda revision; se muestra el primer analisis validado.");
      }
      return { diagnosis: finalDiagnosis, firstPassDurationMs, secondPassDurationMs };
    })(),
  ]);

  if ("error" in geminiResult) {
    return NextResponse.json({ error: geminiResult.error }, { status: geminiResult.status });
  }

  const finalDiagnosis = geminiResult.diagnosis;
  // Detector candidates stay separate: counts cannot establish severity or diagnostic confidence.
  const totalDurationMs = Date.now() - startTime;

  finalDiagnosis.analysis_metadata = {
    detail_level: detailLevel,
    image_count: imagePayloads.length,
    analysis_pass: reviewCompleted ? 2 : 1,
    processing_time_ms: totalDurationMs,
    review_completed: reviewCompleted,
    warnings,
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
    finalDiagnosis.outcome === "defect_detected"
      ? matchInstallers({ diagnosis: finalDiagnosis, lat, lng }) : Promise.resolve([]),
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
    analysisPasses: reviewCompleted ? 2 : 1,
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
    outcome: finalDiagnosis.outcome,
  }, "Analysis complete");

  return NextResponse.json({
    reportId,
    diagnosis: finalDiagnosis,
    saved: Boolean(reportId),
    warnings: [...warnings, ...(!reportId ? ["Analisis completado, pero el reporte no se guardo. Exporte el JSON antes de salir."] : [])],
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
  } catch (error) {
    log.error({ error: error instanceof Error ? error.message : "Unknown" }, "Analyze request failed unexpectedly");
    return NextResponse.json(
      { error: "No se pudo completar el analisis. Intente de nuevo." },
      { status: 500 }
    );
  }
}