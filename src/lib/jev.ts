import { logger } from "./logger";

/**
 * Jev (TypeSafe System-1) — structured text classification.
 * Used where fast, cheap categorization of short text is worth a model call.
 */

export type ClosedCategory =
  | "reparado"
  | "falso_positivo"
  | "duplicado"
  | "no_aplica"
  | "sin_dato"
  | "otro";

export const CLOSED_CATEGORIES: ClosedCategory[] = [
  "reparado",
  "falso_positivo",
  "duplicado",
  "no_aplica",
  "sin_dato",
  "otro",
];

/** Keyword fallback — always available, zero latency, zero cost. */
export function heuristicClosedCategory(reason: string | null | undefined): ClosedCategory {
  const text = (reason || "").trim();
  if (!text) return "sin_dato";
  const rules: Array<[RegExp, ClosedCategory]> = [
    [/repar|arregl|correg|resuelt|sellad|soldad/i, "reparado"],
    [/falso|no habia|no hab\u00eda|no exist|error de detecci/i, "falso_positivo"],
    [/duplicad|repetid|ya (estaba |se )?(report|registr)/i, "duplicado"],
    [/no aplica|fuera de alcance|no corresponde/i, "no_aplica"],
    [/sin dato|n\/a/i, "sin_dato"],
  ];
  for (const [pattern, category] of rules) {
    if (pattern.test(text)) return category;
  }
  return "otro";
}

/**
 * Classify a report-close reason with Jev System-1.
 * Falls back to keywords when the key is missing, the call fails, or the
 * answer is not a known category. Never throws — closing a report must
 * not fail because of a classifier.
 */
export async function classifyClosedReason(
  reason: string | null | undefined
): Promise<ClosedCategory> {
  const text = (reason || "").trim();
  if (!text) return "sin_dato";

  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) return heuristicClosedCategory(text);

  try {
    const { TypeSafeClient, choice } = await import("@typesafe-ai/sdk");
    const client = new TypeSafeClient({ apiKey, timeout: 5000 });
    const response = await client.systemOne({
      model: process.env.TYPESAFE_MODEL || "jev-latest",
      state: {
        document:
          `Un inspector cerro un reporte de inspeccion de construccion ` +
          `con este motivo en texto libre: "${text}"`,
      },
      questions: {
        category: choice("Cual es la razon de cierre del reporte?", {
          reparado: "El defecto fue reparado o corregido",
          falso_positivo: "El diagnostico era un falso positivo; no habia defecto real",
          duplicado: "Reporte duplicado de otro ya existente",
          no_aplica: "Fuera de alcance o no corresponde a esta inspeccion",
          sin_dato: "El texto no aporta informacion util",
          otro: "Otra razon",
        }),
      },
    });
    const value = response.answers.category.choice;
    if ((CLOSED_CATEGORIES as string[]).includes(value)) {
      return value as ClosedCategory;
    }
    return heuristicClosedCategory(text);
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : "Unknown" },
      "Jev closed-reason classification failed, using keyword fallback"
    );
    return heuristicClosedCategory(text);
  }
}
