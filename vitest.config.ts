import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    restoreMocks: true,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/generated/**"],
      reporter: ["text", "json-summary", "html"],
      thresholds: {
        statements: 80,
        lines: 80,
        functions: 80,
        "src/domain/health-calculation.ts": { branches: 90 },
        "src/domain/assessment-result.ts": { branches: 90 },
        "src/services/assessment-result-service.ts": { branches: 90 },
      },
    },
  },
});
