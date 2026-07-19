export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");

    // Validate required production env vars at boot — fail fast instead of
    // producing cryptic per-request errors from NextAuth/Gemini/Supabase.
    const { validateProductionEnv } = await import("./lib/server-config");
    validateProductionEnv();
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
