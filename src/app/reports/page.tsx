"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { ReportSummary } from "@/lib/reports";

const SEVERITY_ORDER: Record<string, number> = { critica: 4, alta: 3, media: 2, baja: 1 };
const STATUS_LABELS: Record<string, string> = {
  nuevo: "Nuevo",
  revision: "En Revision",
  asignar: "Por Asignar",
  cerrado: "Cerrado",
};
const SEVERITY_LABELS: Record<string, string> = {
  critica: "Critica",
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"date" | "severity" | "risk">("date");

  // Update clock every 60s for "time ago" display
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const loadReports = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterSeverity !== "all") params.set("severity", filterSeverity);
      const res = await fetch(`/api/reports?${params}`);
      const data = await res.json();
      setReports(data.reports || []);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterSeverity]);

  useEffect(() => { loadReports(); }, [loadReports]);

  const sorted = [...reports].sort((a, b) => {
    if (sortBy === "severity") return (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0);
    if (sortBy === "risk") return b.riskScore - a.riskScore;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  function severityClass(sev: string) {
    if (sev === "critica") return "critica";
    if (sev === "alta") return "alta";
    if (sev === "media") return "media";
    return "baja";
  }

  function timeAgo(dateStr: string, now: number) {
    const diff = now - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return "Hace un momento";
    if (hours < 24) return `Hace ${hours}h`;
    const days = Math.floor(hours / 24);
    return `Hace ${days}d`;
  }

  return (
    <div className="shell">
      <div className="topbar">
        <div>
          <p className="eyebrow">BuildScan AI</p>
          <h1>Historial de Inspecciones</h1>
        </div>
        <div className="top-actions">
          <Link href="/" style={{ textDecoration: "none" }}>
            <button type="button">&#9664; Inspector</button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="reports-filters">
        <div className="filter-group">
          <label>Estado</label>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">Todos</option>
            <option value="nuevo">Nuevo</option>
            <option value="revision">En Revision</option>
            <option value="asignar">Por Asignar</option>
            <option value="cerrado">Cerrado</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Severidad</label>
          <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)}>
            <option value="all">Todas</option>
            <option value="critica">Critica</option>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Ordenar</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "date" | "severity" | "risk")}>
            <option value="date">Fecha</option>
            <option value="severity">Severidad</option>
            <option value="risk">Riesgo</option>
          </select>
        </div>
        <div className="filter-count">
          <span className="muted-text">{sorted.length} reportes</span>
        </div>
      </div>

      {/* Report Cards */}
      {loading ? (
        <div className="reports-loading">Cargando reportes...</div>
      ) : sorted.length === 0 ? (
        <div className="reports-empty">
          <p>No se encontraron reportes con los filtros seleccionados.</p>
        </div>
      ) : (
        <div className="reports-grid">
          {sorted.map((report) => (
            <Link key={report.id} href={`/reports/${report.id}`} className="report-card-link">
              <div className={`report-card severity-border-${severityClass(report.severity)}`}>
                <div className="report-card-header">
                  <span className={`severity ${severityClass(report.severity)}`}>
                    {SEVERITY_LABELS[report.severity] || report.severity}
                  </span>
                  <span className={`status-badge status-${report.status}`}>
                    {STATUS_LABELS[report.status] || report.status}
                  </span>
                </div>
                <div className="report-card-body">
                  <h3>{report.defectType}</h3>
                  {report.location && <p className="report-location">{report.location}</p>}
                  <div className="report-card-meta">
                    <span>{report.specialist}</span>
                    <span className="muted-text">{timeAgo(report.createdAt, now)}</span>
                  </div>
                  <div className="report-card-scores">
                    <div className="score-item">
                      <span className="muted-text">Confianza</span>
                      <span>{Math.round(report.confidence * 100)}%</span>
                    </div>
                    <div className="score-item">
                      <span className="muted-text">Riesgo</span>
                      <span className={report.riskScore >= 78 ? "text-red" : ""}>{report.riskScore}</span>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
