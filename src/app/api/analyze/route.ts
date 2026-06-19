import { GoogleGenAI } from "@google/genai";
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
import { buildUserPrompt, SYSTEM_PROMPT } from "@/lib/vision-prompt";
import { auth } from "@/lib/auth";
import { createRequestLogger, generateRequestId } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GEMINI_TIMEOUT_MS = 30_000;

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
    console.error("Image upload failed", error);
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
    })
    .select("id")
    .single();

  if (error) {
    console.error("Report save failed", error);
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
      console.error("Report image save failed", imagesError);
    }
  }

  return reportId;
}

export async function POST(request: Request) {
  const requestId = generateRequestId();
  const log = createRequestLogger(requestId, request);

  const session = await auth();
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

  let raw = "";
  try {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), GEMINI_TIMEOUT_MS);

    const response = await client.models.generateContent({
      model,
      contents: [
        {
          text: `${SYSTEM_PROMPT}\n\n${buildUserPrompt({
            cameraLabel,
            locationLabel,
            lidarNotes,
            qualityNotes,
            imageCount: imagePayloads.length,
          })}`,
        },
        ...imagePayloads.map((payload) => payload.part),
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: inspectionJsonSchema,
      },
    } as Parameters<typeof client.models.generateContent>[0]);

    clearTimeout(timeoutId);
    raw = response.text || "";
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    log.error({ error: message }, "Gemini analysis failed");

    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { error: "The visual analysis timed out. Try with fewer or smaller images." },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: "The visual analysis service is temporarily unavailable." },
      { status: 502 }
    );
  }

  if (!raw) {
    log.warn("AI model returned empty response");
    return NextResponse.json({ error: "AI model returned no diagnosis." }, { status: 502 });
  }

  let diagnosis: InspectionDiagnosis;
  try {
    diagnosis = JSON.parse(raw) as InspectionDiagnosis;
  } catch (error) {
    log.error({ raw: raw.slice(0, 200) }, "Failed to parse model response");
    return NextResponse.json(
      { error: "The visual analysis service returned an invalid diagnosis." },
      { status: 502 }
    );
  }

  const [imageUrls, installers] = await Promise.all([
    Promise.all(imagePayloads.map((payload) => storeImage(payload.bytes, payload.mimeType))),
    matchInstallers({ diagnosis, lat, lng }),
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
    diagnosis,
    imageUrl,
    images: reportImages,
    cameraLabel,
    locationLabel,
    lat,
    lng,
    quality: qualityPayload,
    userId,
  });

  log.info({ reportId, model, userId: userId || "anonymous" }, "Analysis complete");

  return NextResponse.json({
    reportId,
    diagnosis,
    installers,
    imageUrl,
    imageUrls,
    model,
  });
}