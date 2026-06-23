import { describe, it, expect } from "vitest";
import { normalize, specialtyAliases } from "@/lib/installer-match";

describe("normalize", () => {
  it("converts strings to lowercase and trims whitespace", () => {
    expect(normalize(" Electricista ")).toBe("electricista");
    expect(normalize("PLOMERO")).toBe("plomero");
  });

  it("removes diacritics and accents", () => {
    expect(normalize("Álbañíl")).toBe("albanil");
    expect(normalize("mampostería")).toBe("mamposteria");
    expect(normalize("Técnico en Refrigeración")).toBe("tecnico en refrigeracion");
  });

  it("handles mixed case, whitespace, and diacritics together", () => {
    expect(normalize("  PINTÓR   ")).toBe("pintor");
    expect(normalize("    Éstructurista   ")).toBe("estructurista");
  });

  it("handles empty or whitespace-only strings", () => {
    expect(normalize("")).toBe("");
    expect(normalize("   ")).toBe("");
  });
});

describe("specialtyAliases", () => {
  it("includes base term", () => {
    const result = specialtyAliases("electricista");
    expect(result).toContain("electricista");
  });

  it("infers related specialties", () => {
    const result = specialtyAliases("Electrician");
    expect(result).toContain("electricista");
  });

  it("handles humedad-related terms", () => {
    const result = specialtyAliases("impermeabilizante");
    expect(result).toContain("impermeabilizador");
  });
});
