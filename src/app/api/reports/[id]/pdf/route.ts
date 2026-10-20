import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { createRequestLogger, generateRequestId } from "@/lib/logger";
import type { InspectionDiagnosis } from "@/lib/analysis-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReportRow = {
  id: string;
  created_at: string;
  tipo_defecto: string;
  severidad: string;
  especialista_requerido: string;
  diagnostico: InspectionDiagnosis | null;
  image_url: string | null;
  camera_label: string | null;
  location_label: string | null;
  lat: number | null;
  lng: number | null;
  status: string | null;
  closed_reason: string | null;
  closed_category: string | null;
  closed_at: string | null;
  quality: unknown;
  report_images: Array<{
    id: string;
    sort_order: number;
    image_url: string | null;
    mime_type: string | null;
  }>;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/** Escape user/AI-generated content before interpolating into HTML to prevent XSS. */
function esc(value: string | null | undefined): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Validate image URLs to only allow safe http(s) schemes (prevents javascript:/data: injection). */
function safeImgSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return esc(trimmed);
  return null; // reject javascript:, data:, blob:, file:, etc.
}

const VALID_SEVERITIES = new Set(["critica", "alta", "media", "baja"]);
function safeSeverityClass(sev: string | null | undefined): string {
  const s = (sev || "").toLowerCase();
  return VALID_SEVERITIES.has(s) ? s : "baja";
}

const STATUS_LABELS: Record<string, string> = {
  nuevo: "Nuevo",
  revision: "En revision",
  asignar: "Asignado",
  cerrado: "Cerrado",
};

