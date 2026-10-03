import { defineConfig } from "vitest/config";

export default defineConfig({
  // Tests must not need frontend/ dependencies: stop esbuild from resolving frontend/tsconfig.json (it extends expo).
  esbuild: { tsconfigRaw: "{}" },
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: [
        "supabase/functions/_shared/**/*.ts",
        "frontend/src/services/auth.ts",
        "frontend/src/services/household.ts",
        "frontend/src/services/householdGateway.ts",
      ],
      exclude: ["supabase/functions/_shared/types.ts"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
