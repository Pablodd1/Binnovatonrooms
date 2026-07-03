import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { buildHeatmapData, demoHeatmapData, type ReportRow } from "@/lib/analytics";
import { createRequestLogger, generateRequestId } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = generateRequestId();
  const log = createRequestLogger(requestId, request);
  log.info("Heatmap request");

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    log.info("Using demo heatmap data");
    return NextResponse.json({ ...demoHeatmapData(), generatedFrom: "demo" });
  }

  const { data, error } = await supabase
    .from("reportes")
    .select("id, created_at, tipo_defecto, severidad, especialista_requerido, diagnostico")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    log.error({ error: error.message }, "Heatmap query failed");
    return NextResponse.json({ ...demoHeatmapData(), generatedFrom: "demo" });
  }

  // Cast to satisfy analytics.ts ReportRow type
  const rows = (data || []) as ReportRow[];

  log.info({ reportCount: data?.length || 0 }, "Heatmap data fetched");
  return NextResponse.json({ ...buildHeatmapData(data || []), generatedFrom: "supabase" });
}
