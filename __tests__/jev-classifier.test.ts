import { describe, it, expect, afterEach } from "vitest";
import {
  heuristicClosedCategory,
  classifyClosedReason,
  CLOSED_CATEGORIES,
} from "@/lib/jev";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("heuristicClosedCategory", () => {
  it("returns sin_dato for empty or missing reasons", () => {
    expect(heuristicClosedCategory("")).toBe("sin_dato");
    expect(heuristicClosedCategory(null)).toBe("sin_dato");
    expect(heuristicClosedCategory(undefined)).toBe("sin_dato");
    expect(heuristicClosedCategory("   ")).toBe("sin_dato");
  });

  it("detects repair reasons", () => {
    expect(heuristicClosedCategory("El muro fue reparado")).toBe("reparado");
    expect(heuristicClosedCategory("se arreglo la grieta")).toBe("reparado");
    expect(heuristicClosedCategory("problema corregido por el contratista")).toBe("reparado");
  });

  it("detects false positives", () => {
    expect(heuristicClosedCategory("era un falso positivo, era una sombra")).toBe("falso_positivo");
    expect(heuristicClosedCategory("no habia nada, error de deteccion")).toBe("falso_positivo");
  });

  it("detects duplicates", () => {
    expect(heuristicClosedCategory("reporte duplicado del #12")).toBe("duplicado");
    expect(heuristicClosedCategory("ya estaba reportado antes")).toBe("duplicado");
  });

  it("detects out-of-scope", () => {
    expect(heuristicClosedCategory("no aplica a esta inspeccion")).toBe("no_aplica");
    expect(heuristicClosedCategory("fuera de alcance del contrato")).toBe("no_aplica");
  });

  it("falls back to otro for unmatched text", () => {
    expect(heuristicClosedCategory("el cliente decidio esperar")).toBe("otro");
  });
});

describe("classifyClosedReason", () => {
  it("returns sin_dato without calling Jev when reason is empty", async () => {
    delete process.env.TYPESAFE_API_KEY;
    await expect(classifyClosedReason("")).resolves.toBe("sin_dato");
    await expect(classifyClosedReason(null)).resolves.toBe("sin_dato");
  });

  it("uses keyword fallback when TYPESAFE_API_KEY is not set", async () => {
    delete process.env.TYPESAFE_API_KEY;
    await expect(classifyClosedReason("reparado ayer")).resolves.toBe("reparado");
  });

  it("falls back to keywords when the Jev call fails (bad key)", async () => {
    process.env.TYPESAFE_API_KEY = "invalid-key-for-test";
    await expect(classifyClosedReason("grieta reparada")).resolves.toBe("reparado");
  }, 15000);

  it("classifies with Jev when the key is valid", async () => {
    const key = process.env.TYPESAFE_API_KEY_REAL; // set locally when live-testing
    if (!key) return; // skip in CI — heuristic coverage above is the gate
    process.env.TYPESAFE_API_KEY = key;
    const result = await classifyClosedReason("El electricista reparo la instalacion hoy");
    expect(CLOSED_CATEGORIES).toContain(result);
    expect(result).toBe("reparado");
  }, 15000);
});
