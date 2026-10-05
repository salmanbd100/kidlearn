import { coverageConfigDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Reporting only; the missing `thresholds` key is deliberate (`general.md §5`).
      reporter: ["text-summary", "json-summary", "html"],
      reportsDirectory: "coverage",
      exclude: [
        ...coverageConfigDefaults.exclude,
        "vitest.setup.ts",
        "dist/**",
        "prisma/**",
      ],
    },
  },
});
