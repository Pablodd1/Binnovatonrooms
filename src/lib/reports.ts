import type { DefectType, Severity } from "./analysis-schema";

export type ReportSummary = {
  id: string;
  createdAt: string;
  defectType: DefectType | string;
  severity: Severity | string;
  specialist: string;
  location: string | null;
  imageUrl: string | null;
  confidence: number;
  urgencyDays: number;
  riskScore: number;
  status: "nuevo" | "revision" | "asignar" | "cerrado";
};

function riskScore(severity: Severity | string) {
  if (severity === "critica") return 100;
  if (severity === "alta") return 78;
  if (severity === "media") return 46;
  return 18;
}

type ReportRow = {
  id: string;
  created_at: string;
  tipo_defecto: DefectType | string;
  severidad: Severity | string;
  especialista_requerido: string;
  location_label: string | null;
  image_url: string | null;
  diagnostico: {
    confianza?: number;
    urgencia_dias?: number;
    requiere_revision_humana?: boolean;
  } | null;
};

export function normalizeReports(rows: ReportRow[]): ReportSummary[] {
  return rows.map((row) => {
    const score = riskScore(row.severidad);
    const needsReview = row.diagnostico?.requiere_revision_humana || score >= 78;

    return {
      id: row.id,
      createdAt: row.created_at,
      defectType: row.tipo_defecto,
      severity: row.severidad,
      specialist: row.especialista_requerido,
      location: row.location_label,
      imageUrl: row.image_url,
      confidence: row.diagnostico?.confianza ?? 0,
      urgencyDays: row.diagnostico?.urgencia_dias ?? 0,
      riskScore: score,
      status: score === 100 ? "asignar" : needsReview ? "revision" : "nuevo"
    };
  });
}

export function demoReports(): ReportSummary[] {
  const now = Date.now();
  return normalizeReports([
    {
      id: "demo-electric-001",
      created_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      tipo_defecto: "instalacion",
      severidad: "critica",
      especialista_requerido: "electricista",
      location_label: "Cocina - toma GFCI",
      image_url: null,
      diagnostico: { confianza: 0.91, urgencia_dias: 0, requiere_revision_humana: true }
    },
    {
      id: "demo-moisture-002",
      created_at: new Date(now - 20 * 60 * 60 * 1000).toISOString(),
      tipo_defecto: "humedad",
      severidad: "alta",
      especialista_requerido: "impermeabilizador",
      location_label: "Bano principal - pared norte",
      image_url: null,
      diagnostico: { confianza: 0.86, urgencia_dias: 2, requiere_revision_humana: true }
    },
    {
      id: "demo-crack-003",
      created_at: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
      tipo_defecto: "grieta",
      severidad: "media",
      especialista_requerido: "estructurista",
      location_label: "Sala - columna lateral",
      image_url: null,
      diagnostico: { confianza: 0.78, urgencia_dias: 14, requiere_revision_humana: true }
    }
  ]);
}
