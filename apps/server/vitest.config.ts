import { coverageConfigDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: { TZ: "UTC" },
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary", "html"],
      reportsDirectory: "coverage",
      exclude: [
        ...coverageConfigDefaults.exclude,
        "vitest.setup.ts",
        "dist/**",
        "src/openapi/write.ts",
        "src/scripts/**",
      ],
    },
  },
});
