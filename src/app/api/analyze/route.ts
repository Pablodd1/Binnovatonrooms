import OpenAI from "openai";
import { NextResponse } from "next/server";
import { inspectionJsonSchema, type InspectionDiagnosis } from "@/lib/analysis-schema";
import { matchInstallers } from "@/lib/installer-match";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { buildUserPrompt, SYSTEM_PROMPT } from "@/lib/vision-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function numberOrNull(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

  const extension = mimeType.includes("png") ? "png" : "jpg";
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
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY. Add it in Vercel Project Settings." },
      { status: 500 }
    );
  }

  const formData = await request.formData();
  const image = formData.get("image");

  if (!(image instanceof File)) {
    return NextResponse.json({ error: "Upload an image field named image." }, { status: 400 });
  }

  if (image.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Image is too large. Keep captures under 10MB." }, { status: 413 });
  }

  const cameraLabel = String(formData.get("cameraLabel") || "unknown camera");
  const locationLabel = String(formData.get("locationLabel") || "");
  const lidarNotes = String(formData.get("lidarNotes") || "");
  const qualityNotes = String(formData.get("qualityNotes") || "");
  const lat = numberOrNull(formData.get("lat"));
  const lng = numberOrNull(formData.get("lng"));

  const { dataUrl, bytes, mimeType } = await fileToDataUrl(image);
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL || "gpt-5.5";

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.1,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "buildscan_inspection_diagnosis",
        strict: true,
        schema: inspectionJsonSchema
      }
    },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: buildUserPrompt({ cameraLabel, locationLabel, lidarNotes, qualityNotes })
          },
          {
            type: "image_url",
            image_url: {
              url: dataUrl,
              detail: "high"
            }
          }
        ]
      }
    ]
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    return NextResponse.json({ error: "AI model returned no diagnosis." }, { status: 502 });
  }

  const diagnosis = JSON.parse(raw) as InspectionDiagnosis;
  const imageUrl = await storeImage(bytes, mimeType);
  const installers = await matchInstallers({ diagnosis, lat, lng });
  const reportId = await saveReport({
    diagnosis,
    imageUrl,
    cameraLabel,
    locationLabel,
    lat,
    lng,
    quality: { notes: qualityNotes }
  });

  return NextResponse.json({
    reportId,
    diagnosis,
    installers,
    imageUrl,
    model
  });
}
