import { describe, it, expect } from "vitest";
import {
  ReportStatus,
  STATUS_LABELS,
  VALID_TRANSITIONS,
  isValidTransition,
  normalizeReports,
} from "@/lib/reports";

describe("report workflow state machine", () => {
  describe("VALID_TRANSITIONS", () => {
    it("allows nuevo → revision", () => {
      expect(VALID_TRANSITIONS.nuevo).toContain("revision");
    });

    it("allows nuevo → cerrado (direct close)", () => {
      expect(VALID_TRANSITIONS.nuevo).toContain("cerrado");
    });

    it("allows revision → asignar", () => {
      expect(VALID_TRANSITIONS.revision).toContain("asignar");
    });

    it("allows revision → cerrado", () => {
      expect(VALID_TRANSITIONS.revision).toContain("cerrado");
    });

    it("allows asignar → cerrado", () => {
      expect(VALID_TRANSITIONS.asignar).toContain("cerrado");
    });

    it("cerrado is terminal (no transitions)", () => {
      expect(VALID_TRANSITIONS.cerrado).toEqual([]);
    });

    it("does NOT allow skipping (nuevo → asignar)", () => {
      expect(VALID_TRANSITIONS.nuevo).not.toContain("asignar");
    });

    it("does NOT allow reopening (cerrado → nuevo)", () => {
      expect(VALID_TRANSITIONS.cerrado).not.toContain("nuevo");
    });
  });

  describe("isValidTransition", () => {
    const validCases: Array<[ReportStatus, ReportStatus]> = [
      ["nuevo", "revision"],
      ["nuevo", "cerrado"],
      ["revision", "asignar"],
      ["revision", "cerrado"],
      ["asignar", "cerrado"],
    ];

    validCases.forEach(([from, to]) => {
      it(`returns true for ${from} → ${to}`, () => {
        expect(isValidTransition(from, to)).toBe(true);
      });
    });

    const invalidCases: Array<[ReportStatus, ReportStatus]> = [
      ["nuevo", "asignar"],
      ["asignar", "nuevo"],
      ["asignar", "revision"],
      ["revision", "nuevo"],
      ["cerrado", "nuevo"],
      ["cerrado", "revision"],
      ["cerrado", "asignar"],
    ];

    invalidCases.forEach(([from, to]) => {
      it(`returns false for ${from} → ${to}`, () => {
        expect(isValidTransition(from, to)).toBe(false);
      });
    });
  });

  describe("STATUS_LABELS", () => {
    it("has a label for every ReportStatus", () => {
      const statuses: ReportStatus[] = ["nuevo", "revision", "asignar", "cerrado"];
      statuses.forEach((s) => {
        expect(STATUS_LABELS[s]).toBeTruthy();
        expect(typeof STATUS_LABELS[s]).toBe("string");
      });
    });
  });
});

describe("normalizeReports", () => {
  it("uses DB status when present", () => {
    const rows = [{
      id: "r1",
      created_at: new Date().toISOString(),
      tipo_defecto: "grieta",
      severidad: "media",
      especialista_requerido: "estructurista",
      location_label: "Pared norte",
      image_url: null,
      status: "cerrado",
      closed_reason: "Reparado",
      closed_at: new Date().toISOString(),
      diagnostico: { confianza: 0.9, urgencia_dias: 5, requiere_revision_humana: false },
    }];
    const result = normalizeReports(rows);
    expect(result[0].status).toBe("cerrado");
    expect(result[0].closedReason).toBe("Reparado");
    expect(result[0].closedAt).toBeTruthy();
  });

  it("derives status from severity when DB status is null", () => {
    const rows = [{
      id: "r2",
      created_at: new Date().toISOString(),
      tipo_defecto: "instalacion",
      severidad: "critica",
      especialista_requerido: "electricista",
      location_label: null,
      image_url: null,
      status: null,
      closed_reason: null,
      closed_at: null,
      diagnostico: { confianza: 0.85, urgencia_dias: 0, requiere_revision_humana: true },
    }];
    const result = normalizeReports(rows);
    expect(result[0].status).toBe("asignar");
    expect(result[0].closedReason).toBeNull();
  });

  it("returns baja severity as nuevo when no review needed", () => {
    const rows = [{
      id: "r3",
      created_at: new Date().toISOString(),
      tipo_defecto: "acabado",
      severidad: "baja",
      especialista_requerido: "pintor",
      location_label: null,
      image_url: null,
      status: null,
      closed_reason: null,
      closed_at: null,
      diagnostico: { confianza: 0.7, urgencia_dias: 30, requiere_revision_humana: false },
    }];
    const result = normalizeReports(rows);
    expect(result[0].status).toBe("nuevo");
  });

  it("handles empty input", () => {
    expect(normalizeReports([])).toEqual([]);
  });

  it("computes riskScore from severity", () => {
    const rows = [
      { id: "a", created_at: new Date().toISOString(), tipo_defecto: "x", severidad: "critica", especialista_requerido: "x", location_label: null, image_url: null, status: null, closed_reason: null, closed_at: null, diagnostico: null },
      { id: "b", created_at: new Date().toISOString(), tipo_defecto: "x", severidad: "alta", especialista_requerido: "x", location_label: null, image_url: null, status: null, closed_reason: null, closed_at: null, diagnostico: null },
      { id: "c", created_at: new Date().toISOString(), tipo_defecto: "x", severidad: "media", especialista_requerido: "x", location_label: null, image_url: null, status: null, closed_reason: null, closed_at: null, diagnostico: null },
      { id: "d", created_at: new Date().toISOString(), tipo_defecto: "x", severidad: "baja", especialista_requerido: "x", location_label: null, image_url: null, status: null, closed_reason: null, closed_at: null, diagnostico: null },
    ];
    const result = normalizeReports(rows);
    expect(result[0].riskScore).toBe(100);
    expect(result[1].riskScore).toBe(78);
    expect(result[2].riskScore).toBe(46);
    expect(result[3].riskScore).toBe(18);
  });
});
