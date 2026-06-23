import { describe, it, expect } from "vitest";
import { buildUserPrompt } from "@/lib/vision-prompt";

describe("buildUserPrompt", () => {
  it("uses default values when input is empty", () => {
    const prompt = buildUserPrompt({});

    expect(prompt).toContain("Camara: no especificada");
    expect(prompt).toContain("Ubicacion declarada: no especificada");
    expect(prompt).toContain(
      "Datos LiDAR/profundidad/medicion: no disponibles",
    );
    expect(prompt).toContain("Calidad de imagen estimada: no especificada");
    expect(prompt).toContain("Imagenes del set: 1");
    expect(prompt).toContain("Nivel de detalle solicitado: standard");
    expect(prompt).toContain("ANALISIS ESTANDAR");
  });

  it("injects specific context values correctly", () => {
    const prompt = buildUserPrompt({
      cameraLabel: "iPhone 14 Pro",
      locationLabel: "Baño Principal",
      lidarNotes: "Scanner activado",
      qualityNotes: "Buena iluminacion",
      imageCount: 3,
    });

    expect(prompt).toContain("Camara: iPhone 14 Pro");
    expect(prompt).toContain("Ubicacion declarada: Baño Principal");
    expect(prompt).toContain(
      "Datos LiDAR/profundidad/medicion: Scanner activado",
    );
    expect(prompt).toContain("Calidad de imagen estimada: Buena iluminacion");
    expect(prompt).toContain("Imagenes del set: 3");
  });

  it("handles standard detail level", () => {
    const prompt = buildUserPrompt({ detailLevel: "standard" });
    expect(prompt).toContain(
      "ANALISIS ESTANDAR: Enfocate en defectos claramente visibles que requieran atencion. Menciona defectos menores si son relevantes para el contexto.",
    );
  });

  it("handles detailed detail level", () => {
    const prompt = buildUserPrompt({ detailLevel: "detailed" });
    expect(prompt).toContain(
      "ANALISIS DETALLADO: Ademas de defectos evidentes, busca patrones de desgaste, relaciones entre elementos (ej: grieta cerca de tuberia, mancha debajo de ventana), tendencias de deterioro, y defectos marginales que puedan escalar.",
    );
  });

  it("handles forensic detail level", () => {
    const prompt = buildUserPrompt({ detailLevel: "forensic" });
    expect(prompt).toContain(
      "ANALISIS FORENSE: Detecta TODOS los defectos visibles, incluyendo micro-fisuras (<0.5mm), variaciones sutiles de color (2-3% differencia), sombras anormales, cambios de textura, eflorescencia, manchas incipientes, burbujas de pintura, rayones finos, y cualquier anomalia que sugiera un problema incipiente o subyacente. Para cada hallazgo, indica si es confirmado o sospechoso.",
    );
  });

  it("formats image analysis hints correctly", () => {
    const prompt = buildUserPrompt({
      imageAnalysisHints: ["Posible humedad", "Revisar esquinas"],
    });

    expect(prompt).toContain(
      "Sugerencias de analisis previo para esta imagen:",
    );
    expect(prompt).toContain("- Posible humedad");
    expect(prompt).toContain("- Revisar esquinas");
  });
});
