"use client";

import { useMemo } from "react";

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

type CoachMessage = {
  icon: string;
  text: string;
  tone: "good" | "warn" | "bad";
};

/**
 * Pick the single most actionable message for the user RIGHT NOW.
 * Looks at the worst-failing check and returns one specific instruction.
 */
function pickCoachMessage(quality: QualityScore, hasFrame: boolean): CoachMessage {
  if (!hasFrame) {
    return { icon: "📷", text: "Active la cámara para empezar", tone: "warn" };
  }

  if (quality.grade === "P") {
    return { icon: "✅", text: "¡Calidad óptima! Tome la foto", tone: "good" };
  }

  // Find the worst problem (bad > warn)
  const bad = quality.checks.find((c) => c.status === "bad");
  const warn = quality.checks.find((c) => c.status === "warn");

  const target = bad || warn;
  if (!target) {
    return { icon: "✅", text: "¡Calidad buena! Tome la foto", tone: "good" };
  }

  const map: Record<string, CoachMessage> = {
    Luz: {
      icon: quality.brightness < 70 ? "🌙" : "☀️",
      text: quality.brightness < 70 ? "Suba la iluminación o acerque luz" : "Reduzca luz directa, use difusa",
      tone: bad ? "bad" : "warn",
    },
    Nitidez: { icon: "📐", text: "Mantenga el teléfono fijo", tone: bad ? "bad" : "warn" },
    Reflejo: { icon: "☀️", text: "Gire 15-30° para reducir reflejos", tone: bad ? "bad" : "warn" },
    Contraste: { icon: "🎨", text: "Busque mejor ángulo de luz rasante", tone: bad ? "bad" : "warn" },
    Resolucion: { icon: "🔍", text: "Acerque la cámara a la falla", tone: bad ? "bad" : "warn" },
    Encuadre: { icon: "🎯", text: "Centre la falla, llene 60-80% del visor", tone: bad ? "bad" : "warn" },
    Ruido: { icon: "📶", text: "Mejore la iluminación para reducir ruido", tone: "warn" },
    Textura: { icon: "🔍", text: "Acerque para ver textura de la falla", tone: "warn" },
    Rango: { icon: "🎨", text: "Ajuste iluminación para mejor rango", tone: "warn" },
    Color: { icon: "🎨", text: "Evite luces de color, use luz blanca", tone: "warn" },
  };

  return map[target.label] || { icon: "ℹ️", text: "Ajuste el encuadre para mejorar", tone: "warn" };
}

type Props = {
  quality: QualityScore;
  isCameraActive: boolean;
  hasFrame: boolean;
};

export default function CaptureCoach({ quality, isCameraActive, hasFrame }: Props) {
  const message = useMemo(
    () => pickCoachMessage(quality, isCameraActive || hasFrame),
    [quality, isCameraActive, hasFrame]
  );

  const toneClass = `coach-${message.tone}`;

  return (
    <div className={`capture-coach-overlay ${toneClass}`} aria-live="polite">
      <span className="coach-icon" aria-hidden="true">{message.icon}</span>
      <div className="coach-content">
        <strong className="coach-grade">{quality.grade}</strong>
        <span className="coach-message">{message.text}</span>
      </div>
    </div>
  );
}
