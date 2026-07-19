import { NextResponse } from "next/server";
import { buildAnalytics, demoAnalytics } from "@/lib/analytics";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { auth } from "@/lib/auth";
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
    log.warn("Analytics request rejected: unauthenticated in production");
    return NextResponse.json({ error: "Autenticacion requerida" }, { status: 401 });
  }

  log.info({ userId: userId || "anonymous" }, "Analytics request");

  // Dev/demo fallback
  if (!supabase) {
    if (isProduction) {
      log.error("Supabase not configured in production");
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    log.info("Using demo analytics data");
    return NextResponse.json(demoAnalytics());
  }

  const { data, error } = await supabase
    .from("reportes")
    .select("created_at,tipo_defecto,severidad,especialista_requerido,diagnostico")
    .eq("user_id", userId as string)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    log.error({ error: error.message }, "Analytics query failed");
    if (isProduction) {
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }
    return NextResponse.json(demoAnalytics());
  }

  log.info({ reportCount: data?.length || 0 }, "Analytics data fetched");
  return NextResponse.json(buildAnalytics(data || [], "supabase"));
}
