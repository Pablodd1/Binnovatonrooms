"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Crosshair,
  FileImage,
  Loader2,
  MapPin,
  Ruler,
  ShieldAlert,
  Upload
} from "lucide-react";
import clsx from "clsx";
import type { InspectionDiagnosis, InstallerMatch } from "@/lib/analysis-schema";

type CameraDevice = {
  deviceId: string;
  label: string;
};

type QualityScore = {
  brightness: number;
  sharpness: number;
  status: "buena" | "regular" | "mala";
  notes: string;
};

type AnalysisResponse = {
  reportId: string | null;
  diagnosis: InspectionDiagnosis;
  installers: InstallerMatch[];
  imageUrl: string | null;
  model: string;
};

const defaultQuality: QualityScore = {
  brightness: 0,
  sharpness: 0,
  status: "regular",
  notes: "Esperando captura"
};

function qualityLabel(score: QualityScore) {
  if (score.status === "buena") return "Lista";
  if (score.status === "regular") return "Mejorable";
  return "Repetir";
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

function scoreFrame(canvas: HTMLCanvasElement): QualityScore {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return defaultQuality;

  const sampleWidth = 120;
  const sampleHeight = Math.max(80, Math.round((canvas.height / canvas.width) * sampleWidth));
  const sample = document.createElement("canvas");
  sample.width = sampleWidth;
  sample.height = sampleHeight;
  const sampleCtx = sample.getContext("2d", { willReadFrequently: true });
  if (!sampleCtx) return defaultQuality;

  sampleCtx.drawImage(canvas, 0, 0, sampleWidth, sampleHeight);
  const data = sampleCtx.getImageData(0, 0, sampleWidth, sampleHeight).data;
  let brightness = 0;
  const grayscale: number[] = [];

  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    grayscale.push(gray);
    brightness += gray;
  }

  brightness = brightness / grayscale.length;

  let edgeEnergy = 0;
  for (let y = 1; y < sampleHeight - 1; y += 1) {
    for (let x = 1; x < sampleWidth - 1; x += 1) {
      const idx = y * sampleWidth + x;
      const laplacian =
        grayscale[idx - sampleWidth] +
        grayscale[idx - 1] -
        4 * grayscale[idx] +
        grayscale[idx + 1] +
        grayscale[idx + sampleWidth];
      edgeEnergy += Math.abs(laplacian);
    }
  }

  const sharpness = edgeEnergy / grayscale.length;
  const tooDark = brightness < 55;
  const tooBright = brightness > 220;
  const blurry = sharpness < 10;
  const status = tooDark || tooBright || blurry ? "mala" : sharpness < 17 ? "regular" : "buena";
  const notes = [
    tooDark ? "sube la luz" : "",
    tooBright ? "reduce reflejos" : "",
    blurry ? "mantenga la camara estable" : ""
  ]
    .filter(Boolean)
    .join(", ");

  return {
    brightness: Math.round(brightness),
    sharpness: Math.round(sharpness),
    status,
    notes: notes || "imagen usable para analisis"
  };
}

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [cameraLabel, setCameraLabel] = useState("Camara no seleccionada");
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [quality, setQuality] = useState<QualityScore>(defaultQuality);
  const [captureFile, setCaptureFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [locationLabel, setLocationLabel] = useState("");
  const [lidarNotes, setLidarNotes] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const severe = analysis?.diagnosis.severidad === "alta" || analysis?.diagnosis.severidad === "critica";

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsCameraActive(false);
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
  }, [refreshDevices, selectedDeviceId, stopStream]);

  const captureFrame = useCallback(async () => {
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

    const blob = await canvasToBlob(canvas);
    const file = blobToFile(blob);
    setCaptureFile(file);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });

    return file;
  }, []);

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

  const analyze = useCallback(async () => {
    setError("");
    setAnalysis(null);
    setIsAnalyzing(true);

    try {
      const file = captureFile ?? (await captureFrame());
      if (!file) throw new Error("Capture o suba una imagen primero.");

      const formData = new FormData();
      formData.append("image", file);
      formData.append("cameraLabel", cameraLabel);
      formData.append("locationLabel", locationLabel);
      formData.append("lidarNotes", lidarNotes);
      formData.append("qualityNotes", `${quality.status}: ${quality.notes}. Brillo ${quality.brightness}, nitidez ${quality.sharpness}.`);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fallo inesperado.");
    } finally {
      setIsAnalyzing(false);
    }
  }, [cameraLabel, captureFile, captureFrame, coords, lidarNotes, locationLabel, quality]);

  useEffect(() => {
    refreshDevices().catch(() => undefined);
    return () => stopStream();
  }, [refreshDevices, stopStream]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (streamRef.current) {
        captureFrame().catch(() => undefined);
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [captureFrame]);

  const actionText = useMemo(() => {
    if (isAnalyzing) return "Analizando";
    if (captureFile) return "Analizar captura";
    return "Capturar y analizar";
  }, [captureFile, isAnalyzing]);

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">BuildScan AI</p>
          <h1>Inspector visual de obra para telefono, laptop y camaras externas.</h1>
        </div>
        <div className={clsx("status-pill", quality.status)}>
          <Crosshair size={18} />
          <span>{qualityLabel(quality)}</span>
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
            <button type="button" onClick={captureFrame}>
              <FileImage size={18} />
              Capturar
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
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  stopStream();
                  setCaptureFile(file);
                  setCameraLabel("Imagen subida manualmente");
                  setPreviewUrl((old) => {
                    if (old) URL.revokeObjectURL(old);
                    return URL.createObjectURL(file);
                  });
                }}
              />
            </label>
            <button className="primary" type="button" onClick={analyze} disabled={isAnalyzing}>
              {isAnalyzing ? <Loader2 className="spin" size={18} /> : <CheckCircle2 size={18} />}
              {actionText}
            </button>
          </div>
        </div>

        <aside className="control-panel">
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
