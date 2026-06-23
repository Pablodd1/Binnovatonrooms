import { describe, it, expect } from "vitest";
import { buildUserPrompt, buildFollowUpPrompt } from "../src/lib/vision-prompt";

describe("buildUserPrompt", () => {
  it("should build prompt with default/empty inputs", () => {
    const prompt = buildUserPrompt({});

    expect(prompt).toContain("Camara: no especificada");
    expect(prompt).toContain("Ubicacion declarada: no especificada");
    expect(prompt).toContain(
      "Datos LiDAR/profundidad/medicion: no disponibles",
    );
    expect(prompt).toContain("Calidad de imagen estimada: no especificada");
    expect(prompt).toContain("Imagenes del set: 1");
    expect(prompt).toContain("Nivel de detalle solicitado: standard");
    expect(prompt).toContain(
      "ANALISIS ESTANDAR: Enfocate en defectos claramente visibles que requieran atencion. Menciona defectos menores si son relevantes para el contexto.",
    );
  });

  it("should build prompt with all provided inputs", () => {
    const prompt = buildUserPrompt({
      cameraLabel: "iPhone 13 Pro",
      locationLabel: "Sala de estar",
      lidarNotes: "Distancia a pared 2.5m",
      qualityNotes: "Buena iluminacion",
      imageCount: 3,
      detailLevel: "detailed",
      imageAnalysisHints: [
        "Posible grieta en esquina superior",
        "Mancha de humedad en techo",
      ],
    });

    expect(prompt).toContain("Camara: iPhone 13 Pro");
    expect(prompt).toContain("Ubicacion declarada: Sala de estar");
    expect(prompt).toContain(
      "Datos LiDAR/profundidad/medicion: Distancia a pared 2.5m",
    );
    expect(prompt).toContain("Calidad de imagen estimada: Buena iluminacion");
    expect(prompt).toContain("Imagenes del set: 3");
    expect(prompt).toContain("Nivel de detalle solicitado: detailed");
    expect(prompt).toContain(
      "ANALISIS DETALLADO: Ademas de defectos evidentes, busca patrones de desgaste, relaciones entre elementos",
    );
    expect(prompt).toContain(
      "Sugerencias de analisis previo para esta imagen:",
    );
    expect(prompt).toContain("- Posible grieta en esquina superior");
    expect(prompt).toContain("- Mancha de humedad en techo");
  });

  it("should include forensic analysis instructions when detailLevel is forensic", () => {
    const prompt = buildUserPrompt({
      detailLevel: "forensic",
    });

    expect(prompt).toContain("Nivel de detalle solicitado: forensic");
    expect(prompt).toContain(
      "ANALISIS FORENSE: Detecta TODOS los defectos visibles, incluyendo micro-fisuras (<0.5mm)",
    );
  });
});

describe("buildFollowUpPrompt", () => {
  it("should build follow-up prompt with previous diagnosis", () => {
    const mockDiagnosis = {
      defects: [{ type: "Crack", severity: "medium" }],
    };

    const prompt = buildFollowUpPrompt({
      firstPassDiagnosis: mockDiagnosis,
      imageCount: 1,
    });

    expect(prompt).toContain("Segundo analisis: Revisa la imagen anterior");
    expect(prompt).toContain('"type": "Crack"');
    expect(prompt).toContain('"severity": "medium"');
  });
});
