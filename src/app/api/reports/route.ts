import { NextResponse } from "next/server";
import { demoReports, normalizeReports } from "@/lib/reports";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { auth } from "@/lib/auth";
import { createRequestLogger, generateRequestId } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = generateRequestId();
  const log = createRequestLogger(requestId, request);

  const session = await auth();
  log.info({ userId: session?.user?.id || "anonymous" }, "Reports request");

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    log.info("Using demo reports data");
    return NextResponse.json({ reports: demoReports(), generatedFrom: "demo" });
  }

  const { data, error } = await supabase
    .from("reportes")
    .select("id,created_at,tipo_defecto,severidad,especialista_requerido,location_label,image_url,diagnostico")
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    log.error({ error: error.message }, "Reports query failed");
    return NextResponse.json({ reports: demoReports(), generatedFrom: "demo" });
  }

  log.info({ reportCount: data?.length || 0 }, "Reports data fetched");
  return NextResponse.json({ reports: normalizeReports(data || []), generatedFrom: "supabase" });
}