import type { DefectType, Severity } from "./analysis-schema";

export type ReportStatus = "nuevo" | "revision" | "asignar" | "cerrado";

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
  status: ReportStatus;
  closedReason: string | null;
  closedAt: string | null;
};

export const STATUS_LABELS: Record<ReportStatus, string> = {
  nuevo: "Nuevo",
  revision: "En revision",
  asignar: "Asignado",
  cerrado: "Cerrado",
};

/** Valid status transitions for workflow enforcement */
export const VALID_TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  nuevo: ["revision", "cerrado"],
  revision: ["asignar", "cerrado"],
  asignar: ["cerrado"],
  cerrado: [],
};

export function isValidTransition(current: ReportStatus, next: ReportStatus): boolean {
  return VALID_TRANSITIONS[current]?.includes(next) ?? false;
}

function riskScore(severity: Severity | string) {
  if (severity === "critica") return 100;
  if (severity === "alta") return 78;
  if (severity === "media") return 46;
  return 18;
}

/** Compute initial status from severity for new reports */
function initialStatus(severity: Severity | string, needsReview: boolean): ReportStatus {
  if (severity === "critica") return "asignar";
  if (severity === "alta" || needsReview) return "revision";
  return "nuevo";
}

type ReportRow = {
  id: string;
  created_at: string;
  tipo_defecto: DefectType | string;
  severidad: Severity | string;
  especialista_requerido: string;
  location_label: string | null;
  image_url: string | null;
  status: string | null;
  closed_reason: string | null;
  closed_at: string | null;
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
      status: (row.status as ReportStatus) || initialStatus(row.severidad, needsReview),
      closedReason: row.closed_reason || null,
      closedAt: row.closed_at || null,
    };
  });
}

export function demoReports(): ReportSummary[] {
  const now = Date.now();
  return [
    {
      id: "demo-electric-001",
      createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      defectType: "instalacion",
      severity: "critica",
      specialist: "electricista",
      location: "Cocina - toma GFCI",
      imageUrl: null,
      confidence: 0.91,
      urgencyDays: 0,
      riskScore: 100,
      status: "asignar",
      closedReason: null,
      closedAt: null,
    },
    {
      id: "demo-moisture-002",
      createdAt: new Date(now - 20 * 60 * 60 * 1000).toISOString(),
      defectType: "humedad",
      severity: "alta",
      specialist: "impermeabilizador",
      location: "Bano principal - pared norte",
      imageUrl: null,
      confidence: 0.86,
      urgencyDays: 2,
      riskScore: 78,
      status: "revision",
      closedReason: null,
      closedAt: null,
    },
    {
      id: "demo-crack-003",
      createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
      defectType: "grieta",
      severity: "media",
      specialist: "estructurista",
      location: "Sala - columna lateral",
      imageUrl: null,
      confidence: 0.78,
      urgencyDays: 14,
      riskScore: 46,
      status: "cerrado",
      closedReason: "Reparado por estructurista",
      closedAt: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "demo-finish-004",
      createdAt: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
      defectType: "acabado",
      severity: "baja",
      specialist: "pintor",
      location: "Dormitorio principal - pared este",
      imageUrl: null,
      confidence: 0.65,
      urgencyDays: 30,
      riskScore: 18,
      status: "nuevo",
      closedReason: null,
      closedAt: null,
    },
  ];
}
