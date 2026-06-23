import { describe, it, expect } from "vitest";
import { normalize } from "@/lib/installer-match";

describe("normalize", () => {
  it("converts text to lowercase", () => {
    expect(normalize("ELECTRICISTA")).toBe("electricista");
    expect(normalize("Plomero")).toBe("plomero");
  });

  it("removes diacritics (accents, tildes)", () => {
    expect(normalize("albañil")).toBe("albanil");
    expect(normalize("impermeabilización")).toBe("impermeabilizacion");
    expect(normalize("eléctrico")).toBe("electrico");
    expect(normalize("MAMPOSTERÍA")).toBe("mamposteria");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalize("  pintor  ")).toBe("pintor");
    expect(normalize("\t herrero \n")).toBe("herrero");
  });

  it("handles a combination of uppercase, diacritics, and whitespace", () => {
    expect(normalize("  ALBAÑIL  ")).toBe("albanil");
    expect(normalize(" \n IMPERMEABILIZACIÓN \t ")).toBe("impermeabilizacion");
  });

  it("handles empty strings", () => {
    expect(normalize("")).toBe("");
    expect(normalize("   ")).toBe("");
  });
});
