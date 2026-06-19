import { NextResponse } from "next/server";
import { buildAnalytics, demoAnalytics } from "@/lib/analytics";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { auth } from "@/lib/auth";
import { createRequestLogger, generateRequestId } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = generateRequestId();
  const log = createRequestLogger(requestId, request);

  const session = await auth();
  log.info({ userId: session?.user?.id || "anonymous" }, "Analytics request");

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    log.info("Using demo analytics data");
    return NextResponse.json(demoAnalytics());
  }

  const { data, error } = await supabase
    .from("reportes")
    .select("created_at,tipo_defecto,severidad,especialista_requerido,diagnostico")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    log.error({ error: error.message }, "Analytics query failed");
    return NextResponse.json(demoAnalytics());
  }

  log.info({ reportCount: data?.length || 0 }, "Analytics data fetched");
  return NextResponse.json(buildAnalytics(data || [], "supabase"));
}