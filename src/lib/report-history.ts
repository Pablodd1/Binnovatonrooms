import type { ReportSummary } from "./reports";

/**
 * Defect history: track the same defect/location across visits so reports
 * show progression ("esta humedad crece entre visitas") instead of isolated
 * snapshots.
 */

export type HistoryPoint = {
  id: string;
  createdAt: string;
  severity: string;
  confidence: number;
  status: string;
  isCurrent: boolean;
};

export type DefectHistory = {
  points: HistoryPoint[];
  /** Ordered oldest → newest, current report included and flagged. */
  previous: HistoryPoint | null;
  /** Percentage-point confidence change vs the previous visit (rounded). */
  confidenceDelta: number | null;
  severityChanged: boolean;
};

function normalizeLocation(label: string | null | undefined): string {
  return (label || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildDefectHistory(
  reports: ReportSummary[],
  current: { id: string }
): DefectHistory {
  const currentReport = reports.find((r) => r.id === current.id);
  const locationKey = normalizeLocation(currentReport?.location);

  const related = reports
    .filter((r) => {
      if (r.id === current.id) return true; // keep current so it anchors the timeline
      // Same physical spot: matching normalized location. When location is
      // unknown on BOTH sides, fall back to same defect type.
      const sameLocation = locationKey !== "" && normalizeLocation(r.location) === locationKey;
      const bothUnknown =
        locationKey === "" && normalizeLocation(r.location) === "" && r.defectType === currentReport?.defectType;
      return sameLocation || bothUnknown;
    })
    .map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      severity: String(r.severity),
      confidence: typeof r.confidence === "number" ? r.confidence : 0,
      status: String(r.status),
      isCurrent: r.id === current.id,
    }))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const currentIndex = related.findIndex((p) => p.isCurrent);
  const previous = currentIndex > 0 ? related[currentIndex - 1] : null;
  const confidenceDelta =
    previous && currentIndex >= 0
      ? Math.round((related[currentIndex].confidence - previous.confidence) * 100)
      : null;
  const severityChanged = Boolean(
    previous && currentIndex >= 0 && related[currentIndex].severity !== previous.severity
  );

  return { points: related, previous, confidenceDelta, severityChanged };
}
