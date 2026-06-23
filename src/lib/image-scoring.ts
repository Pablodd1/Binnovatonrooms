export type QualityGrade = "P" | "A" | "R";

export type CaptureCheck = {
  label: string;
  status: "ok" | "warn" | "bad";
  value: string;
};

export type QualityScore = {
  brightness: number;
  sharpness: number;
  status: "buena" | "regular" | "mala";
  grade: QualityGrade;
  notes: string;
  checks: CaptureCheck[];
  guidance: string[];
  frameWidth: number;
  frameHeight: number;
  glarePercent: number;
  contrast: number;
};

export const defaultQuality: QualityScore = {
  brightness: 0,
  sharpness: 0,
  status: "regular",
  grade: "A",
  notes: "Esperando captura",
  checks: [
    { label: "Luz", status: "warn", value: "sin muestra" },
    { label: "Nitidez", status: "warn", value: "sin muestra" },
    { label: "Encuadre", status: "warn", value: "sin muestra" },
  ],
  guidance: ["Active camara o suba una imagen para calcular la guia."],
  frameWidth: 0,
  frameHeight: 0,
  glarePercent: 0,
  contrast: 0,
};

export function checkStatus(
  ok: boolean,
  warn: boolean,
): CaptureCheck["status"] {
  if (ok) return "ok";
  if (warn) return "warn";
  return "bad";
}

function extractBasicMetrics(data: Uint8ClampedArray) {
  let brightness = 0;
  let brightPixels = 0;
  let darkPixels = 0;
  const grayscale: number[] = [];
  const redChannel: number[] = [];
  const greenChannel: number[] = [];
  const blueChannel: number[] = [];

  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    grayscale.push(gray);
    redChannel.push(data[i]);
    greenChannel.push(data[i + 1]);
    blueChannel.push(data[i + 2]);
    brightness += gray;
    if (gray > 245) brightPixels += 1;
    if (gray < 15) darkPixels += 1;
  }

  brightness = brightness / grayscale.length;
  const variance =
    grayscale.reduce((sum, gray) => sum + (gray - brightness) ** 2, 0) /
    Math.max(1, grayscale.length - 1);
  const contrast = Math.sqrt(variance);
  const glarePercent = (brightPixels / grayscale.length) * 100;
  const underexposedPercent = (darkPixels / grayscale.length) * 100;

  const avgR = redChannel.reduce((s, v) => s + v, 0) / grayscale.length;
  const avgG = greenChannel.reduce((s, v) => s + v, 0) / grayscale.length;
  const avgB = blueChannel.reduce((s, v) => s + v, 0) / grayscale.length;
  const colorSpread = Math.max(avgR, avgG, avgB) - Math.min(avgR, avgG, avgB);
  const hasColorCast = colorSpread > 30;

  const histogramBins = new Array(25).fill(0);
  for (const g of grayscale) {
    const bin = Math.min(24, Math.floor(g / 10));
    histogramBins[bin]++;
  }
  const occupiedBins = histogramBins.filter((c) => c > 0).length;
  const histogramSpread = occupiedBins / 25;

  return {
    brightness,
    contrast,
    glarePercent,
    underexposedPercent,
    colorSpread,
    hasColorCast,
    histogramSpread,
    grayscale,
  };
}

function extractSharpnessAndDetail(
  grayscale: number[],
  sampleWidth: number,
  sampleHeight: number,
) {
  let edgeEnergy = 0;
  let centerEdgeEnergy = 0;
  let cornerEdgeEnergy = 0;
  const gradientMagnitudes: number[] = [];

  for (let y = 1; y < sampleHeight - 1; y += 1) {
    for (let x = 1; x < sampleWidth - 1; x += 1) {
      const idx = y * sampleWidth + x;
      const laplacian =
        grayscale[idx - sampleWidth] +
        grayscale[idx - 1] -
        4 * grayscale[idx] +
        grayscale[idx + 1] +
        grayscale[idx + sampleWidth];

      const gx = grayscale[idx + 1] - grayscale[idx - 1];
      const gy = grayscale[idx + sampleWidth] - grayscale[idx - sampleWidth];
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      gradientMagnitudes.push(magnitude);

      edgeEnergy += Math.abs(laplacian);
      if (
        x > sampleWidth * 0.2 &&
        x < sampleWidth * 0.8 &&
        y > sampleHeight * 0.15 &&
        y < sampleHeight * 0.85
      ) {
        centerEdgeEnergy += Math.abs(laplacian);
      }
      if (
        (x < sampleWidth * 0.15 || x > sampleWidth * 0.85) &&
        (y < sampleHeight * 0.15 || y > sampleHeight * 0.85)
      ) {
        cornerEdgeEnergy += Math.abs(laplacian);
      }
    }
  }

  const sharpness = edgeEnergy / grayscale.length;
  const centerDetailRatio = centerEdgeEnergy / Math.max(1, edgeEnergy);

  gradientMagnitudes.sort((a, b) => a - b);
  const medianGradient =
    gradientMagnitudes[Math.floor(gradientMagnitudes.length / 2)] || 0;
  const highGradientPixels = gradientMagnitudes.filter(
    (g) => g > medianGradient * 3,
  ).length;
  const textureVariance =
    highGradientPixels / Math.max(1, gradientMagnitudes.length);
  const hasFineTexture = textureVariance > 0.05;

  const lowGradientPixels = gradientMagnitudes.filter(
    (g) => g < medianGradient * 0.1,
  ).length;
  const smoothPercent =
    (lowGradientPixels / Math.max(1, gradientMagnitudes.length)) * 100;
  const hasSmoothSurface = smoothPercent > 60;

  return {
    sharpness,
    centerDetailRatio,
    hasFineTexture,
    smoothPercent,
    hasSmoothSurface,
  };
}

