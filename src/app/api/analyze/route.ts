import OpenAI from "openai";
import { NextResponse } from "next/server";
import { inspectionJsonSchema, type InspectionDiagnosis } from "@/lib/analysis-schema";
import { matchInstallers } from "@/lib/installer-match";
import { checkRateLimit, getClientIp, imageExtension, sanitizeText, validateImageFile } from "@/lib/request-guards";
import { requireOpenAIConfig } from "@/lib/server-config";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { buildUserPrompt, SYSTEM_PROMPT } from "@/lib/vision-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function numberOrNull(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boundedCoordinate(value: number | null, min: number, max: number) {
  if (value === null) return null;
  if (value < min || value > max) return null;
  return value;
}

async function fileToDataUrl(file: File) {
  const bytes = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "image/jpeg";
  return {
    dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`,
    bytes,
    mimeType
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
    upsert: false
  });

  if (error) {
    console.error("Image upload failed", error);
    return null;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

async function saveReport(input: {
  diagnosis: InspectionDiagnosis;
  imageUrl: string | null;
  cameraLabel: string;
  locationLabel: string;
  lat: number | null;
  lng: number | null;
  quality: unknown;
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
      quality: input.quality
    })
    .select("id")
    .single();

  if (error) {
    console.error("Report save failed", error);
    return null;
  }

  return data?.id ?? null;
}

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(`analyze:${getClientIp(request)}`, 20, 5 * 60 * 1000);
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Too many analysis requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Send multipart form data with an image field named image." }, { status: 400 });
  }

  const image = formData.get("image");

  if (!(image instanceof File)) {
    return NextResponse.json({ error: "Upload an image field named image." }, { status: 400 });
  }

  const imageError = validateImageFile(image);
  if (imageError) {
    return NextResponse.json({ error: imageError }, { status: imageError.includes("large") ? 413 : 400 });
  }

  const cameraLabel = sanitizeText(formData.get("cameraLabel"), "unknown camera", 160);
  const locationLabel = sanitizeText(formData.get("locationLabel"), "", 180);
  const lidarNotes = sanitizeText(formData.get("lidarNotes"), "", 700);
  const qualityNotes = sanitizeText(formData.get("qualityNotes"), "", 250);
  const lat = boundedCoordinate(numberOrNull(formData.get("lat")), -90, 90);
  const lng = boundedCoordinate(numberOrNull(formData.get("lng")), -180, 180);

  let openaiConfig: ReturnType<typeof requireOpenAIConfig>;
  try {
    openaiConfig = requireOpenAIConfig();
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "OpenAI is not configured." }, { status: 500 });
  }

  const { dataUrl, bytes, mimeType } = await fileToDataUrl(image);
  const client = new OpenAI({ apiKey: openaiConfig.apiKey });
  const model = openaiConfig.model;

  let raw = "";
  try {
    const response = (await client.responses.create({
      model,
      instructions: SYSTEM_PROMPT,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildUserPrompt({ cameraLabel, locationLabel, lidarNotes, qualityNotes })
            },
            {
              type: "input_image",
              image_url: dataUrl,
              detail: "high"
            }
          ]
        }
      ],
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "buildscan_inspection_diagnosis",
          strict: true,
          schema: inspectionJsonSchema
        }
      },
      reasoning: { effort: "low" },
      max_output_tokens: 1800,
      store: false,
      stream: false
    } as Parameters<typeof client.responses.create>[0])) as { output_text: string };

    raw = response.output_text;
  } catch (error) {
    console.error("OpenAI analysis failed", error);
    return NextResponse.json(
      { error: "The visual analysis service is temporarily unavailable." },
      { status: 502 }
    );
  }

  let diagnosis: InspectionDiagnosis;
  try {
    diagnosis = JSON.parse(raw) as InspectionDiagnosis;
  } catch (error) {
    console.error("Failed to parse model response", error);
    return NextResponse.json(
      { error: "The visual analysis service returned an invalid diagnosis." },
      { status: 502 }
    );
  }

  if (!raw) {
    return NextResponse.json({ error: "AI model returned no diagnosis." }, { status: 502 });
  }

  const [imageUrl, installers] = await Promise.all([
    storeImage(bytes, mimeType),
    matchInstallers({ diagnosis, lat, lng })
  ]);
  const reportId = await saveReport({
    diagnosis,
    imageUrl,
    cameraLabel,
    locationLabel,
    lat,
    lng,
    quality: {
      notes: qualityNotes,
      image: {
        sizeBytes: image.size,
        mimeType
      }
    }
  });

  return NextResponse.json({
    reportId,
    diagnosis,
    installers,
    imageUrl,
    model
  });
}
