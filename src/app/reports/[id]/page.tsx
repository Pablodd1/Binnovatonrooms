"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { InspectionDiagnosis, InstallerMatch } from "@/lib/analysis-schema";

type ReportImage = {
  id: string;
  sort_order: number;
  image_url: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  quality: unknown;
};

type ReportData = {
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
  report_images: ReportImage[];
};

const SEVERITY_LABELS: Record<string, string> = {
  critica: "Critica",
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

export default function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await fetch(`/api/reports?id=${id}`);
        const data = await res.json();
        setReport(data.report || null);
        if (!data.report) setError("Reporte no encontrado");
      } catch {
        setError("Error al cargar el reporte");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function handleDownloadPdf() {
    if (!id) return;
    setDownloadingPdf(true);
    try {
      const res = await fetch(`/api/reports/${id}/pdf`);
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `buildscan-report-${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("No se pudo generar el PDF");
    } finally {
      setDownloadingPdf(false);
    }
  }

  function severityClass(sev: string) {
    if (sev === "critica") return "critica";
    if (sev === "alta") return "alta";
    if (sev === "media") return "media";
    return "baja";
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("es-ES", {
      year: "numeric", month: "long", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  if (loading) return <div className="shell"><p>Cargando reporte...</p></div>;
  if (error) return <div className="shell"><p style={{ color: "var(--red)" }}>{error}</p></div>;
  if (!report) return null;

  const diag = report.diagnostico;

  return (
    <div className="shell">
      <div className="topbar">
        <div>
          <p className="eyebrow">BuildScan AI</p>
          <h1>Detalle de Inspeccion</h1>
        </div>
        <div className="top-actions">
          <Link href="/reports" style={{ textDecoration: "none" }}>
            <button type="button">&#9664; Historial</button>
          </Link>
          <Link href="/" style={{ textDecoration: "none" }}>
            <button type="button">Inspector</button>
          </Link>
        </div>
      </div>

      {/* Report Header */}
      <div className={`report-detail-header severity-border-${severityClass(report.severidad)}`}>
        <div className="report-detail-meta">
          <span className={`severity ${severityClass(report.severidad)}`}>
            {SEVERITY_LABELS[report.severidad] || report.severidad}
          </span>
          <span>{report.tipo_defecto}</span>
          <span className="muted-text">{formatDate(report.created_at)}</span>
        </div>
        {report.location_label && <h2>{report.location_label}</h2>}
        <div className="report-detail-actions">
          <button type="button" onClick={handleDownloadPdf} disabled={downloadingPdf}>
            {downloadingPdf ? "Generando PDF..." : "Descargar PDF"}
          </button>
        </div>
      </div>

      <div className="report-detail-grid">
        {/* Images */}
        <div className="report-detail-section">
          <h3>Imagenes de Evidencia</h3>
          <div className="report-detail-images">
            {report.report_images?.map((img, i) => (
              <div key={img.id} className="report-image-container">
                {img.image_url ? (
                  <>
                    <img src={img.image_url} alt={`Imagen ${i + 1}`} />
                    {diag?.visual_indicators?.filter((_, idx) => idx < (i === 0 ? 8 : 0)).map((m, mi) => (
                      <div
                        key={mi}
                        className="evidence-marker"
                        style={{
                          left: `${m.x}%`, top: `${m.y}%`,
                          width: `${m.width}%`, height: `${m.height}%`,
                        }}
                      >
                        <span className="marker-label">{m.label}</span>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="report-image-placeholder">Sin imagen</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Diagnosis */}
        {diag && (
          <div className="report-detail-section">
            <h3>Diagnostico</h3>
            <div className="detail-field">
              <span className="muted-text">Ubicacion del defecto</span>
              <p>{diag.ubicacion}</p>
            </div>
            <div className="detail-field">
              <span className="muted-text">Causa probable</span>
              <p>{diag.causa_probable}</p>
            </div>
            <div className="detail-field">
              <span className="muted-text">Confianza</span>
              <div className="confidence-bar">
                <div className="confidence-fill" style={{ width: `${Math.round(diag.confianza * 100)}%` }} />
                <span>{Math.round(diag.confianza * 100)}%</span>
              </div>
            </div>
            <div className="detail-field">
              <span className="muted-text">Urgencia</span>
              <p>{diag.urgencia_dias === 0 ? "Inmediata" : `${diag.urgencia_dias} dias`}</p>
            </div>
            {diag.requiere_revision_humana && (
              <div className="detail-field">
                <span className="muted-text">Revision humana</span>
                <p style={{ color: "var(--yellow)" }}>Requerida</p>
              </div>
            )}

            {diag.riesgos.length > 0 && (
              <div className="detail-field">
                <span className="muted-text">Riesgos</span>
                <ul>{diag.riesgos.map((r, i) => <li key={i}>{r}</li>)}</ul>
              </div>
            )}

            {diag.solucion_paso_a_paso.length > 0 && (
              <div className="detail-field">
                <span className="muted-text">Plan de accion</span>
                <ol>{diag.solucion_paso_a_paso.map((s, i) => <li key={i}>{s}</li>)}</ol>
              </div>
            )}

            {diag.mediciones_recomendadas.length > 0 && (
              <div className="detail-field">
                <span className="muted-text">Mediciones recomendadas</span>
                <ul>{diag.mediciones_recomendadas.map((m, i) => <li key={i}>{m}</li>)}</ul>
              </div>
            )}
          </div>
        )}

        {/* Metadata */}
        <div className="report-detail-section">
          <h3>Metadatos</h3>
          <div className="detail-field">
            <span className="muted-text">Especialista requerido</span>
            <p>{report.especialista_requerido}</p>
          </div>
          {report.camera_label && (
            <div className="detail-field">
              <span className="muted-text">Camara</span>
              <p>{report.camera_label}</p>
            </div>
          )}
          {report.lat && report.lng && (
            <div className="detail-field">
              <span className="muted-text">Coordenadas</span>
              <p>{Number(report.lat).toFixed(4)}, {Number(report.lng).toFixed(4)}</p>
            </div>
          )}
          <div className="detail-field">
            <span className="muted-text">ID del reporte</span>
            <p className="muted-text" style={{ fontSize: "0.8rem", wordBreak: "break-all" }}>{report.id}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
