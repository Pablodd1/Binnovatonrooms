import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { auth } from "@/lib/auth";
import { buildHeatmapData, demoHeatmapData } from "@/lib/analytics";
import { createRequestLogger, generateRequestId } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = generateRequestId();
  const log = createRequestLogger(requestId, request);

  const session = await auth();
  const userId = session?.user?.id;
  const supabase = getSupabaseAdmin();

  log.info({ userId: userId || "anonymous" }, "Heatmap request");

  // Dev/demo fallback
  if (!supabase) {
    log.info("Using demo heatmap data");
    return NextResponse.json({ ...demoHeatmapData(), generatedFrom: "demo" });
  }

  let query = supabase
    .from("reportes")
    .select("id, created_at, tipo_defecto, severidad, especialista_requerido, diagnostico");

  // Optional: scope to user when authenticated
  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    log.error({ error: error.message }, "Heatmap query failed");
    return NextResponse.json({ ...demoHeatmapData(), generatedFrom: "demo" });
  }

  log.info({ reportCount: data?.length || 0 }, "Heatmap data fetched");
  return NextResponse.json({ ...buildHeatmapData(data || []), generatedFrom: "supabase" });
}
