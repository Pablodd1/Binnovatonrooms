import { describe, it, expect } from "vitest";
import {
  analyzeRequestSchema,
  diagnosisSchema,
  installersMatchRequestSchema,
  analyticsQuerySchema,
  reportsQuerySchema,
  statusUpdateSchema,
  validateRequest,
} from "@/lib/validation";

describe("analyzeRequestSchema", () => {
  it("accepts empty object", () => {
    expect(analyzeRequestSchema.safeParse({}).success).toBe(true);
  });

  it("coerces lat/lng from strings", () => {
    const result = analyzeRequestSchema.safeParse({ lat: "45.5", lng: "-80.1" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lat).toBe(45.5);
      expect(result.data.lng).toBe(-80.1);
    }
  });

  it("rejects lat out of range", () => {
    expect(analyzeRequestSchema.safeParse({ lat: 200 }).success).toBe(false);
    expect(analyzeRequestSchema.safeParse({ lat: -91 }).success).toBe(false);
  });

  it("rejects lng out of range", () => {
    expect(analyzeRequestSchema.safeParse({ lng: 200 }).success).toBe(false);
    expect(analyzeRequestSchema.safeParse({ lng: -181 }).success).toBe(false);
  });

  it("enforces max length on text fields", () => {
    expect(analyzeRequestSchema.safeParse({ cameraLabel: "x".repeat(161) }).success).toBe(false);
    expect(analyzeRequestSchema.safeParse({ cameraLabel: "x".repeat(160) }).success).toBe(true);
  });
});

describe("diagnosisSchema", () => {
  const validDiag = {
    tipo_defecto: "grieta",
    severidad: "media",
    ubicacion: "Pared norte",
    causa_probable: "Asentamiento",
    solucion_paso_a_paso: ["Paso 1"],
    urgencia_dias: 7,
    especialista_requerido: "estructurista",
    mediciones_recomendadas: ["Medir 1m"],
    riesgos: ["Riesgo x"],
    confianza: 0.8,
    evidencia_visual: ["Grieta visible"],
    visual_indicators: [{
      label: "Grieta",
      confidence: 0.9,
      x: 10, y: 20, width: 30, height: 40,
    }],
    requiere_revision_humana: false,
  };

  it("accepts valid diagnosis", () => {
    expect(diagnosisSchema.safeParse(validDiag).success).toBe(true);
  });

  it("rejects invalid defect type", () => {
    expect(diagnosisSchema.safeParse({ ...validDiag, tipo_defecto: "invalid_type" }).success).toBe(false);
  });

  it("rejects invalid severity", () => {
    expect(diagnosisSchema.safeParse({ ...validDiag, severidad: "extrema" }).success).toBe(false);
  });

  it("rejects confidence > 1", () => {
    expect(diagnosisSchema.safeParse({ ...validDiag, confianza: 1.5 }).success).toBe(false);
  });

  it("rejects confidence < 0", () => {
    expect(diagnosisSchema.safeParse({ ...validDiag, confianza: -0.1 }).success).toBe(false);
  });

  it("rejects urgencia_dias > 365", () => {
    expect(diagnosisSchema.safeParse({ ...validDiag, urgencia_dias: 400 }).success).toBe(false);
  });

  it("rejects visual_indicator x out of range", () => {
    const bad = { ...validDiag, visual_indicators: [{ ...validDiag.visual_indicators[0], x: 150 }] };
    expect(diagnosisSchema.safeParse(bad).success).toBe(false);
  });
});

describe("statusUpdateSchema (Tier 2 workflow)", () => {
  it("accepts revision status", () => {
    expect(statusUpdateSchema.safeParse({ status: "revision" }).success).toBe(true);
  });

  it("accepts asignar status", () => {
    expect(statusUpdateSchema.safeParse({ status: "asignar" }).success).toBe(true);
  });

  it("accepts cerrado status with closedReason", () => {
    expect(statusUpdateSchema.safeParse({ status: "cerrado", closedReason: "Reparado" }).success).toBe(true);
  });

  it("rejects nuevo status (cannot set nuevo via PATCH)", () => {
    expect(statusUpdateSchema.safeParse({ status: "nuevo" }).success).toBe(false);
  });

  it("rejects invalid status", () => {
    expect(statusUpdateSchema.safeParse({ status: "invalid" }).success).toBe(false);
  });

  it("rejects closedReason over 500 chars", () => {
    expect(statusUpdateSchema.safeParse({ status: "cerrado", closedReason: "x".repeat(501) }).success).toBe(false);
  });
});

describe("reportsQuerySchema", () => {
  it("accepts valid status filter", () => {
    expect(reportsQuerySchema.safeParse({ status: "cerrado" }).success).toBe(true);
  });

  it("rejects invalid status", () => {
    expect(reportsQuerySchema.safeParse({ status: "pending" }).success).toBe(false);
  });

  it("clamps limit to 1-100", () => {
    expect(reportsQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(reportsQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(reportsQuerySchema.safeParse({ limit: 50 }).success).toBe(true);
  });
});

describe("analyticsQuerySchema", () => {
  it("accepts empty object", () => {
    expect(analyticsQuerySchema.safeParse({}).success).toBe(true);
  });

  it("accepts valid days range", () => {
    expect(analyticsQuerySchema.safeParse({ days: 30 }).success).toBe(true);
  });

  it("rejects days > 365", () => {
    expect(analyticsQuerySchema.safeParse({ days: 400 }).success).toBe(false);
  });
});

describe("installersMatchRequestSchema", () => {
  it("accepts valid diagnosis with coords", () => {
    const valid = {
      diagnosis: {
        tipo_defecto: "grieta",
        severidad: "alta",
        ubicacion: "x",
        causa_probable: "x",
        solucion_paso_a_paso: ["x"],
        urgencia_dias: 5,
        especialista_requerido: "estructurista",
        mediciones_recomendadas: ["x"],
        riesgos: ["x"],
        confianza: 0.8,
        evidencia_visual: ["x"],
        visual_indicators: [],
        requiere_revision_humana: true,
      },
      lat: 25.7,
      lng: -80.2,
    };
    expect(installersMatchRequestSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects lat out of range", () => {
    expect(installersMatchRequestSchema.safeParse({ diagnosis: {}, lat: 999 }).success).toBe(false);
  });
});

describe("validateRequest", () => {
  it("returns parsed data on success", () => {
    const result = validateRequest(analyzeRequestSchema, { cameraLabel: "Test" });
    expect(result.cameraLabel).toBe("Test");
  });

  it("throws on validation failure", () => {
    expect(() => validateRequest(analyzeRequestSchema, { lat: 999 })).toThrow(/Validation failed/);
  });
});
