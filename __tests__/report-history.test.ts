import { describe, it, expect } from "vitest";
import { buildDefectHistory } from "@/lib/report-history";
import type { ReportSummary } from "@/lib/reports";

function report(overrides: Partial<ReportSummary> & { id: string }): ReportSummary {
  return {
    createdAt: "2026-01-01T10:00:00Z",
    defectType: "grieta",
    severity: "media",
    specialist: "estructurista",
    location: "Pared norte",
    imageUrl: null,
    confidence: 0.8,
    urgencyDays: 10,
    riskScore: 46,
    status: "nuevo",
    closedReason: null,
    closedAt: null,
    ...overrides,
  };
}

describe("buildDefectHistory", () => {
  it("orders points oldest to newest and flags the current report", () => {
    const reports = [
      report({ id: "b", createdAt: "2026-02-01T10:00:00Z" }),
      report({ id: "a", createdAt: "2026-01-01T10:00:00Z", confidence: 0.7 }),
      report({ id: "c", createdAt: "2026-03-01T10:00:00Z", confidence: 0.85 }),
    ];
    const h = buildDefectHistory(reports, { id: "c" });
    expect(h.points.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(h.points.find((p) => p.id === "c")?.isCurrent).toBe(true);
  });

  it("filters to the same normalized location (case/spacing insensitive)", () => {
    const reports = [
      report({ id: "same-1", location: "Pared Norte" }),
      report({ id: "same-2", location: "  pared   norte " }),
      report({ id: "other", location: "Bano sur" }),
      report({ id: "current", location: "PARED NORTE", createdAt: "2026-04-01T10:00:00Z" }),
    ];
    const h = buildDefectHistory(reports, { id: "current" });
    expect(h.points.map((p) => p.id)).toEqual(["same-1", "same-2", "current"]);
    expect(h.previous?.id).toBe("same-2");
  });

  it("falls back to same defect type when location is unknown on both sides", () => {
    const reports = [
      report({ id: "g1", location: null, defectType: "grieta" }),
      report({ id: "h1", location: null, defectType: "humedad" }),
      report({ id: "g2", location: null, defectType: "grieta", createdAt: "2026-02-01T10:00:00Z" }),
    ];
    const h = buildDefectHistory(reports, { id: "g2" });
    expect(h.points.map((p) => p.id)).toEqual(["g1", "g2"]);
  });

  it("computes confidence delta in percentage points vs previous visit", () => {
    const reports = [
      report({ id: "old", confidence: 0.7, createdAt: "2026-01-01T10:00:00Z" }),
      report({ id: "cur", confidence: 0.85, createdAt: "2026-02-01T10:00:00Z" }),
    ];
    const h = buildDefectHistory(reports, { id: "cur" });
    expect(h.confidenceDelta).toBe(15);
  });

  it("detects severity escalation between visits", () => {
    const reports = [
      report({ id: "old", severity: "media", createdAt: "2026-01-01T10:00:00Z" }),
      report({ id: "cur", severity: "alta", createdAt: "2026-02-01T10:00:00Z" }),
    ];
    const h = buildDefectHistory(reports, { id: "cur" });
    expect(h.severityChanged).toBe(true);
  });

  it("returns empty history for a lone report", () => {
    const h = buildDefectHistory([report({ id: "only" })], { id: "only" });
    expect(h.points).toHaveLength(1);
    expect(h.previous).toBeNull();
    expect(h.confidenceDelta).toBeNull();
    expect(h.severityChanged).toBe(false);
  });
});
