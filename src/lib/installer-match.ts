import type { InspectionDiagnosis, InstallerMatch } from "./analysis-schema";
import { getSupabaseAdmin } from "./supabase-admin";

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function specialtyAliases(specialist: string) {
  const text = normalize(specialist);
  const aliases = new Set([text]);

  if (text.includes("electric")) aliases.add("electricista");
  if (text.includes("plom") || text.includes("fontan")) aliases.add("plomero");
  if (text.includes("humedad") || text.includes("imperme")) aliases.add("impermeabilizador");
  if (text.includes("estructura") || text.includes("desplome")) aliases.add("estructurista");
  if (text.includes("piso")) aliases.add("instalador de pisos");
  if (text.includes("pint") || text.includes("acabado")) aliases.add("pintor");
  if (text.includes("alban") || text.includes("mamposter")) aliases.add("albanil");

  return [...aliases];
}

export async function matchInstallers(params: {
  diagnosis: InspectionDiagnosis;
  lat?: number | null;
  lng?: number | null;
}): Promise<InstallerMatch[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const aliases = specialtyAliases(params.diagnosis.especialista_requerido);

  const { data, error } = await supabase.rpc("match_installers", {
    required_specialties: aliases,
    user_lat: params.lat ?? null,
    user_lng: params.lng ?? null,
    max_results: 5
  });

  if (error) {
    console.error("match_installers failed", error);
    return [];
  }

  return (data || []) as InstallerMatch[];
}
