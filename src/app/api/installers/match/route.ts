import { NextResponse } from "next/server";
import type { InspectionDiagnosis } from "@/lib/analysis-schema";
import { matchInstallers } from "@/lib/installer-match";
import { validateInstallersMatchBody } from "@/lib/request-guards";
import { auth } from "@/lib/auth";
import { createRequestLogger, generateRequestId } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = generateRequestId();
  const log = createRequestLogger(requestId, request);

  const session = await auth();
  log.info({ userId: session?.user?.id || "anonymous" }, "Installer match request");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  let parsed: { diagnosis: InspectionDiagnosis; lat?: number | null; lng?: number | null };
  try {
    const validated = validateInstallersMatchBody(body);
    const diagnosis: InspectionDiagnosis = {
      tipo_defecto: validated.diagnosis.tipo_defecto,
      severidad: validated.diagnosis.severidad,
      ubicacion: validated.diagnosis.ubicacion,
      causa_probable: validated.diagnosis.causa_probable,
      solucion_paso_a_paso: validated.diagnosis.solucion_paso_a_paso,
      urgencia_dias: validated.diagnosis.urgencia_dias,
      especialista_requerido: validated.diagnosis.especialista_requerido,
      mediciones_recomendadas: validated.diagnosis.mediciones_recomendadas,
      riesgos: validated.diagnosis.riesgos,
      confianza: validated.diagnosis.confianza,
      evidencia_visual: validated.diagnosis.evidencia_visual,
      visual_indicators: validated.diagnosis.visual_indicators,
      requiere_revision_humana: validated.diagnosis.requiere_revision_humana,
    };
    parsed = { diagnosis, lat: validated.lat, lng: validated.lng };
  } catch (error) {
    log.warn({ error: error instanceof Error ? error.message : "Validation failed" }, "Invalid installer match body");
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request body." }, { status: 400 });
  }

  const installers = await matchInstallers({
    diagnosis: parsed.diagnosis,
    lat: parsed.lat ?? null,
    lng: parsed.lng ?? null,
  });

  log.info({ installerCount: installers.length }, "Installers matched");
  return NextResponse.json({ installers });
}