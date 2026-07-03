import type { DefectType, Severity } from "./analysis-schema";

export type AnalyticsBucket = {
  label: string;
  count: number;
};

export type WeeklyTrend = {
  week: string;
  total: number;
  critical: number;
};

export type InspectionAnalytics = {
  totalReports: number;
  severeReports: number;
  reviewRate: number;
  avgConfidence: number;
  avgUrgencyDays: number;
  bySeverity: AnalyticsBucket[];
  byDefect: AnalyticsBucket[];
  bySpecialist: AnalyticsBucket[];
  weeklyTrend: WeeklyTrend[];
  recentSignals: string[];
  generatedFrom: "supabase" | "demo";
};

export type ReportRow = {
  created_at: string;
  tipo_defecto: DefectType | string;
  severidad: Severity | string;
  especialista_requerido: string;
  diagnostico: {
    confianza?: number;
    urgencia_dias?: number;
    requiere_revision_humana?: boolean;
    riesgos?: string[];
  } | null;
};

const severityOrder = ["critica", "alta", "media", "baja"];

function increment(map: Map<string, number>, key: string) {
  map.set(key || "sin dato", (map.get(key || "sin dato") || 0) + 1);
}

function toBuckets(map: Map<string, number>, order?: string[]) {
  const rows = [...map.entries()].map(([label, count]) => ({ label, count }));
  if (order) {
    return rows.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
  }
  return rows.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 8);
}

function weekKey(dateString: string) {
  const date = new Date(dateString);
  const monday = new Date(date);
  const day = monday.getUTCDay() || 7;
  monday.setUTCDate(monday.getUTCDate() - day + 1);
  return monday.toISOString().slice(0, 10);
}

export function buildAnalytics(rows: ReportRow[], generatedFrom: "supabase" | "demo"): InspectionAnalytics {
  const severityMap = new Map<string, number>();
  const defectMap = new Map<string, number>();
  const specialistMap = new Map<string, number>();
  const weeklyMap = new Map<string, WeeklyTrend>();
  let confidenceTotal = 0;
  let confidenceCount = 0;
  let urgencyTotal = 0;
  let urgencyCount = 0;
  let severeReports = 0;
  let humanReview = 0;
  const signals: string[] = [];

  rows.forEach((row) => {
    increment(severityMap, row.severidad);
    increment(defectMap, row.tipo_defecto);
    increment(specialistMap, row.especialista_requerido);

    if (row.severidad === "alta" || row.severidad === "critica") severeReports += 1;
    if (row.diagnostico?.requiere_revision_humana) humanReview += 1;
    if (typeof row.diagnostico?.confianza === "number") {
      confidenceTotal += row.diagnostico.confianza;
      confidenceCount += 1;
    }
    if (typeof row.diagnostico?.urgencia_dias === "number") {
      urgencyTotal += row.diagnostico.urgencia_dias;
      urgencyCount += 1;
    }

    const week = weekKey(row.created_at);
    const current = weeklyMap.get(week) || { week, total: 0, critical: 0 };
    current.total += 1;
    if (row.severidad === "critica") current.critical += 1;
    weeklyMap.set(week, current);

    row.diagnostico?.riesgos?.slice(0, 1).forEach((risk) => signals.push(risk));
  });

  return {
    totalReports: rows.length,
    severeReports,
    reviewRate: rows.length ? humanReview / rows.length : 0,
    avgConfidence: confidenceCount ? confidenceTotal / confidenceCount : 0,
    avgUrgencyDays: urgencyCount ? urgencyTotal / urgencyCount : 0,
    bySeverity: toBuckets(severityMap, severityOrder),
    byDefect: toBuckets(defectMap),
    bySpecialist: toBuckets(specialistMap),
    weeklyTrend: [...weeklyMap.values()].sort((a, b) => a.week.localeCompare(b.week)).slice(-8),
    recentSignals: [...new Set(signals)].slice(0, 6),
    generatedFrom
  };
}