function extractNoise(
  grayscale: number[],
  sampleWidth: number,
  sampleHeight: number,
) {
  let noiseEstimate = 0;
  const blockSize = 4;
  for (let by = 0; by < sampleHeight - blockSize; by += blockSize) {
    for (let bx = 0; bx < sampleWidth - blockSize; bx += blockSize) {
      let blockSum = 0;
      let blockSumSq = 0;
      let blockCount = 0;
      for (let dy = 0; dy < blockSize; dy++) {
        for (let dx = 0; dx < blockSize; dx++) {
          const val = grayscale[(by + dy) * sampleWidth + (bx + dx)];
          blockSum += val;
          blockSumSq += val * val;
          blockCount++;
        }
      }
      const blockMean = blockSum / blockCount;
      const blockVar = blockSumSq / blockCount - blockMean * blockMean;
      noiseEstimate += blockVar;
    }
  }
  const totalBlocks = Math.max(
    1,
    Math.floor((sampleHeight - blockSize) / blockSize) *
      Math.floor((sampleWidth - blockSize) / blockSize),
  );
  return Math.sqrt(noiseEstimate / totalBlocks);
}

function evaluateQuality(
  metrics: ReturnType<typeof extractBasicMetrics> &
    ReturnType<typeof extractSharpnessAndDetail> & {
      noiseEstimate: number;
      megapixels: number;
    },
): Pick<QualityScore, "checks" | "grade" | "status" | "guidance" | "notes"> {
  const {
    brightness,
    contrast,
    glarePercent,
    underexposedPercent,
    colorSpread,
    hasColorCast,
    histogramSpread,
    sharpness,
    centerDetailRatio,
    hasFineTexture,
    smoothPercent,
    hasSmoothSurface,
    noiseEstimate,
    megapixels,
  } = metrics;

  const tooDark = brightness < 50;
  const slightlyDark = brightness >= 50 && brightness < 70;
  const tooBright = brightness > 225;
  const slightlyBright = brightness > 200 && brightness <= 225;
  const highGlare = glarePercent > 5;
  const moderateGlare = glarePercent > 3 && glarePercent <= 5;
  const lowContrast = contrast < 25;
  const moderateContrast = contrast >= 25 && contrast < 35;
  const blurry = sharpness < 8;
  const slightlyBlurry = sharpness >= 8 && sharpness < 14;
  const lowResolution = megapixels < 1.2;
  const mediumResolution = megapixels >= 1.2 && megapixels < 2;
  const weakFraming = centerDetailRatio < 0.3;
  const moderateFraming = centerDetailRatio >= 0.3 && centerDetailRatio < 0.4;
  const highNoise = noiseEstimate > 18;
  const moderateNoise = noiseEstimate > 12 && noiseEstimate <= 18;
  const narrowDynamicRange = histogramSpread < 0.5;
  const underexposed = underexposedPercent > 10;

  const checks: CaptureCheck[] = [
    {
      label: "Luz",
      status: checkStatus(
        !tooDark &&
          !tooBright &&
          !underexposed &&
          !slightlyDark &&
          !slightlyBright,
        brightness >= 45 && brightness <= 235 && !underexposed,
      ),
      value:
        `${Math.round(brightness)} ${underexposed ? "(subexp)" : ""}`.trim(),
    },
    {
      label: "Nitidez",
      status: checkStatus(
        !blurry && !slightlyBlurry && sharpness >= 17,
        sharpness >= 10,
      ),
      value: String(Math.round(sharpness)),
    },
    {
      label: "Reflejo",
      status: checkStatus(!highGlare && !moderateGlare, glarePercent <= 10),
      value: `${glarePercent.toFixed(1)}%`,
    },
    {
      label: "Contraste",
      status: checkStatus(!lowContrast && !moderateContrast, contrast >= 20),
      value: String(Math.round(contrast)),
    },
    {
      label: "Resolucion",
      status: checkStatus(
        !lowResolution && !mediumResolution && megapixels >= 2,
        megapixels >= 1.2,
      ),
      value: `${megapixels.toFixed(1)}MP`,
    },
    {
      label: "Encuadre",
      status: checkStatus(
        !weakFraming && !moderateFraming && centerDetailRatio >= 0.42,
        centerDetailRatio >= 0.34,
      ),
      value: `${Math.round(centerDetailRatio * 100)}%`,
    },
    {
      label: "Ruido",
      status: checkStatus(!highNoise && !moderateNoise, noiseEstimate <= 18),
      value: `${noiseEstimate.toFixed(1)}`,
    },
    {
      label: "Textura",
      status: checkStatus(
        hasFineTexture || hasSmoothSurface,
        hasFineTexture || smoothPercent > 30,
      ),
      value: hasFineTexture ? "fina" : hasSmoothSurface ? "lisa" : "mixta",
    },
    {
      label: "Rango",
      status: checkStatus(!narrowDynamicRange, histogramSpread >= 0.4),
      value: `${Math.round(histogramSpread * 100)}%`,
    },
    {
      label: "Color",
      status: checkStatus(!hasColorCast, colorSpread <= 40),
      value: hasColorCast ? "cast" : "ok",
    },
  ];

  const badCount = checks.filter((check) => check.status === "bad").length;
  const warnCount = checks.filter((check) => check.status === "warn").length;
  const grade: QualityGrade =
    badCount > 1 ? "R" : badCount > 0 || warnCount > 2 ? "A" : "P";
  const status = grade === "R" ? "mala" : grade === "A" ? "regular" : "buena";

  const guidance = [
    tooDark || underexposed
      ? "Incremente la iluminacion: use linterna lateral o luz ambiental."
      : "",
    slightlyDark
      ? "Luz algo baja. Acercarse a la fuente o usar flash suave."
      : "",
    tooBright || highGlare
      ? "Reduzca reflejos: cambie angulo 15-30 grados o use filtro polarizado."
      : "",
    slightlyBright
      ? "Luz algo alta. Reduzca exposicion o cambie posicion."
      : "",
    blurry
      ? "Enfoque critico: mantenga telefono fijo, use superficie estable o tripie."
      : "",
    slightlyBlurry
      ? "Nitidez moderada. Mantenga telefono firme antes de capturar."
      : "",
    lowContrast
      ? "Contraste bajo: use luz rasante para revelar textura y relieve."
      : "",
    moderateContrast
      ? "Contraste moderado. Luz lateral mejorara detalle de defectos."
      : "",
    lowResolution || mediumResolution
      ? "Resolucion insuficiente para micro-defectos. Acerque o use camara de mayor resolucion."
      : "",
    weakFraming
      ? "Centre la falla y llene 60-80% del visor con la superficie."
      : "",
    moderateFraming ? "Encuadre mejorable. Centre el sujeto en el visor." : "",
    highNoise
      ? "Ruido alto: reduzca ISO, use mas luz, o capture en modo manual."
      : "",
    moderateNoise ? "Ruido moderado. Mas luz ambiental mejora calidad." : "",
    narrowDynamicRange
      ? "Rango dinamico limitado. Use luz rasante para mejorar gradiente."
      : "",
    hasColorCast
      ? "Color desviado: verifique balance de blancos o use luz neutra."
      : "",
    grade === "P"
      ? "Captura optima para analisis de precision. Incluya escala si necesita medidas."
      : "",
  ].filter(Boolean);

  const notes = guidance.slice(0, 3).join(" ") || "imagen apta para analisis";

  return {
    checks,
    grade,
    status,
    guidance,
    notes,
  };
}

