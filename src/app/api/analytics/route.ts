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
  const userId = session?.user?.id;
  const supabase = getSupabaseAdmin();

  log.info({ userId: userId || "anonymous" }, "Analytics request");

  // Dev/demo fallback
  if (!supabase) {
    log.info("Using demo analytics data");
    return NextResponse.json(demoAnalytics());
  }

  let query = supabase
    .from("reportes")
    .select("created_at,tipo_defecto,severidad,especialista_requerido,diagnostico");

  // Optional: scope to user when authenticated
  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    log.error({ error: error.message }, "Analytics query failed");
    return NextResponse.json(demoAnalytics());
  }

  log.info({ reportCount: data?.length || 0 }, "Analytics data fetched");
  return NextResponse.json(buildAnalytics(data || [], "supabase"));
}