export function demoAnalytics(): InspectionAnalytics {
  const now = Date.now();
  const rows: ReportRow[] = [
    ["humedad", "alta", "impermeabilizador", 0.86, 2, true, "Humedad oculta posible; verificar con termografia."],
    ["grieta", "media", "estructurista", 0.78, 14, true, "Monitorear crecimiento de grieta antes de reparar."],
    ["instalacion", "critica", "electricista", 0.91, 0, true, "Riesgo electrico; cortar energia antes de intervenir."],
    ["acabado", "baja", "pintor", 0.82, 30, false, "Defecto cosmetico con baja urgencia."],
    ["oxido", "media", "herrero", 0.73, 10, false, "Corrosion superficial; medir avance y humedad."],
    ["desplome", "alta", "estructurista", 0.84, 1, true, "Posible desviacion de plano; confirmar con nivel laser."]
  ].map(([tipo, severidad, especialista, confianza, urgencia, revision, riesgo], index) => ({
    created_at: new Date(now - index * 4 * 24 * 60 * 60 * 1000).toISOString(),
    tipo_defecto: tipo as string,
    severidad: severidad as string,
    especialista_requerido: especialista as string,
    diagnostico: {
      confianza: confianza as number,
      urgencia_dias: urgencia as number,
      requiere_revision_humana: revision as boolean,
      riesgos: [riesgo as string]
    }
  }));

  return buildAnalytics(rows, "demo");
}

// Heatmap data aggregation

export type HeatmapPoint = {
  x: number;
  y: number;
  defectType: string;
  severity: string;
  label: string;
  confidence: number;
};

export type HeatmapData = {
  points: HeatmapPoint[];
  totalDefects: number;
};

export function buildHeatmapData(rows: ReportRow[]): HeatmapData {
  const points: HeatmapPoint[] = [];
  const severityWeight: Record<string, number> = { critica: 4, alta: 3, media: 2, baja: 1 };

  for (const row of rows) {
    const diag = row.diagnostico as {
      visual_indicators?: Array<{
        label: string;
        confidence: number;
        x: number;
        y: number;
        width: number;
        height: number;
      }>;
    } | null;

    if (!diag?.visual_indicators) continue;

    for (const indicator of diag.visual_indicators) {
      points.push({
        x: indicator.x + (indicator.width || 0) / 2,
        y: indicator.y + (indicator.height || 0) / 2,
        defectType: row.tipo_defecto,
        severity: row.severidad,
        label: indicator.label,
        confidence: indicator.confidence,
      });
    }
  }

  // Sort by severity weight then confidence (most severe first)
  points.sort((a, b) =>
    (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0) ||
    b.confidence - a.confidence
  );

  return { points, totalDefects: points.length };
}

export function demoHeatmapData(): HeatmapData {
  return {
    points: [
      { x: 30, y: 45, defectType: "grieta", severity: "alta", label: "grieta longitudinal", confidence: 0.88 },
      { x: 32, y: 48, defectType: "grieta", severity: "alta", label: "grieta ramificacion", confidence: 0.82 },
      { x: 65, y: 30, defectType: "humedad", severity: "media", label: "mancha de humedad", confidence: 0.75 },
      { x: 70, y: 35, defectType: "humedad", severity: "media", label: "eflorescencia", confidence: 0.71 },
      { x: 20, y: 80, defectType: "oxido", severity: "baja", label: "corrosion superficial", confidence: 0.65 },
      { x: 50, y: 60, defectType: "acabado", severity: "baja", label: "desconchado", confidence: 0.60 },
      { x: 80, y: 70, defectType: "grieta", severity: "critica", label: "grieta estructural", confidence: 0.93 },
      { x: 45, y: 20, defectType: "instalacion", severity: "media", label: "exposicion de tuberia", confidence: 0.68 },
    ],
    totalDefects: 8,
  };
}
