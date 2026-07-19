import { NextResponse } from "next/server";
import { demoReports, normalizeReports } from "@/lib/reports";
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

  // In production with Supabase configured, authentication is mandatory.
  // The service-role key bypasses RLS, so without a userId filter any caller
  // could read any report. Anonymous access is only allowed in dev/demo mode.
  const supabase = getSupabaseAdmin();

  if (isProduction && supabase && !userId) {
    log.warn("Reports request rejected: unauthenticated in production");
    return NextResponse.json({ error: "Autenticacion requerida" }, { status: 401 });
  }

  log.info({ userId: userId || "anonymous" }, "Reports request");

  const { searchParams } = new URL(request.url);
  const reportId = searchParams.get("id");
  const status = searchParams.get("status");
  const severity = searchParams.get("severity");
  const limitParam = searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitParam) || 50, 1), 200);

  // Dev/demo fallback when Supabase is not configured
  if (!supabase) {
    if (isProduction) {
      log.error("Supabase not configured in production");
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    log.info("Using demo reports data");
    if (reportId) {
      const demo = demoReports();
      const found = demo.find((r) => r.id === reportId);
      return NextResponse.json({ report: found || null, generatedFrom: "demo" });
    }
    return NextResponse.json({ reports: demoReports(), generatedFrom: "demo" });
  }

  // Single report fetch with images (always scoped to current user)
  if (reportId) {
    const { data, error } = await supabase
      .from("reportes")
      .select("*, report_images(*)")
      .eq("id", reportId)
      .eq("user_id", userId as string)
      .single();

    if (error || !data) {
      log.warn({ reportId, error: error?.message }, "Report not found");
      return NextResponse.json({ report: null, generatedFrom: "supabase" });
    }

    return NextResponse.json({ report: data, generatedFrom: "supabase" });
  }

  // List reports scoped to current user
  let query = supabase
    .from("reportes")
    .select("id, created_at, tipo_defecto, severidad, especialista_requerido, location_label, image_url, diagnostico, risk_score, status, closed_reason, closed_at")
    .eq("user_id", userId as string);

  if (status) {
    query = query.eq("status", status);
  }
  if (severity) {
    query = query.eq("severidad", severity);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    log.error({ error: error.message }, "Reports query failed");
    if (isProduction) {
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }
    return NextResponse.json({ reports: demoReports(), generatedFrom: "demo" });
  }

  log.info({ reportCount: data?.length || 0 }, "Reports data fetched");
  return NextResponse.json({ reports: normalizeReports(data || []), generatedFrom: "supabase" });
}
