import { NextResponse } from "next/server";
import { buildAnalytics, demoAnalytics } from "@/lib/analytics";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(demoAnalytics());
  }

  const { data, error } = await supabase
    .from("reportes")
    .select("created_at,tipo_defecto,severidad,especialista_requerido,diagnostico")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("Analytics query failed", error);
    return NextResponse.json(demoAnalytics());
  }

  return NextResponse.json(buildAnalytics(data || [], "supabase"));
}
