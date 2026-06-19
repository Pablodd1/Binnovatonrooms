import { z } from "zod";
import { defectTypes, severities } from "./analysis-schema";

export const analyzeRequestSchema = z.object({
  cameraLabel: z.string().max(160).optional(),
  locationLabel: z.string().max(180).optional(),
  lidarNotes: z.string().max(700).optional(),
  qualityNotes: z.string().max(500).optional(),
  lat: z.coerce.number().min(-90).max(90).nullable().optional(),
  lng: z.coerce.number().min(-180).max(180).nullable().optional(),
});

export const diagnosisSchema = z.object({
  tipo_defecto: z.enum(defectTypes),
  severidad: z.enum(severities),
  ubicacion: z.string(),
  causa_probable: z.string(),
  solucion_paso_a_paso: z.array(z.string()),
  urgencia_dias: z.number().int().min(0).max(365),
  especialista_requerido: z.string(),
  mediciones_recomendadas: z.array(z.string()),
  riesgos: z.array(z.string()),
  confianza: z.number().min(0).max(1),
  evidencia_visual: z.array(z.string()),
  visual_indicators: z.array(
    z.object({
      label: z.string(),
      confidence: z.number().min(0).max(1),
      x: z.number().min(0).max(100),
      y: z.number().min(0).max(100),
      width: z.number().min(1).max(100),
      height: z.number().min(1).max(100),
    })
  ),
  requiere_revision_humana: z.boolean(),
});

export const installersMatchRequestSchema = z.object({
  diagnosis: diagnosisSchema,
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
});

export const analyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
  defectType: z.string().optional(),
  severity: z.string().optional(),
});

export const reportsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(["nuevo", "revision", "asignar", "cerrado"]).optional(),
  severity: z.string().optional(),
});

export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    throw new Error(`Validation failed: ${errors}`);
  }
  return result.data;
}