export function scoreFrame(canvas: HTMLCanvasElement): QualityScore {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return defaultQuality;

  const sampleWidth = 160;
  const sampleHeight = Math.max(
    100,
    Math.round((canvas.height / canvas.width) * sampleWidth),
  );
  const sample = document.createElement("canvas");
  sample.width = sampleWidth;
  sample.height = sampleHeight;
  const sampleCtx = sample.getContext("2d", { willReadFrequently: true });
  if (!sampleCtx) return defaultQuality;

  sampleCtx.drawImage(canvas, 0, 0, sampleWidth, sampleHeight);
  const data = sampleCtx.getImageData(0, 0, sampleWidth, sampleHeight).data;

  const basicMetrics = extractBasicMetrics(data);
  const detailMetrics = extractSharpnessAndDetail(
    basicMetrics.grayscale,
    sampleWidth,
    sampleHeight,
  );
  const noiseEstimate = extractNoise(
    basicMetrics.grayscale,
    sampleWidth,
    sampleHeight,
  );
  const megapixels = (canvas.width * canvas.height) / 1_000_000;

  const qualityEvaluation = evaluateQuality({
    ...basicMetrics,
    ...detailMetrics,
    noiseEstimate,
    megapixels,
  });

  return {
    brightness: Math.round(basicMetrics.brightness),
    sharpness: Math.round(detailMetrics.sharpness),
    status: qualityEvaluation.status,
    grade: qualityEvaluation.grade,
    notes: qualityEvaluation.notes,
    checks: qualityEvaluation.checks,
    guidance: qualityEvaluation.guidance,
    frameWidth: canvas.width,
    frameHeight: canvas.height,
    glarePercent: Number(basicMetrics.glarePercent.toFixed(1)),
    contrast: Math.round(basicMetrics.contrast),
  };
}
