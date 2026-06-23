import { describe, it, expect } from "vitest";
import { normalizeReports, demoReports } from "@/lib/reports";

describe("normalizeReports", () => {
  const baseRow = {
    id: "test-001",
    created_at: new Date().toISOString(),
    tipo_defecto: "grieta",
    especialista_requerido: "estructurista",
    location_label: "Sala",
    image_url: null,
  };

  it("maps 'critica' severity to score 100 and 'asignar' status", () => {
    const result = normalizeReports([
      { ...baseRow, severidad: "critica", diagnostico: { requiere_revision_humana: false } },
    ]);
    expect(result[0].riskScore).toBe(100);
    expect(result[0].status).toBe("asignar");
  });

  it("maps 'alta' severity to score 78 and 'revision' status", () => {
    const result = normalizeReports([
      { ...baseRow, severidad: "alta", diagnostico: { requiere_revision_humana: false } },
    ]);
    expect(result[0].riskScore).toBe(78);
    expect(result[0].status).toBe("revision");
  });

  it("maps 'media' severity to score 46 and 'nuevo' status", () => {
    const result = normalizeReports([
      { ...baseRow, severidad: "media", diagnostico: { requiere_revision_humana: false } },
    ]);
    expect(result[0].riskScore).toBe(46);
    expect(result[0].status).toBe("nuevo");
  });

  it("maps 'baja' severity to score 18 and 'nuevo' status", () => {
    const result = normalizeReports([
      { ...baseRow, severidad: "baja", diagnostico: { requiere_revision_humana: false } },
    ]);
    expect(result[0].riskScore).toBe(18);
    expect(result[0].status).toBe("nuevo");
  });

  it("forces 'revision' status if requiere_revision_humana is true regardless of low score", () => {
    const result = normalizeReports([
      { ...baseRow, severidad: "media", diagnostico: { requiere_revision_humana: true } },
    ]);
    expect(result[0].status).toBe("revision");
  });

  it("handles null diagnostico gracefully with defaults", () => {
    const result = normalizeReports([
      { ...baseRow, severidad: "baja", diagnostico: null },
    ]);
    expect(result[0].confidence).toBe(0);
    expect(result[0].urgencyDays).toBe(0);
    expect(result[0].status).toBe("nuevo");
  });
});

describe("demoReports", () => {
  it("returns exactly 3 normalized demo reports with expected IDs", () => {
    const result = demoReports();
    expect(result).toHaveLength(3);
    const ids = result.map((r) => r.id);
    expect(ids).toEqual(["demo-electric-001", "demo-moisture-002", "demo-crack-003"]);
  });
});
