import { describe, it, expect } from "vitest";
import { demoAnalytics } from "@/lib/analytics";

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
