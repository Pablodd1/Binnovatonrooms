import { describe, it, expect } from "vitest";
import { normalizeReports, demoReports } from "@/lib/reports";

describe("normalizeReports", () => {
  const baseRow = {
    id: "test-id",
    created_at: "2023-10-10T00:00:00Z",
    tipo_defecto: "grieta",
    severidad: "baja",
    especialista_requerido: "albañil",
    location_label: "Pared norte",
    image_url: "http://example.com/image.png",
    diagnostico: {
      confianza: 0.9,
      urgencia_dias: 5,
      requiere_revision_humana: false
    }
  };

  it("maps fields correctly", () => {
    const result = normalizeReports([baseRow]);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "test-id",
      createdAt: "2023-10-10T00:00:00Z",
      defectType: "grieta",
      severity: "baja",
      specialist: "albañil",
      location: "Pared norte",
      imageUrl: "http://example.com/image.png",
      confidence: 0.9,
      urgencyDays: 5,
      riskScore: 18,
      status: "nuevo"
    });
  });

  it("assigns risk score 100 and status 'asignar' for 'critica' severity", () => {
    const result = normalizeReports([{ ...baseRow, severidad: "critica" }]);
    expect(result[0].riskScore).toBe(100);
    expect(result[0].status).toBe("asignar");
  });

  it("assigns risk score 78 and status 'revision' for 'alta' severity", () => {
    const result = normalizeReports([{ ...baseRow, severidad: "alta" }]);
    expect(result[0].riskScore).toBe(78);
    expect(result[0].status).toBe("revision");
  });

  it("assigns risk score 46 and status 'nuevo' for 'media' severity", () => {
    const result = normalizeReports([{ ...baseRow, severidad: "media" }]);
    expect(result[0].riskScore).toBe(46);
    expect(result[0].status).toBe("nuevo");
  });

  it("assigns risk score 18 and status 'nuevo' for 'baja' severity", () => {
    const result = normalizeReports([{ ...baseRow, severidad: "baja" }]);
    expect(result[0].riskScore).toBe(18);
    expect(result[0].status).toBe("nuevo");
  });

  it("assigns risk score 18 for unknown severity", () => {
    const result = normalizeReports([{ ...baseRow, severidad: "desconocido" }]);
    expect(result[0].riskScore).toBe(18);
  });

  it("assigns status 'revision' when requiere_revision_humana is true regardless of score < 78", () => {
    const result = normalizeReports([
      {
        ...baseRow,
        severidad: "baja",
        diagnostico: { ...baseRow.diagnostico, requiere_revision_humana: true }
      }
    ]);
    expect(result[0].status).toBe("revision");
  });

  it("handles null diagnostico, defaulting confidence and urgency to 0", () => {
    const result = normalizeReports([{ ...baseRow, diagnostico: null }]);
    expect(result[0].confidence).toBe(0);
    expect(result[0].urgencyDays).toBe(0);
    expect(result[0].status).toBe("nuevo");
  });
});

describe("demoReports", () => {
  it("returns an array of sample reports", () => {
    const reports = demoReports();
    expect(Array.isArray(reports)).toBe(true);
    expect(reports.length).toBeGreaterThan(0);
  });

  it("contains specific required fields", () => {
    const reports = demoReports();
    reports.forEach(report => {
      expect(report).toHaveProperty('id');
      expect(report).toHaveProperty('createdAt');
      expect(report).toHaveProperty('defectType');
      expect(report).toHaveProperty('severity');
      expect(report).toHaveProperty('riskScore');
      expect(report).toHaveProperty('status');
    });
  });
});
