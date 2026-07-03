import { test, expect } from "@playwright/test";

test.describe("BuildScan AI - Smoke Tests", () => {
  test("health endpoint returns ok", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty("ok");
    expect(body).toHaveProperty("geminiConfigured");
    expect(body).toHaveProperty("supabaseConfigured");
    expect(body).toHaveProperty("timestamp");
  });

  test("homepage loads and displays title", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("text=BuildScan AI")).toBeVisible();
  });

  test("homepage shows KPI dashboard", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Reportes")).toBeVisible();
    await expect(page.locator("text=Confianza media")).toBeVisible();
    await expect(page.locator("text=Revision humana")).toBeVisible();
    await expect(page.locator("text=Urgencia media")).toBeVisible();
  });

  test("analytics endpoint returns data", async ({ request }) => {
    const response = await request.get("/api/analytics");
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty("totalReports");
    expect(body).toHaveProperty("byDefect");
    expect(body).toHaveProperty("bySeverity");
    expect(body).toHaveProperty("weeklyTrend");
  });

  test("reports endpoint returns data", async ({ request }) => {
    const response = await request.get("/api/reports");
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty("reports");
    expect(body).toHaveProperty("generatedFrom");
  });

  test("homepage shows camera device selector", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("select")).toBeVisible();
  });

  test("homepage shows analytics panels", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Distribución de defectos")).toBeVisible();
    await expect(page.locator("text=Tendencia semanal")).toBeVisible();
    await expect(page.locator("text=Pistas operativas")).toBeVisible();
  });
});