function buildPdfHtml(report: ReportRow): string {
  const diag = report.diagnostico;
  const sevClass = safeSeverityClass(report.severidad);
  const severityColor = sevClass === "critica" ? "#ff695f"
    : sevClass === "alta" ? "#f3bd47"
    : sevClass === "media" ? "#7cc7ff"
    : "#42d392";

  const confidencePct = diag ? Math.round(diag.confianza * 100) : 0;
  const urgency = diag ? (diag.urgencia_dias === 0 ? "Inmediata" : `${diag.urgencia_dias} dias`) : "—";
  const status = (report.status || "nuevo").toLowerCase();
  const statusLabel = STATUS_LABELS[status] || esc(report.status || "");
  const isClosed = status === "cerrado";

  const evidenceItems = diag?.evidencia_visual?.map((e) => `<li>${esc(e)}</li>`).join("") || "<li>Sin evidencia</li>";
  const riskItems = diag?.riesgos?.map((r) => `<li>${esc(r)}</li>`).join("") || "";
  const stepItems = diag?.solucion_paso_a_paso?.map((s, i) => `<li><span class="stepnum">${i + 1}</span>${esc(s)}</li>`).join("") || "";
  const measureItems = diag?.mediciones_recomendadas?.map((m) => `<li>${esc(m)}</li>`).join("") || "";
  const markers = diag?.visual_indicators ?? [];

  const buildImg = (url: string | null, index: number) => {
    const safe = safeImgSrc(url);
    return safe ? `<figure><img src="${safe}" /><figcaption>Foto ${index}</figcaption></figure>` : "";
  };
  const imagesHtml = (report.report_images?.length
    ? report.report_images.map((img, i) => buildImg(img.image_url, i + 1))
    : [buildImg(report.image_url, 1)]
  ).join("");

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https:; style-src 'unsafe-inline'; script-src 'none'">
<title>BuildScan AI — Reporte ${report.id.slice(0, 8)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #16222d; background: #fff; padding: 0 0 32px; }

  /* Brand band */
  .brand { background: #101820; color: #fff; padding: 26px 40px; display: flex; justify-content: space-between; align-items: center; }
  .brand .logo { font-size: 1.45rem; font-weight: 800; letter-spacing: 0.5px; }
  .brand .logo span { color: #42d392; }
  .brand .tag { color: #a9b8c5; font-size: 0.78rem; margin-top: 3px; }
  .brand .doc { text-align: right; font-size: 0.72rem; color: #a9b8c5; line-height: 1.5; }
  .accent { height: 5px; background: ${severityColor}; }

  .content { padding: 28px 40px 0; }

  /* Executive summary */
  .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 26px; }
  .summary .cell { border: 1px solid #e3e9ee; border-radius: 10px; padding: 12px 14px; }
  .summary .cell label { display: block; color: #8494a3; font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 5px; }
  .summary .cell strong { font-size: 1.02rem; }
  .summary .cell strong.sev { color: ${severityColor}; }

  .title-row { display: flex; align-items: baseline; gap: 12px; margin: 4px 0 20px; }
  .title-row h1 { font-size: 1.5rem; text-transform: capitalize; }
  .title-row .report-id { color: #8494a3; font-size: 0.78rem; }

  .section { margin: 26px 0; page-break-inside: avoid; }
  .section > h2 { font-size: 0.95rem; text-transform: uppercase; letter-spacing: 1px; color: #101820; border-left: 4px solid ${severityColor}; padding-left: 10px; margin-bottom: 12px; }
  .field { margin: 10px 0; }
  .field label { display: block; color: #8494a3; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px; }
  .field p, .field li { font-size: 0.92rem; line-height: 1.55; }
  .field ul, .field ol { padding-left: 20px; }
  .field li { margin-bottom: 5px; }
  .stepnum { display: inline-block; min-width: 22px; font-weight: 800; color: ${severityColor}; }

  .confidence-bar { background: #edf1f4; border-radius: 8px; height: 18px; overflow: hidden; margin-top: 6px; }
  .confidence-fill { height: 100%; background: ${severityColor}; border-radius: 8px; }

  figure { margin: 10px 0; page-break-inside: avoid; }
  figure img { max-width: 100%; border: 1px solid #e3e9ee; border-radius: 8px; }
  figure figcaption { color: #8494a3; font-size: 0.72rem; margin-top: 4px; }

  .closed-box { border: 1px solid #e3e9ee; border-left: 4px solid #42d392; border-radius: 8px; padding: 12px 16px; margin: 18px 0; }
  .closed-box label { display: block; color: #8494a3; font-size: 0.72rem; text-transform: uppercase; margin-bottom: 3px; }

  .disclaimer { background: #f6f8fa; border-radius: 8px; padding: 10px 14px; color: #5b6b7a; font-size: 0.75rem; line-height: 1.5; margin-top: 24px; }

  .footer { margin-top: 28px; padding: 14px 40px 0; border-top: 1px solid #e3e9ee; color: #9aa9b7; font-size: 0.7rem; display: flex; justify-content: space-between; }

  @media print { .brand { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
  <div class="brand">
    <div>
      <div class="logo">Build<span>Scan</span> AI</div>
      <div class="tag">Inspeccion visual con IA para control de calidad en construccion</div>
    </div>
    <div class="doc">
      Reporte de inspeccion<br>
      ${formatDate(report.created_at)}<br>
      Ref: ${report.id.slice(0, 8)}
    </div>
  </div>
  <div class="accent"></div>

  <div class="content">
    <div class="summary">
      <div class="cell"><label>Severidad</label><strong class="sev">${esc((report.severidad || "").toUpperCase())}</strong></div>
      <div class="cell"><label>Confianza IA</label><strong>${confidencePct}%</strong></div>
      <div class="cell"><label>Urgencia</label><strong>${esc(urgency)}</strong></div>
      <div class="cell"><label>Estado</label><strong>${esc(statusLabel)}</strong></div>
    </div>

    <div class="title-row">
      <h1>${esc(report.tipo_defecto)}</h1>
      <span class="report-id">Especialista: ${esc(report.especialista_requerido)}</span>
    </div>

    <div class="section"><h2>Ubicacion y contexto</h2>
      <div class="field"><label>Area reportada</label><p>${esc(report.location_label || "No especificada")}</p></div>
      <div class="field"><label>Camara</label><p>${esc(report.camera_label || "No registrada")}</p></div>
      ${report.lat ? `<div class="field"><label>Coordenadas GPS</label><p>${Number(report.lat).toFixed(5)}, ${Number(report.lng).toFixed(5)}</p></div>` : ""}
    </div>

    ${imagesHtml ? `<div class="section"><h2>Evidencia fotografica</h2>${imagesHtml}</div>` : ""}

    ${diag ? `
    <div class="section"><h2>Diagnostico tecnico</h2>
      <div class="field"><label>Ubicacion del defecto</label><p>${esc(diag.ubicacion)}</p></div>
      <div class="field"><label>Causa probable</label><p>${esc(diag.causa_probable)}</p></div>
      <div class="field"><label>Confianza del analisis</label>
        <div class="confidence-bar"><div class="confidence-fill" style="width:${confidencePct}%"></div></div>
      </div>
      ${markers.length ? `<div class="field"><label>Zonas marcadas</label><ul>${markers.map((m) => `<li>${esc(m.label)} (${Math.round((m.confidence || 0) * 100)}%)</li>`).join("")}</ul></div>` : ""}
    </div>

    ${riskItems ? `<div class="section"><h2>Riesgos identificados</h2><ul>${riskItems}</ul></div>` : ""}
    ${stepItems ? `<div class="section"><h2>Plan de accion paso a paso</h2><ol>${stepItems}</ol></div>` : ""}
    ${measureItems ? `<div class="section"><h2>Mediciones recomendadas</h2><ul>${measureItems}</ul></div>` : ""}
    <div class="section"><h2>Evidencia detectada</h2><ul>${evidenceItems}</ul></div>
    ` : "<p>No hay datos de diagnostico disponibles.</p>"}

    ${isClosed ? `
    <div class="closed-box">
      <label>Reporte cerrado${report.closed_category ? ` — categoria: ${esc(report.closed_category)}` : ""}</label>
      <p>${esc(report.closed_reason || "Sin motivo registrado")}</p>
      ${report.closed_at ? `<p style="color:#8494a3;font-size:0.78rem;margin-top:4px;">${formatDate(report.closed_at)}</p>` : ""}
    </div>` : ""}

    <div class="disclaimer">
      <strong>Nota:</strong> Diagnostico asistido por inteligencia artificial a partir de evidencia fotografica.
      No sustituye la evaluacion de un profesional colegiado. Verifique las mediciones en sitio antes de
      ejecutar trabajos de reparacion.
    </div>
  </div>

  <div class="footer">
    <span>BuildScan AI — documento generado automaticamente</span>
    <span>ID completo: ${esc(report.id)}</span>
  </div>
</body></html>`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = generateRequestId();
  const log = createRequestLogger(requestId, request);
  const { id } = await params;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  const { data: report, error } = await supabase
    .from("reportes")
    .select("*, report_images(*)")
    .eq("id", id)
    .single();

  if (error || !report) {
    log.warn({ reportId: id, error: error?.message }, "Report not found for PDF");
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const html = buildPdfHtml(report as unknown as ReportRow);

  // Branded printable document: browsers render this pixel-perfect and
  // "Guardar como PDF" produces the professional deliverable.
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="buildscan-report-${id.slice(0, 8)}.html"`,
    },
  });
}
