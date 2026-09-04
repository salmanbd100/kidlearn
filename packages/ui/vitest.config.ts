import react from "@vitejs/plugin-react";
import { coverageConfigDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      // Reporting only. The missing `thresholds` key is deliberate — see
      // `document/standards/general.md §5`.
      reporter: ["text-summary", "json-summary", "html"],
      reportsDirectory: "coverage",
      exclude: [...coverageConfigDefaults.exclude, "vitest.setup.ts"],
    },
  },
});
