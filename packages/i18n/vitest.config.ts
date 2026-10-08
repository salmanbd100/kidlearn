import { coverageConfigDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Reporting only; no `thresholds` by design (standards/general.md §5).
      reporter: ["text-summary", "json-summary", "html"],
      reportsDirectory: "coverage",
      exclude: [...coverageConfigDefaults.exclude],
    },
  },
});
