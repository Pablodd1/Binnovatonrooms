import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseAdmin();

  // Also check detection service env var
  const detectionUrl = process.env.DETECTION_SERVICE_URL || "http://localhost:8000 (DEFAULT - NOT SET!)";

  if (!supabase) {
    return NextResponse.json({
      configured: false,
      error: "getSupabaseAdmin() returned null",
      envCheck: {
        hasUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
        hasServiceKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        keyPreview: process.env.SUPABASE_SERVICE_ROLE_KEY
          ? `${process.env.SUPABASE_SERVICE_ROLE_KEY.slice(0, 8)}...${process.env.SUPABASE_SERVICE_ROLE_KEY.slice(-4)}`
          : "MISSING",
      },
    });
  }

  // Test 1: Can we connect and query the reportes table?
  const { data, error, count } = await supabase
    .from("reportes")
    .select("id, created_at, tipo_defecto, severidad, status", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(3);

  if (error) {
    return NextResponse.json({
      configured: true,
      queryFailed: true,
      error: error.message,
      errorCode: error.code,
      errorDetails: error.details,
      errorHint: error.hint,
      // This tells us if the table/columns exist
      suggestion: error.code === "42P01"
        ? "Table 'reportes' does not exist — run schema.sql in Supabase SQL Editor"
        : error.code === "42703"
        ? "Column does not exist — likely the status/user_id migration wasn't applied"
        : "Check the error message above",
    });
  }

  // Test 2: Can we insert a test report?
  const testReport = {
    tipo_defecto: "otro",
    severidad: "baja",
    especialista_requerido: "test",
    diagnostico: { test: true, note: "debug insert" },
    location_label: "debug test",
  };

  const { data: inserted, error: insertError } = await supabase
    .from("reportes")
    .insert(testReport)
    .select("id")
    .single();

  let insertTest = "not run";
  let cleanupId: string | null = null;

  if (insertError) {
    insertTest = `FAILED: ${insertError.message} (code: ${insertError.code})`;
  } else if (inserted) {
    insertTest = "SUCCESS";
    cleanupId = inserted.id;
    // Clean up the test row
    await supabase.from("reportes").delete().eq("id", cleanupId);
  }

  return NextResponse.json({
    configured: true,
    queryWorks: true,
    totalReports: count,
    recentReports: data?.map((r) => ({
      id: r.id,
      type: r.tipo_defecto,
      severity: r.severidad,
      status: r.status,
      created: r.created_at,
    })),
    insertTest,
    insertTestResult: insertTest === "SUCCESS"
      ? "Database accepts writes — the analyze route should be able to save reports"
      : "Database rejects writes — this is why reports aren't saving",
    detectionServiceUrl: detectionUrl,
    detectionServiceConfigured: Boolean(process.env.DETECTION_SERVICE_URL),
  });
}
