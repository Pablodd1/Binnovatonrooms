"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type HeatmapPoint = {
  x: number;
  y: number;
  defectType: string;
  severity: string;
  label: string;
  confidence: number;
};

const SEVERITY_COLORS: Record<string, string> = {
  critica: "rgba(255, 105, 95, ",
  alta: "rgba(243, 189, 71, ",
  media: "rgba(124, 199, 255, ",
  baja: "rgba(66, 211, 146, ",
};

const SEVERITY_RADIUS: Record<string, number> = {
  critica: 40,
  alta: 32,
  media: 24,
  baja: 18,
};

type DefectHeatmapProps = {
  points: HeatmapPoint[];
  totalDefects: number;
  referenceImage?: string | null;
};

export default function DefectHeatmap({ points, totalDefects, referenceImage }: DefectHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [enabled, setEnabled] = useState(true);
  const [hoveredPoint, setHoveredPoint] = useState<HeatmapPoint | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const drawPoints = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    for (const point of points) {
      const x = (point.x / 100) * width;
      const y = (point.y / 100) * height;
      const radius = SEVERITY_RADIUS[point.severity] || 20;
      const colorBase = SEVERITY_COLORS[point.severity] || SEVERITY_COLORS.baja;

      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 2);
      gradient.addColorStop(0, `${colorBase}0.5)`);
      gradient.addColorStop(0.5, `${colorBase}0.15)`);
      gradient.addColorStop(1, `${colorBase}0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius * 2, 0, Math.PI * 2);
      ctx.fill();

      const innerGradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 0.6);
      innerGradient.addColorStop(0, `${colorBase}0.9)`);
      innerGradient.addColorStop(1, `${colorBase}0.3)`);
      ctx.fillStyle = innerGradient;
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [points]);

  const drawHeatmap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    if (referenceImage) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        ctx.globalAlpha = 0.3;
        ctx.drawImage(img, 0, 0, width, height);
        ctx.globalAlpha = 1;
        drawPoints(ctx, width, height);
      };
      img.onerror = () => drawPoints(ctx, width, height);
      img.src = referenceImage;
    } else {
      ctx.fillStyle = "#0d141b";
      ctx.fillRect(0, 0, width, height);
      drawPoints(ctx, width, height);
    }
  }, [enabled, referenceImage, drawPoints]);
  useEffect(() => { drawHeatmap(); }, [drawHeatmap]);

  // Resize canvas to container
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        canvas.width = entry.contentRect.width * (window.devicePixelRatio || 1);
        canvas.height = entry.contentRect.height * (window.devicePixelRatio || 1);
        canvas.style.width = `${entry.contentRect.width}px`;
        canvas.style.height = `${entry.contentRect.height}px`;
        drawHeatmap();
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [drawHeatmap]);

  return (
    <div className="heatmap-container">
      <div className="heatmap-header">
        <h2>Mapa de calor de defectos</h2>
        <div className="heatmap-controls">
          <span className="muted-text">{totalDefects} defectos</span>
          <button
            type="button"
            onClick={() => setEnabled(!enabled)}
            className={enabled ? "" : "heatmap-disabled"}
          >
            {enabled ? "Ocultar" : "Mostrar"}
          </button>
        </div>
      </div>
      <div className="heatmap-legend">
        <span className="legend-item" style={{ color: "var(--red)" }}>Critica</span>
        <span className="legend-item" style={{ color: "var(--yellow)" }}>Alta</span>
        <span className="legend-item" style={{ color: "var(--blue)" }}>Media</span>
        <span className="legend-item" style={{ color: "var(--green)" }}>Baja</span>
      </div>
      <div ref={containerRef} className="heatmap-canvas-container">
        <canvas
          ref={canvasRef}
          className="heatmap-canvas"
          onMouseMove={(e) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const mx = (e.clientX - rect.left) / rect.width * 100;
            const my = (e.clientY - rect.top) / rect.height * 100;
            const found = points.find((p) =>
              Math.abs(p.x - mx) < 3 && Math.abs(p.y - my) < 3
            );
            setHoveredPoint(found || null);
          }}
          onMouseLeave={() => setHoveredPoint(null)}
        />
        {hoveredPoint && (
          <div
            className="heatmap-tooltip"
            style={{
              left: `${hoveredPoint.x}%`,
              top: `${Math.max(0, hoveredPoint.y - 5)}%`,
            }}
          >
            <strong>{hoveredPoint.label}</strong>
            <span>{hoveredPoint.defectType} · {hoveredPoint.severity}</span>
            <span>{Math.round(hoveredPoint.confidence * 100)}% confianza</span>
          </div>
        )}
      </div>
    </div>
  );
}
