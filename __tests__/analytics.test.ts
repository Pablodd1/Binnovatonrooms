import { describe, it, expect } from "vitest";
import { buildAnalytics } from "@/lib/analytics";
import { normalizeReports } from "@/lib/reports";
import { specialtyAliases, normalize } from "@/lib/installer-match";

describe("buildAnalytics", () => {
  const sampleRows = [
    {
      created_at: new Date("2026-06-01").toISOString(),
      tipo_defecto: "grieta",
      severidad: "alta",
      especialista_requerido: "estructurista",
      diagnostico: { confianza: 0.85, urgencia_dias: 5, requiere_revision_humana: true, riesgos: ["structural risk"] },
    },
    {
      created_at: new Date("2026-06-15").toISOString(),
      tipo_defecto: "humedad",
      severidad: "media",
      especialista_requerido: "impermeabilizador",
      diagnostico: { confianza: 0.78, urgencia_dias: 10, requiere_revision_humana: false, riesgos: [] },
    },
  ];

  it("calculates totals correctly", () => {
    const result = buildAnalytics(sampleRows, "supabase");
    expect(result.totalReports).toBe(2);
    expect(result.severeReports).toBe(1);
  });

  it("calculates review rate", () => {
    const result = buildAnalytics(sampleRows, "supabase");
    expect(result.reviewRate).toBe(0.5);
  });

  it("calculates average confidence", () => {
    const result = buildAnalytics(sampleRows, "supabase");
    expect(result.avgConfidence).toBeCloseTo(0.815);
  });

  it("populates severity distribution", () => {
    const result = buildAnalytics(sampleRows, "supabase");
    const alta = result.bySeverity.find((s) => s.label === "alta");
    expect(alta?.count).toBe(1);
  });

  it("returns generatedFrom value", () => {
    const result = buildAnalytics(sampleRows, "supabase");
    expect(result.generatedFrom).toBe("supabase");
  });
});

