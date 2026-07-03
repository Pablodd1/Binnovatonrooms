import { describe, it, expect } from "vitest";
import { demoAnalytics } from "@/lib/analytics";
import { demoReports } from "@/lib/reports";

describe("demoAnalytics", () => {
  it("returns valid analytics structure", () => {
    const result = demoAnalytics();
    expect(result.totalReports).toBeGreaterThan(0);
    expect(result.bySeverity.length).toBeGreaterThan(0);
    expect(result.byDefect.length).toBeGreaterThan(0);
    expect(result.weeklyTrend.length).toBeGreaterThan(0);
    expect(result.generatedFrom).toBe("demo");
  });

  it("has severe reports", () => {
    const result = demoAnalytics();
    expect(result.severeReports).toBeGreaterThan(0);
  });
});

describe("demoReports", () => {
  it("returns valid report summaries", () => {
    const result = demoReports();
    expect(result.length).toBe(4);
    expect(result[0].id).toBeDefined();
    expect(result[0].riskScore).toBeGreaterThan(0);
  });
});