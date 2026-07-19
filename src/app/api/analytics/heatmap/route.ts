import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { auth } from "@/lib/auth";
import { buildHeatmapData, demoHeatmapData } from "@/lib/analytics";
import { createRequestLogger, generateRequestId } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isProduction = process.env.NODE_ENV === "production";

export async function GET(request: Request) {
  const requestId = generateRequestId();
  const log = createRequestLogger(requestId, request);

  const session = await auth();
  const userId = session?.user?.id;

  const supabase = getSupabaseAdmin();

  // In production with Supabase configured, authentication is mandatory
  if (isProduction && supabase && !userId) {
    log.warn("Heatmap request rejected: unauthenticated in production");
    return NextResponse.json({ error: "Autenticacion requerida" }, { status: 401 });
  }

  log.info({ userId: userId || "anonymous" }, "Heatmap request");

  // Dev/demo fallback
  if (!supabase) {
    if (isProduction) {
      log.error("Supabase not configured in production");
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    log.info("Using demo heatmap data");
    return NextResponse.json({ ...demoHeatmapData(), generatedFrom: "demo" });
  }

  const { data, error } = await supabase
    .from("reportes")
    .select("id, created_at, tipo_defecto, severidad, especialista_requerido, diagnostico")
    .eq("user_id", userId as string)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    log.error({ error: error.message }, "Heatmap query failed");
    if (isProduction) {
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }
    return NextResponse.json({ ...demoHeatmapData(), generatedFrom: "demo" });
  }

  log.info({ reportCount: data?.length || 0 }, "Heatmap data fetched");
  return NextResponse.json({ ...buildHeatmapData(data || []), generatedFrom: "supabase" });
}
