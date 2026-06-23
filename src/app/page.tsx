"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Activity,
  BarChart3,
  Camera,
  CheckCircle2,
  Clock3,
  Crosshair,
  Download,
  FileImage,
  ListChecks,
  Loader2,
  MapPin,
  Radar,
  Ruler,
  ShieldAlert,
  Sparkles,
  Thermometer,
  Upload
} from "lucide-react";
import clsx from "clsx";
import type { InspectionDiagnosis, InstallerMatch } from "@/lib/analysis-schema";
import type { InspectionAnalytics } from "@/lib/analytics";
import type { ReportSummary } from "@/lib/reports";

type CameraDevice = {
  deviceId: string;
  label: string;
};

type QualityGrade = "P" | "A" | "R";

type CaptureCheck = {
  label: string;
  status: "ok" | "warn" | "bad";
  value: string;
};

type QualityScore = {
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

type CaptureItem = {
  id: string;
  file: File;
  url: string;
  quality: QualityScore;
  source: string;
  createdAt: string;
};

type AnalysisResponse = {
  reportId: string | null;
  diagnosis: InspectionDiagnosis;
  installers: InstallerMatch[];
  imageUrl: string | null;
  model: string;
};

type EvidenceMarker = InspectionDiagnosis["visual_indicators"][number];

const MAX_INSPECTION_IMAGES = 6;
const INSPECTION_SHOTS = [
  { label: "Frontal", detail: "plano recto para dimensiones" },
  { label: "Rasante", detail: "angulo lateral para textura" },
  { label: "Cerca", detail: "detalle de grieta, humedad o junta" },
  { label: "Contexto", detail: "area completa y ubicacion" },
  { label: "Escala", detail: "regla, laser, LiDAR o medida manual" }
];

const defaultQuality: QualityScore = {
  brightness: 0,
  sharpness: 0,
  status: "regular",
  grade: "A",
  notes: "Esperando captura",
  checks: [
    { label: "Luz", status: "warn", value: "sin muestra" },
    { label: "Nitidez", status: "warn", value: "sin muestra" },
    { label: "Encuadre", status: "warn", value: "sin muestra" }
  ],
  guidance: ["Active camara o suba una imagen para calcular la guia."],
  frameWidth: 0,
  frameHeight: 0,
  glarePercent: 0,
  contrast: 0
};

function qualityLabel(score: QualityScore) {
  if (score.grade === "P") return "P - Best";
  if (score.grade === "A") return "A - Good";
  return "R - Repeat";
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function severityScore(severity?: InspectionDiagnosis["severidad"]) {
  if (severity === "critica") return 100;
  if (severity === "alta") return 78;
  if (severity === "media") return 46;
  if (severity === "baja") return 18;
  return 0;
}

function markerFallback(analysis: AnalysisResponse | null): EvidenceMarker[] {
  if (!analysis) return [];
  if (analysis.diagnosis.visual_indicators.length > 0) return analysis.diagnosis.visual_indicators;
  return analysis.diagnosis.evidencia_visual.slice(0, 3).map((label, index) => ({
    label,
    confidence: analysis.diagnosis.confianza,
    x: 18 + index * 18,
    y: 24 + index * 12,
    width: 30,
    height: 22
  }));
}

function exportDiagnosis(analysis: AnalysisResponse | null, quality: QualityScore, captures: CaptureItem[]) {
  if (!analysis) return;
  const payload = {
    exportedAt: new Date().toISOString(),
    reportId: analysis.reportId,
    model: analysis.model,
    quality,
    captures: captures.map((capture, index) => ({
      index: index + 1,
      source: capture.source,
      createdAt: capture.createdAt,
      quality: capture.quality
    })),
    diagnosis: analysis.diagnosis,
    installers: analysis.installers
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `buildscan-report-${analysis.reportId || Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatAge(dateString: string) {
  const hours = Math.max(1, Math.round((Date.now() - new Date(dateString).getTime()) / 36e5));
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function blobToFile(blob: Blob, name = "inspection-capture.jpg") {
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}

async function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("No se pudo capturar imagen."));
      },
      "image/jpeg",
      0.92
    );
  });
}

function checkStatus(ok: boolean, warn: boolean): CaptureCheck["status"] {
  if (ok) return "ok";
  if (warn) return "warn";
  return "bad";
}

function scoreFrame(canvas: HTMLCanvasElement): QualityScore {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return defaultQuality;

  const sampleWidth = 160;
  const sampleHeight = Math.max(100, Math.round((canvas.height / canvas.width) * sampleWidth));
  const sample = document.createElement("canvas");
  sample.width = sampleWidth;
  sample.height = sampleHeight;
  const sampleCtx = sample.getContext("2d", { willReadFrequently: true });
  if (!sampleCtx) return defaultQuality;

  sampleCtx.drawImage(canvas, 0, 0, sampleWidth, sampleHeight);
  const data = sampleCtx.getImageData(0, 0, sampleWidth, sampleHeight).data;

  let brightness = 0;
  let brightPixels = 0;
  let darkPixels = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  const pixelCount = sampleWidth * sampleHeight;
  const grayscale = new Float32Array(pixelCount);
  let gIdx = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const gray = r * 0.299 + g * 0.587 + b * 0.114;

    grayscale[gIdx++] = gray;
    sumR += r;
    sumG += g;
    sumB += b;
    brightness += gray;

    if (gray > 245) brightPixels += 1;
    if (gray < 15) darkPixels += 1;
  }

  brightness = brightness / pixelCount;

  let sumSq = 0;
  for (let i = 0; i < pixelCount; i++) {
    const diff = grayscale[i] - brightness;
    sumSq += diff * diff;
  }
  const variance = sumSq / Math.max(1, pixelCount - 1);
  const contrast = Math.sqrt(variance);

  const glarePercent = (brightPixels / pixelCount) * 100;
  const underexposedPercent = (darkPixels / pixelCount) * 100;

  const avgR = sumR / pixelCount;
  const avgG = sumG / pixelCount;
  const avgB = sumB / pixelCount;
  const colorSpread = Math.max(avgR, avgG, avgB) - Math.min(avgR, avgG, avgB);
  const hasColorCast = colorSpread > 30;

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
      if (x > sampleWidth * 0.2 && x < sampleWidth * 0.8 && y > sampleHeight * 0.15 && y < sampleHeight * 0.85) {
        centerEdgeEnergy += Math.abs(laplacian);
      }
      if ((x < sampleWidth * 0.15 || x > sampleWidth * 0.85) && (y < sampleHeight * 0.15 || y > sampleHeight * 0.85)) {
        cornerEdgeEnergy += Math.abs(laplacian);
      }
    }
  }

  const sharpness = edgeEnergy / pixelCount;
  const centerDetailRatio = centerEdgeEnergy / Math.max(1, edgeEnergy);
  const cornerDetailRatio = cornerEdgeEnergy / Math.max(1, edgeEnergy);
  const megapixels = (canvas.width * canvas.height) / 1_000_000;

  gradientMagnitudes.sort((a, b) => a - b);
  const medianGradient = gradientMagnitudes[Math.floor(gradientMagnitudes.length / 2)] || 0;
  const highGradientPixels = gradientMagnitudes.filter((g) => g > medianGradient * 3).length;
  const textureVariance = highGradientPixels / Math.max(1, gradientMagnitudes.length);
  const hasFineTexture = textureVariance > 0.05;

  const lowGradientPixels = gradientMagnitudes.filter((g) => g < medianGradient * 0.1).length;
  const smoothPercent = (lowGradientPixels / Math.max(1, gradientMagnitudes.length)) * 100;
  const hasSmoothSurface = smoothPercent > 60;

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
  const totalBlocks = Math.max(1, Math.floor((sampleHeight - blockSize) / blockSize) * Math.floor((sampleWidth - blockSize) / blockSize));
  noiseEstimate = Math.sqrt(noiseEstimate / totalBlocks);

  const dynamicRange = contrast * 2;
  const histogramBins = new Array(25).fill(0);
  for (const g of grayscale) {
    const bin = Math.min(24, Math.floor(g / 10));
    histogramBins[bin]++;
  }
  const occupiedBins = histogramBins.filter((c) => c > 0).length;
  const histogramSpread = occupiedBins / 25;

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
  const weakFraming = centerDetailRatio < 0.30;
  const moderateFraming = centerDetailRatio >= 0.30 && centerDetailRatio < 0.40;
  const highNoise = noiseEstimate > 18;
  const moderateNoise = noiseEstimate > 12 && noiseEstimate <= 18;
  const narrowDynamicRange = histogramSpread < 0.5;
  const underexposed = underexposedPercent > 10;

  const checks: CaptureCheck[] = [
    {
      label: "Luz",
      status: checkStatus(
        !tooDark && !tooBright && !underexposed && !slightlyDark && !slightlyBright,
        brightness >= 45 && brightness <= 235 && !underexposed
      ),
      value: `${Math.round(brightness)} ${underexposed ? "(subexp)" : ""}`
    },
    {
      label: "Nitidez",
      status: checkStatus(
        !blurry && !slightlyBlurry && sharpness >= 17,
        sharpness >= 10
      ),
      value: String(Math.round(sharpness))
    },
    {
      label: "Reflejo",
      status: checkStatus(!highGlare && !moderateGlare, glarePercent <= 10),
      value: `${glarePercent.toFixed(1)}%`
    },
    {
      label: "Contraste",
      status: checkStatus(!lowContrast && !moderateContrast, contrast >= 20),
      value: String(Math.round(contrast))
    },
    {
      label: "Resolucion",
      status: checkStatus(!lowResolution && !mediumResolution && megapixels >= 2, megapixels >= 1.2),
      value: `${megapixels.toFixed(1)}MP`
    },
    {
      label: "Encuadre",
      status: checkStatus(!weakFraming && !moderateFraming && centerDetailRatio >= 0.42, centerDetailRatio >= 0.34),
      value: `${Math.round(centerDetailRatio * 100)}%`
    },
    {
      label: "Ruido",
      status: checkStatus(!highNoise && !moderateNoise, noiseEstimate <= 18),
      value: `${noiseEstimate.toFixed(1)}`
    },
    {
      label: "Textura",
      status: checkStatus(hasFineTexture || hasSmoothSurface, hasFineTexture || smoothPercent > 30),
      value: hasFineTexture ? "fina" : hasSmoothSurface ? "lisa" : "mixta"
    },
    {
      label: "Rango",
      status: checkStatus(!narrowDynamicRange, histogramSpread >= 0.4),
      value: `${Math.round(histogramSpread * 100)}%`
    },
    {
      label: "Color",
      status: checkStatus(!hasColorCast, colorSpread <= 40),
      value: hasColorCast ? "cast" : "ok"
    }
  ];

  const badCount = checks.filter((check) => check.status === "bad").length;
  const warnCount = checks.filter((check) => check.status === "warn").length;
  const grade: QualityGrade = badCount > 1 ? "R" : badCount > 0 || warnCount > 2 ? "A" : "P";
  const status = grade === "R" ? "mala" : grade === "A" ? "regular" : "buena";

  const guidance = [
    tooDark || underexposed ? "Incremente la iluminacion: use linterna lateral o luz ambiental." : "",
    slightlyDark ? "Luz algo baja. Acercarse a la fuente o usar flash suave." : "",
    tooBright || highGlare ? "Reduzca reflejos: cambie angulo 15-30 grados o use filtro polarizado." : "",
    slightlyBright ? "Luz algo alta. Reduzca exposicion o cambie posicion." : "",
    blurry ? "Enfoque critico: mantenga telefono fijo, use superficie estable o tripie." : "",
    slightlyBlurry ? "Nitidez moderada. Mantenga telefono firme antes de capturar." : "",
    lowContrast ? "Contraste bajo: use luz rasante para revelar textura y relieve." : "",
    moderateContrast ? "Contraste moderado. Luz lateral mejorara detalle de defectos." : "",
    lowResolution || mediumResolution ? "Resolucion insuficiente para micro-defectos. Acerque o use camara de mayor resolucion." : "",
    weakFraming ? "Centre la falla y llene 60-80% del visor con la superficie." : "",
    moderateFraming ? "Encuadre mejorable. Centre el sujeto en el visor." : "",
    highNoise ? "Ruido alto: reduzca ISO, use mas luz, o capture en modo manual." : "",
    moderateNoise ? "Ruido moderado. Mas luz ambiental mejora calidad." : "",
    narrowDynamicRange ? "Rango dinamico limitado. Use luz rasante para mejorar gradiente." : "",
    hasColorCast ? "Color desviado: verifique balance de blancos o use luz neutra." : "",
    grade === "P" ? "Captura optima para analisis de precision. Incluya escala si necesita medidas." : ""
  ].filter(Boolean);

  const notes = guidance.slice(0, 3).join(" ") || "imagen apta para analisis";

  return {
    brightness: Math.round(brightness),
    sharpness: Math.round(sharpness),
    status,
    grade,
    notes,
    checks,
    guidance,
    frameWidth: canvas.width,
    frameHeight: canvas.height,
    glarePercent: Number(glarePercent.toFixed(1)),
    contrast: Math.round(contrast)
  };
}

async function scoreUploadedImage(file: File): Promise<QualityScore> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("No se pudo leer la imagen."));
    });
    image.src = url;
    await loaded;
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return defaultQuality;
    ctx.drawImage(image, 0, 0);
    return scoreFrame(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureUrlsRef = useRef<Set<string>>(new Set());
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [cameraLabel, setCameraLabel] = useState("Camara no seleccionada");
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [quality, setQuality] = useState<QualityScore>(defaultQuality);
  const [captures, setCaptures] = useState<CaptureItem[]>([]);
  const [selectedCaptureId, setSelectedCaptureId] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [lidarNotes, setLidarNotes] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [analytics, setAnalytics] = useState<InspectionAnalytics | null>(null);
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [error, setError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const severe = analysis?.diagnosis.severidad === "alta" || analysis?.diagnosis.severidad === "critica";
  const evidenceMarkers = markerFallback(analysis);
  const riskScore = severityScore(analysis?.diagnosis.severidad);
  const riskQueue = reports.slice().sort((a, b) => b.riskScore - a.riskScore).slice(0, 4);
  const selectedCapture = captures.find((capture) => capture.id === selectedCaptureId) || captures[captures.length - 1] || null;
  const previewUrl = selectedCapture?.url || null;
  const perfectCaptures = captures.filter((capture) => capture.quality.grade === "P").length;
  const hasMeasurementReference = /\d|cm|mm|m\b|metro|metros|inch|in\b|ft\b|pie|pies|lidar|laser|nivel|escala/i.test(lidarNotes);
  const hasDimensionCapture = quality.grade === "P" || perfectCaptures > 0;
  const dimensionReady = hasDimensionCapture && hasMeasurementReference;
  const dimensionMode = dimensionReady ? "Alta" : hasMeasurementReference ? "Media" : "Solo estimacion";
  const inspectionCompleteness = Math.min(100, Math.round(((captures.length >= 4 ? 4 : captures.length) / 4) * 100));
  const coachTone = quality.grade === "P" ? "perfect" : quality.grade === "A" ? "good" : "repeat";
  const coachSummary =
    quality.grade === "P"
      ? "Mejor captura disponible"
      : quality.grade === "A"
        ? "Buena, optimizable"
        : "Repetir para precision";
  const playbook = [
    quality.status === "mala" ? "Repetir captura antes de analizar." : "Captura valida para diagnostico.",
    captures.length >= 3 ? "Set fotografico suficiente para comparar contexto y detalle." : "Capture frontal, rasante y close-up antes de analizar.",
    coords ? "Ubicacion GPS disponible para matching local." : "GPS opcional para ordenar instaladores por distancia.",
    dimensionReady ? "Medicion lista: hay captura P y referencia de escala." : "Para dimensiones, agregue escala visible, LiDAR o medida manual.",
    analysis?.diagnosis.severidad === "critica" ? "Escalar ahora: pausar uso del area y asignar especialista." : "Registrar evidencia y comparar con futuras capturas.",
    "Usar luz rasante; agregar termica/LiDAR cuando haya humedad, desplome o electricidad."
  ];

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsCameraActive(false);
  }, []);

  const addCapture = useCallback((capture: CaptureItem) => {
    captureUrlsRef.current.add(capture.url);
    setCaptures((current) => {
      const next = [...current, capture];
      const overflow = Math.max(0, next.length - MAX_INSPECTION_IMAGES);
      const removed = overflow ? next.slice(0, overflow) : [];
      removed.forEach((item) => {
        URL.revokeObjectURL(item.url);
        captureUrlsRef.current.delete(item.url);
      });
      return overflow ? next.slice(overflow) : next;
    });
    setSelectedCaptureId(capture.id);
    setQuality(capture.quality);
  }, []);

  const removeCapture = useCallback((id: string) => {
    setCaptures((current) => {
      const target = current.find((capture) => capture.id === id);
      if (target) {
        URL.revokeObjectURL(target.url);
        captureUrlsRef.current.delete(target.url);
      }
      const next = current.filter((capture) => capture.id !== id);
      setSelectedCaptureId((selected) => (selected === id ? next[next.length - 1]?.id || "" : selected));
      if (target && quality === target.quality) setQuality(next[next.length - 1]?.quality || defaultQuality);
      return next;
    });
  }, [quality]);

  const clearCaptures = useCallback(() => {
    captureUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    captureUrlsRef.current.clear();
    setCaptures([]);
    setSelectedCaptureId("");
    setQuality(defaultQuality);
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const mediaDevices = await navigator.mediaDevices.enumerateDevices();
    const cameras = mediaDevices
      .filter((device) => device.kind === "videoinput")
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Camara ${index + 1}`
      }));
    setDevices(cameras);
    if (!selectedDeviceId && cameras[0]) setSelectedDeviceId(cameras[0].deviceId);
  }, [selectedDeviceId]);

  const loadOperationalData = useCallback(async () => {
    const [analyticsResponse, reportsResponse] = await Promise.all([
      fetch("/api/analytics"),
      fetch("/api/reports")
    ]);
    const nextAnalytics = (await analyticsResponse.json()) as InspectionAnalytics;
    const reportsPayload = (await reportsResponse.json()) as { reports: ReportSummary[] };
    setAnalytics(nextAnalytics);
    setReports(reportsPayload.reports || []);
  }, []);

  const startCamera = useCallback(async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Este navegador no permite acceso a camara. Use Chrome, Edge o Safari moderno.");
      return;
    }

    stopStream();
    const constraints: MediaStreamConstraints = {
      video: selectedDeviceId
        ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      setIsCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const track = stream.getVideoTracks()[0];
      setCameraLabel(track?.label || "Camara activa");
      await refreshDevices();
    } catch {
      setIsCameraActive(false);
      setError("No pude activar la camara. Revise permisos, HTTPS, o use subir imagen.");
    }
  }, [refreshDevices, selectedDeviceId, stopStream]);

  const captureFrame = useCallback(async (saveCapture = true) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const score = scoreFrame(canvas);
    setQuality(score);
    if (!saveCapture) return null;

    const blob = await canvasToBlob(canvas);
    const file = blobToFile(blob);
    const item: CaptureItem = {
      id: crypto.randomUUID(),
      file,
      url: URL.createObjectURL(file),
      quality: score,
      source: cameraLabel || "Camara activa",
      createdAt: new Date().toISOString()
    };
    addCapture(item);

    return item;
  }, [addCapture, cameraLabel]);

  const getLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocalizacion no disponible en este navegador.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocationLabel((current) => current || "Ubicacion GPS capturada");
      },
      () => setError("No pude capturar GPS. Puede continuar sin ubicacion.")
    );
  }, []);

  const handleUpload = useCallback(
    async (files: FileList | File[]) => {
      stopStream();
      setCameraLabel("Imagen subida manualmente");
      const selectedFiles = Array.from(files).slice(0, MAX_INSPECTION_IMAGES);
      for (const file of selectedFiles) {
        try {
          const score = await scoreUploadedImage(file);
          addCapture({
            id: crypto.randomUUID(),
            file,
            url: URL.createObjectURL(file),
            quality: score,
            source: "Imagen subida",
            createdAt: new Date().toISOString()
          });
        } catch {
          addCapture({
            id: crypto.randomUUID(),
            file,
            url: URL.createObjectURL(file),
            quality: {
              ...defaultQuality,
              grade: "A",
              notes: "Imagen subida; no se pudo calcular calidad local.",
              guidance: ["Revise que la imagen este enfocada, iluminada y tenga escala si necesita medir."]
            },
            source: "Imagen subida",
            createdAt: new Date().toISOString()
          });
        }
      }
    },
    [addCapture, stopStream]
  );

  const analyze = useCallback(async () => {
    setError("");
    setAnalysis(null);
    setIsAnalyzing(true);

    try {
      let analysisCaptures = captures;
      if (analysisCaptures.length === 0) {
        const captured = await captureFrame(true);
        if (captured) analysisCaptures = [captured];
      }
      if (analysisCaptures.length === 0) throw new Error("Capture o suba una imagen primero.");

      const formData = new FormData();
      analysisCaptures.slice(0, MAX_INSPECTION_IMAGES).forEach((capture, index) => {
        formData.append(index === 0 ? "image" : "images", capture.file);
      });
      formData.append("cameraLabel", cameraLabel);
      formData.append("locationLabel", locationLabel);
      formData.append("lidarNotes", lidarNotes);
      formData.append(
        "qualityNotes",
        `${quality.grade}/${quality.status}: ${quality.notes}. Brillo ${quality.brightness}, nitidez ${quality.sharpness}, contraste ${quality.contrast}, reflejo ${quality.glarePercent}%, resolucion ${quality.frameWidth}x${quality.frameHeight}, imagenes ${analysisCaptures.length}, P ${analysisCaptures.filter((capture) => capture.quality.grade === "P").length}, medicion ${dimensionMode}.`
      );
      if (coords) {
        formData.append("lat", String(coords.lat));
        formData.append("lng", String(coords.lng));
      }

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Fallo el analisis.");
      setAnalysis(payload as AnalysisResponse);
      loadOperationalData().catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fallo inesperado.");
    } finally {
      setIsAnalyzing(false);
    }
  }, [cameraLabel, captureFrame, captures, coords, dimensionMode, lidarNotes, loadOperationalData, locationLabel, quality]);

  useEffect(() => {
    const captureUrls = captureUrlsRef.current;
    refreshDevices().catch(() => undefined);
    loadOperationalData().catch(() => undefined);
    return () => {
      stopStream();
      captureUrls.forEach((url) => URL.revokeObjectURL(url));
      captureUrls.clear();
    };
  }, [loadOperationalData, refreshDevices, stopStream]);

  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) return;
    navigator.mediaDevices.addEventListener("devicechange", refreshDevices);
    return () => navigator.mediaDevices.removeEventListener("devicechange", refreshDevices);
  }, [refreshDevices]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (streamRef.current) {
        captureFrame(false).catch(() => undefined);
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [captureFrame]);

  const actionText = useMemo(() => {
    if (isAnalyzing) return "Analizando";
    if (captures.length > 0) return `Analizar set (${captures.length})`;
    return "Capturar y analizar";
  }, [captures.length, isAnalyzing]);

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">BuildScan AI</p>
          <h1>Inspector visual de obra para telefono, laptop y camaras externas.</h1>
        </div>
        <div className="top-actions">
          <div className={clsx("status-pill", quality.status)}>
            <Crosshair size={18} />
            <span>{qualityLabel(quality)}</span>
          </div>
          <div className="status-pill neutral">
            <Activity size={18} />
            <span>{analytics?.generatedFrom === "supabase" ? "Datos reales" : "Demo analytics"}</span>
          </div>
        </div>
      </section>

      <section className="dashboard">
        <article className="kpi-card">
          <span>Reportes</span>
          <strong>{analytics?.totalReports ?? 0}</strong>
          <small>{analytics?.severeReports ?? 0} alta/critica</small>
        </article>
        <article className="kpi-card">
          <span>Confianza media</span>
          <strong>{analytics ? percent(analytics.avgConfidence) : "0%"}</strong>
          <small>modelo visual pagado</small>
        </article>
        <article className="kpi-card">
          <span>Revision humana</span>
          <strong>{analytics ? percent(analytics.reviewRate) : "0%"}</strong>
          <small>casos con baja certeza o riesgo</small>
        </article>
        <article className="kpi-card">
          <span>Urgencia media</span>
          <strong>{analytics ? Math.round(analytics.avgUrgencyDays) : 0}d</strong>
          <small>ventana recomendada</small>
        </article>
      </section>

      <section className="intel-grid">
        <div className="analytics-panel">
          <div className="section-title">
            <BarChart3 size={18} />
            <h2>Distribucion de defectos</h2>
          </div>
          <div className="bar-list">
            {(analytics?.byDefect || []).map((bucket) => (
              <div className="bar-row" key={bucket.label}>
                <span>{bucket.label}</span>
                <div><i style={{ width: `${Math.min(100, bucket.count * 18)}%` }} /></div>
                <strong>{bucket.count}</strong>
              </div>
            ))}
          </div>
        </div>
        <div className="analytics-panel">
          <div className="section-title">
            <Radar size={18} />
            <h2>Tendencia semanal</h2>
          </div>
          <div className="trend-row">
            {(analytics?.weeklyTrend || []).map((week) => (
              <div className="trend-bar" key={week.week} title={`${week.week}: ${week.total}`}>
                <i style={{ height: `${Math.max(14, week.total * 18)}px` }} />
                <span>{week.week.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="analytics-panel">
          <div className="section-title">
            <Sparkles size={18} />
            <h2>Pistas operativas</h2>
          </div>
          <ul className="signal-list">
            {(analytics?.recentSignals || ["Capture una imagen con luz rasante para generar pistas."]).map((signal) => (
              <li key={signal}>{signal}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="ops-grid">
        <div className="analytics-panel">
          <div className="section-title">
            <ShieldAlert size={18} />
            <h2>Cola de riesgo</h2>
          </div>
          <div className="queue-list">
            {riskQueue.map((report) => (
              <article key={report.id} className={clsx("queue-item", report.severity)}>
                <strong>{report.defectType}</strong>
                <span>{report.location || "Sin ubicacion"} - {report.specialist}</span>
                <small><Clock3 size={14} /> {formatAge(report.createdAt)} - riesgo {report.riskScore}</small>
              </article>
            ))}
          </div>
        </div>
        <div className="analytics-panel">
          <div className="section-title">
            <ListChecks size={18} />
            <h2>Playbook de inspeccion</h2>
          </div>
          <ol className="playbook">
            {playbook.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
      </section>

      <section className="shot-plan">
        <div className="section-title">
          <FileImage size={18} />
          <h2>Set recomendado: fotos, no video completo</h2>
        </div>
        <div className="shot-grid">
          {INSPECTION_SHOTS.map((shot, index) => (
            <article className={clsx("shot-card", captures.length > index && "done")} key={shot.label}>
              <strong>{index + 1}</strong>
              <span>{shot.label}</span>
              <small>{shot.detail}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="workspace">
        <div className="camera-panel">
          <div className="camera-toolbar">
            <label>
              Fuente
              <select value={selectedDeviceId} onChange={(event) => setSelectedDeviceId(event.target.value)}>
                {devices.length === 0 ? <option value="">Camara predeterminada</option> : null}
                {devices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={startCamera}>
              <Camera size={18} />
              Activar
            </button>
            <button type="button" onClick={() => captureFrame(true)}>
              <FileImage size={18} />
              Guardar foto
            </button>
          </div>

          <div className="viewer">
            <video ref={videoRef} playsInline muted />
            {!isCameraActive && previewUrl ? <img src={previewUrl} alt="Captura subida" /> : null}
            {!isCameraActive && !previewUrl ? (
              <div className="empty-view">
                <Camera size={44} />
                <p>Active una camara o suba una imagen de la obra.</p>
              </div>
            ) : null}
            <div className="scan-grid" />
            <div className={clsx("capture-coach", coachTone)}>
              <strong>{quality.grade}</strong>
              <span>{coachSummary}</span>
              <small>{quality.frameWidth ? `${quality.frameWidth} x ${quality.frameHeight}` : "sin captura"}</small>
            </div>
            <div className="distance-rail" aria-hidden="true">
              <span>muy cerca</span>
              <i />
              <span>optimo</span>
              <i />
              <span>muy lejos</span>
            </div>
            {evidenceMarkers.map((marker) => (
              <div
                className="evidence-marker"
                key={`${marker.label}-${marker.x}-${marker.y}`}
                style={{
                  left: `${marker.x}%`,
                  top: `${marker.y}%`,
                  width: `${marker.width}%`,
                  height: `${marker.height}%`
                }}
              >
                <span>{marker.label}</span>
              </div>
            ))}
            {severe ? (
              <div className="danger-overlay">
                <ShieldAlert size={18} />
                Riesgo alto detectado
              </div>
            ) : null}
          </div>
          <canvas ref={canvasRef} hidden />

          <div className="upload-row">
            <label className="upload-button">
              <Upload size={18} />
              Subir imagen
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => {
                  const files = event.target.files;
                  if (!files?.length) return;
                  handleUpload(files).catch(() => setError("No pude leer la imagen subida."));
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <button className="primary" type="button" onClick={analyze} disabled={isAnalyzing}>
              {isAnalyzing ? <Loader2 className="spin" size={18} /> : <CheckCircle2 size={18} />}
              {actionText}
            </button>
            <button type="button" onClick={() => exportDiagnosis(analysis, quality, captures)} disabled={!analysis}>
              <Download size={18} />
              Exportar
            </button>
            <button type="button" onClick={clearCaptures} disabled={captures.length === 0}>
              Limpiar set
            </button>
          </div>

          <div className="capture-strip">
            <div className="capture-strip-header">
              <strong>{captures.length}/{MAX_INSPECTION_IMAGES} fotos</strong>
              <span>{inspectionCompleteness}% set minimo</span>
            </div>
            {captures.length === 0 ? (
              <p className="muted">Guarde 3-5 fotos: frontal, rasante, close-up, contexto y escala/termica si aplica.</p>
            ) : (
              <div className="capture-thumbs">
                {captures.map((capture, index) => (
                  <button
                    className={clsx("capture-thumb", selectedCapture?.id === capture.id && "active")}
                    key={capture.id}
                    type="button"
                    onClick={() => {
                      setSelectedCaptureId(capture.id);
                      setQuality(capture.quality);
                    }}
                  >
                    <img src={capture.url} alt={`Foto ${index + 1}`} />
                    <span>{index + 1}</span>
                    <small>{capture.quality.grade}</small>
                  </button>
                ))}
              </div>
            )}
            {selectedCapture ? (
              <button className="text-button" type="button" onClick={() => removeCapture(selectedCapture.id)}>
                Quitar foto seleccionada
              </button>
            ) : null}
          </div>
        </div>

        <aside className="control-panel">
          <div className="panel-block">
            <h2>Guia visual</h2>
            <div className="grade-grid">
              <div className={clsx("grade-card", quality.grade === "P" && "active")}>
                <strong>P</strong>
                <span>Best: medir y diagnosticar</span>
              </div>
              <div className={clsx("grade-card", quality.grade === "A" && "active")}>
                <strong>A</strong>
                <span>Good: diagnostico usable</span>
              </div>
              <div className={clsx("grade-card", quality.grade === "R" && "active")}>
                <strong>R</strong>
                <span>Repeat: baja precision</span>
              </div>
            </div>
            <div className="coach-checks">
              {quality.checks.map((check) => (
                <div className={clsx("coach-check", check.status)} key={check.label}>
                  <span>{check.label}</span>
                  <strong>{check.value}</strong>
                </div>
              ))}
            </div>
            <ul className="coach-guidance">
              {quality.guidance.slice(0, 4).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="panel-block">
            <h2>Calidad</h2>
            <div className="metric-grid">
              <div>
                <span>Brillo</span>
                <strong>{quality.brightness}</strong>
              </div>
              <div>
                <span>Nitidez</span>
                <strong>{quality.sharpness}</strong>
              </div>
            </div>
            <p className="muted">{quality.notes}</p>
            <div className="quality-bars">
              <span style={{ width: `${Math.min(100, quality.brightness / 2.55)}%` }} />
              <span style={{ width: `${Math.min(100, quality.sharpness * 3)}%` }} />
            </div>
          </div>

          <div className="panel-block measurement-panel">
            <h2>Medicion de superficie</h2>
            <div className={clsx("measurement-badge", dimensionReady && "ready")}>
              <Ruler size={17} />
              <strong>{dimensionMode}</strong>
            </div>
            <p className="muted">
              Para calcular dimensiones con maxima precision use una regla visible, una medida manual, nivel laser o LiDAR nativo y mantenga la superficie plana al centro del visor.
            </p>
            <div className="measurement-steps">
              <span className={captures.length >= 3 ? "ok" : ""}>3+ fotos</span>
              <span className={hasDimensionCapture ? "ok" : ""}>Captura P</span>
              <span className={hasMeasurementReference ? "ok" : ""}>Escala/LiDAR</span>
              <span className={coords ? "ok" : ""}>GPS</span>
            </div>
          </div>

          <div className="panel-block">
            <h2>Contexto</h2>
            <label>
              Ubicacion / area
              <input
                value={locationLabel}
                onChange={(event) => setLocationLabel(event.target.value)}
                placeholder="Ej. Bano principal, pared norte"
              />
            </label>
            <label>
              LiDAR / mediciones
              <textarea
                value={lidarNotes}
                onChange={(event) => setLidarNotes(event.target.value)}
                placeholder="Ej. muro a 2.4 m, area humeda 45 x 30 cm, desnivel 1.5 cm"
              />
            </label>
            <button type="button" onClick={getLocation}>
              <MapPin size={18} />
              Usar GPS
            </button>
          </div>

          <div className="panel-block hardware">
            <h2>Hardware soportado</h2>
            <p><Ruler size={16} /> iPhone/iPad con camara y mediciones LiDAR ingresadas.</p>
            <p><Camera size={16} /> Webcam de laptop, USB/UVC, borescope o camara externa compatible.</p>
            <p><Thermometer size={16} /> FLIR/termica: subir captura o usarla como camara si el sistema la expone.</p>
          </div>
        </aside>
      </section>

      {error ? (
        <section className="error-box">
          <AlertTriangle size={18} />
          {error}
        </section>
      ) : null}

      {analysis ? (
        <section className="results">
          <div className="diagnosis">
            <p className="eyebrow">Diagnostico por {analysis.model}</p>
            <div className="result-heading">
              <h2>{analysis.diagnosis.tipo_defecto}</h2>
              <span className={clsx("severity", analysis.diagnosis.severidad)}>
                {analysis.diagnosis.severidad}
              </span>
            </div>
            <p>{analysis.diagnosis.causa_probable}</p>
            <div className="result-grid">
              <div>
                <span>Ubicacion</span>
                <strong>{analysis.diagnosis.ubicacion}</strong>
              </div>
              <div>
                <span>Urgencia</span>
                <strong>{analysis.diagnosis.urgencia_dias} dias</strong>
              </div>
              <div>
                <span>Especialista</span>
                <strong>{analysis.diagnosis.especialista_requerido}</strong>
              </div>
              <div>
                <span>Confianza</span>
                <strong>{Math.round(analysis.diagnosis.confianza * 100)}%</strong>
              </div>
            </div>
            <div className="risk-meter">
              <span>Indice de riesgo</span>
              <div><i style={{ width: `${riskScore}%` }} /></div>
              <strong>{riskScore}/100</strong>
            </div>
            <h3>Evidencia visual</h3>
            <div className="evidence-list">
              {analysis.diagnosis.evidencia_visual.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
            <h3>Mediciones recomendadas</h3>
            <div className="evidence-list">
              {analysis.diagnosis.mediciones_recomendadas.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
            <h3>Plan de accion</h3>
            <ol>
              {analysis.diagnosis.solucion_paso_a_paso.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>

          <div className="installers">
            <h2>Instaladores sugeridos</h2>
            {analysis.installers.length === 0 ? (
              <p className="muted">No hay instaladores cargados todavia. Agreguelos en Supabase.</p>
            ) : (
              analysis.installers.map((installer) => (
                <article key={installer.id}>
                  <strong>{installer.nombre}</strong>
                  <span>{installer.empresa || installer.especialidades.join(", ")}</span>
                  <small>
                    {installer.ciudad || "Area no indicada"} {installer.rating ? `- ${installer.rating.toFixed(1)} estrellas` : ""}
                  </small>
                </article>
              ))
            )}
          </div>
        </section>
      ) : null}
    </main>
  );
}
