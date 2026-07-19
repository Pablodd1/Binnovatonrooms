import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      // Only include src/lib/** — API routes have no unit tests yet (they require
      // mocking Gemini/Supabase/auth). Add src/app/api/** back when route tests exist.
      include: ["src/lib/**"],
      exclude: ["src/lib/logger.ts", "src/lib/auth.ts"],
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 60,
        lines: 60,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});