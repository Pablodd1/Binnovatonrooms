import type { InspectionDiagnosis, InstallerMatch } from "./analysis-schema";
import { getSupabaseAdmin } from "./supabase-admin";
import { logger } from "./logger";

export function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function specialtyAliases(specialist: string) {
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

function fallbackAliases() {
  return [
    "electricista",
    "plomero",
    "impermeabilizador",
    "estructurista",
    "instalador de pisos",
    "pintor",
    "albanil",
    "inspector general",
    "herreria",
  ];
}

export async function matchInstallers(params: {
  diagnosis: InspectionDiagnosis;
  lat?: number | null;
  lng?: number | null;
}): Promise<InstallerMatch[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const aliases = specialtyAliases(params.diagnosis.especialista_requerido);
  const log = logger.child({ module: "installer-match", specialist: params.diagnosis.especialista_requerido });

  const { data, error } = await supabase.rpc("match_installers", {
    required_specialties: aliases,
    user_lat: params.lat ?? null,
    user_lng: params.lng ?? null,
    max_results: 5,
  });

  if (error) {
    log.error({ error: error.message }, "match_installers failed");
    return [];
  }

  if (data && data.length > 0) {
    return data as InstallerMatch[];
  }

  log.info("No exact matches found, trying broader fallback");
  const { data: fallbackData, error: fallbackError } = await supabase.rpc("match_installers", {
    required_specialties: fallbackAliases(),
    user_lat: params.lat ?? null,
    user_lng: params.lng ?? null,
    max_results: 3,
  });

  if (fallbackError) {
    log.error({ error: fallbackError.message }, "Fallback match_installers failed");
    return [];
  }

  return (fallbackData || []) as InstallerMatch[];
}