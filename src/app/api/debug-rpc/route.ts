import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ configured: false });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id") || "00000000-0000-0000-0000-000000000000";
  const newStatus = url.searchParams.get("status") || "cerrado";

  // 1. Does the function exist / what does it return verbatim?
  const { data, error } = await supabase.rpc("transition_report_status", {
    target_id: id,
    new_status: newStatus,
    reason: "debug probe",
  });

  // 2. Can we see the row?
  const { data: row, error: rowError } = await supabase
    .from("reportes")
    .select("id, status, closed_reason, closed_category")
    .eq("id", id)
    .maybeSingle();

  return NextResponse.json({
    rpcError: error
      ? { message: error.message, code: error.code, hint: error.hint, details: error.details }
      : null,
    rpcData: data,
    row,
    rowError: rowError ? rowError.message : null,
  });
}
