import { coverageConfigDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // The server derives calendar windows from `APP_TIMEZONE`, never the host's
    // zone, so this pin is insurance rather than a fix: it keeps a suite that
    // reaches for a local date from passing only on the machine that wrote it.
    env: { TZ: "UTC" },
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      // Reporting only. The missing `thresholds` key is deliberate — see
      // `document/standards/general.md §5`.
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
