export const defectTypes = [
  "grieta",
  "humedad",
  "oxido",
  "desplome",
  "instalacion",
  "acabado",
  "otro"
] as const;

export const severities = ["baja", "media", "alta", "critica"] as const;

export type DefectType = (typeof defectTypes)[number];
export type Severity = (typeof severities)[number];
export type DetailLevel = "standard" | "detailed" | "forensic";

export type InspectionDiagnosis = {
  outcome?: "defect_detected" | "no_visible_defect" | "insufficient_evidence";
  tipo_defecto: DefectType;
  severidad: Severity;
  ubicacion: string;
  causa_probable: string;
  solucion_paso_a_paso: string[];
  urgencia_dias: number;
  especialista_requerido: string;
  mediciones_recomendadas: string[];
  riesgos: string[];
  confianza: number;
  evidencia_visual: string[];
  visual_indicators: Array<{
    image_index?: number; // 1-based; absent only in legacy reports
    label: string;
    confidence: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  requiere_revision_humana: boolean;
  analysis_metadata?: {
    detail_level: DetailLevel;
    image_count: number;
    analysis_pass: number;
    processing_time_ms?: number;
    total_defects_found?: number;
    review_completed?: boolean;
    warnings?: string[];
    micro_defects_detected?: string[];
    surface_conditions?: string[];
    environmental_factors?: string[];
  };
};

export type InstallerMatch = {
  id: string;
  nombre: string;
  empresa: string | null;
  especialidades: string[];
  ciudad: string | null;
  estado: string | null;
  rating: number | null;
  distancia_km?: number | null;
  telefono: string | null;
  email: string | null;
};

export const inspectionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "outcome",
    "tipo_defecto",
    "severidad",
    "ubicacion",
    "causa_probable",
    "solucion_paso_a_paso",
    "urgencia_dias",
    "especialista_requerido",
    "mediciones_recomendadas",
    "riesgos",
    "confianza",
    "evidencia_visual",
    "visual_indicators",
    "requiere_revision_humana"
  ],
  properties: {
    outcome: { type: "string", enum: ["defect_detected", "no_visible_defect", "insufficient_evidence"] },
    tipo_defecto: { type: "string", enum: defectTypes },
    severidad: { type: "string", enum: severities },
    ubicacion: { type: "string" },
    causa_probable: { type: "string" },
    solucion_paso_a_paso: {
      type: "array",
      minItems: 0,
      maxItems: 8,
      items: { type: "string" }
    },
    urgencia_dias: { type: "integer", minimum: 0, maximum: 365 },
    especialista_requerido: { type: "string" },
    mediciones_recomendadas: {
      type: "array",
      minItems: 0,
      maxItems: 6,
      items: { type: "string" }
    },
    riesgos: {
      type: "array",
      minItems: 0,
      maxItems: 6,
      items: { type: "string" }
    },
    confianza: { type: "number", minimum: 0, maximum: 1 },
    evidencia_visual: {
      type: "array",
      minItems: 0,
      maxItems: 12,
      items: { type: "string" }
    },
    visual_indicators: {
      type: "array",
      minItems: 0,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["image_index", "label", "confidence", "x", "y", "width", "height"],
        properties: {
          image_index: { type: "integer", minimum: 1, maximum: 6 },
          label: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          x: { type: "number", minimum: 0, maximum: 100 },
          y: { type: "number", minimum: 0, maximum: 100 },
          width: { type: "number", minimum: 1, maximum: 100 },
          height: { type: "number", minimum: 1, maximum: 100 }
        }
      }
    },
    requiere_revision_humana: { type: "boolean" }
  }
} as const;
