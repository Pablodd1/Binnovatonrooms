import { NextResponse } from "next/server";
import { demoReports, normalizeReports } from "@/lib/reports";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ reports: demoReports(), generatedFrom: "demo" });
  }

  const { data, error } = await supabase
    .from("reportes")
    .select("id,created_at,tipo_defecto,severidad,especialista_requerido,location_label,image_url,diagnostico")
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    console.error("Reports query failed", error);
    return NextResponse.json({ reports: demoReports(), generatedFrom: "demo" });
  }

  return NextResponse.json({ reports: normalizeReports(data || []), generatedFrom: "supabase" });
}
