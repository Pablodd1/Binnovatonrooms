import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

let cachedAdminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (cachedAdminClient) return cachedAdminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return null;
  }

  cachedAdminClient = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: "public",
    },
  });

  return cachedAdminClient;
}

export function getStorageBucket(): string {
  return process.env.SUPABASE_BUCKET || "inspection-images";
}

export function useSignedUrls(): boolean {
  return process.env.SUPABASE_SIGNED_URLS === "true";
}