import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { auth } from "@/lib/auth";
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

function buildPdfHtml(report: ReportRow): string {
  const diag = report.diagnostico;
  const severityColor = report.severidad === "critica" ? "#ff695f"
    : report.severidad === "alta" ? "#f3bd47"
    : report.severidad === "media" ? "#7cc7ff"
    : "#42d392";

  const evidenceItems = diag?.evidencia_visual?.map((e) => `<li>${esc(e)}</li>`).join("") || "<li>Sin evidencia</li>";
  const riskItems = diag?.riesgos?.map((r) => `<li>${esc(r)}</li>`).join("") || "";
  const stepItems = diag?.solucion_paso_a_paso?.map((s, i) => `<li><strong>${i + 1}.</strong> ${esc(s)}</li>`).join("") || "";
  const measureItems = diag?.mediciones_recomendadas?.map((m) => `<li>${esc(m)}</li>`).join("") || "";

  const imagesHtml = report.report_images?.map((img) =>
    img.image_url ? `<img src="${esc(img.image_url)}" style="max-width:100%;border-radius:8px;margin:8px 0;" />` : ""
  ).join("") || (report.image_url ? `<img src="${esc(report.image_url)}" style="max-width:100%;border-radius:8px;margin:8px 0;" />` : "");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>BuildScan AI - Reporte ${report.id.slice(0, 8)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a2e; background: #fff; padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #101820; padding-bottom: 20px; margin-bottom: 24px; }
  .header h1 { font-size: 1.6rem; color: #101820; }
  .header .subtitle { color: #666; font-size: 0.9rem; margin-top: 4px; }
  .header .date { color: #888; font-size: 0.85rem; text-align: right; }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 999px; font-weight: 700; font-size: 0.85rem; }
  .badge-critica { background: #ff695f22; color: #d63031; }
  .badge-alta { background: #f3bd4722; color: #b8860b; }
  .badge-media { background: #7cc7ff22; color: #2d6a8f; }
  .badge-baja { background: #42d39222; color: #1e7e4e; }
  .meta { display: flex; gap: 24px; margin: 16px 0 24px; flex-wrap: wrap; }
  .meta-item label { display: block; color: #888; font-size: 0.8rem; margin-bottom: 4px; }
  .meta-item span { font-size: 0.95rem; }
  .section { margin: 24px 0; }
  .section h2 { font-size: 1.1rem; color: #101820; border-left: 4px solid ${severityColor}; padding-left: 12px; margin-bottom: 12px; }
  .field { margin: 12px 0; }
  .field label { display: block; color: #888; font-size: 0.8rem; margin-bottom: 4px; }
  .field p { font-size: 0.95rem; line-height: 1.5; }
  .field ul, .field ol { padding-left: 20px; }
  .field li { font-size: 0.9rem; line-height: 1.6; margin-bottom: 4px; }
  .confidence-bar { background: #eee; border-radius: 8px; height: 20px; overflow: hidden; margin-top: 6px; }
  .confidence-fill { height: 100%; background: ${severityColor}; border-radius: 8px; }
  .confidence-text { font-size: 0.85rem; color: #555; margin-top: 4px; }
  .images { margin: 16px 0; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #ddd; color: #aaa; font-size: 0.75rem; text-align: center; }
  @media print { body { padding: 20px; } }
</style></head><body>
  <div class="header">
    <div>
      <h1>BuildScan AI - Reporte de Inspeccion</h1>
      <div class="subtitle">Inspeccion visual con IA para control de calidad en construccion</div>
    </div>
    <div class="date">${formatDate(report.created_at)}</div>
  </div>

  <div style="display:flex;gap:12px;margin-bottom:24px;align-items:center;">
    <span class="badge badge-${esc(report.severidad)}">${esc(report.severidad.toUpperCase())}</span>
    <span style="font-weight:700;font-size:1.1rem;">${esc(report.tipo_defecto)}</span>
  </div>

  <div class="meta">
    <div class="meta-item"><label>Ubicacion</label><span>${esc(report.location_label) || "No especificada"}</span></div>
    <div class="meta-item"><label>Especialista</label><span>${esc(report.especialista_requerido)}</span></div>
    <div class="meta-item"><label>Camara</label><span>${esc(report.camera_label) || "No registrada"}</span></div>
    ${report.lat ? `<div class="meta-item"><label>Coordenadas</label><span>${Number(report.lat).toFixed(4)}, ${Number(report.lng).toFixed(4)}</span></div>` : ""}
  </div>

  ${imagesHtml ? `<div class="section"><h2>Evidencia Visual</h2><div class="images">${imagesHtml}</div></div>` : ""}

  ${diag ? `
  <div class="section"><h2>Diagnostico</h2>
    <div class="field"><label>Ubicacion del defecto</label><p>${esc(diag.ubicacion)}</p></div>
    <div class="field"><label>Causa probable</label><p>${esc(diag.causa_probable)}</p></div>
    <div class="field"><label>Confianza del analisis</label>
      <div class="confidence-bar"><div class="confidence-fill" style="width:${Math.round(diag.confianza * 100)}%"></div></div>
      <div class="confidence-text">${Math.round(diag.confianza * 100)}% ${diag.requiere_revision_humana ? "(revision humana requerida)" : ""}</div>
    </div>
    <div class="field"><label>Urgencia</label><p>${diag.urgencia_dias === 0 ? "Inmediata" : diag.urgencia_dias + " dias"}</p></div>
  </div>

  ${riskItems ? `<div class="section"><h2>Riesgos Identificados</h2><ul>${riskItems}</ul></div>` : ""}
  ${stepItems ? `<div class="section"><h2>Plan de Accion Paso a Paso</h2><ol>${stepItems}</ol></div>` : ""}
  ${measureItems ? `<div class="section"><h2>Mediciones Recomendadas</h2><ul>${measureItems}</ul></div>` : ""}

  <div class="section"><h2>Evidencia Detectada</h2><ul>${evidenceItems}</ul></div>
  ` : "<p>No hay datos de diagnostico disponibles.</p>"}

  <div class="footer">
    Generado por BuildScan AI &mdash; ${new Date().toISOString().split("T")[0]} &mdash; ID: ${esc(report.id)}
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

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  const { data: report, error } = await supabase
    .from("reportes")
    .select("*, report_images(*)")
    .eq("id", id)
    .eq("user_id", session.user.id)
    .single();

  if (error || !report) {
    log.warn({ reportId: id, error: error?.message }, "Report not found for PDF");
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const html = buildPdfHtml(report as unknown as ReportRow);

  // Use browserless or basic HTML-to-text fallback
  // For now, return HTML as a downloadable file that browsers can print-to-PDF
  // In production, integrate with a PDF service or @react-pdf/renderer
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="buildscan-report-${id.slice(0, 8)}.html"`,
    },
  });
}
