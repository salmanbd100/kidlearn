import react from "@vitejs/plugin-react";
import { coverageConfigDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    // Pinned, not inherited. `lib/relative-time.ts` buckets on an absolute delta
    // but counts days from *local* midnights, so its suite reads differently per
    // zone — it failed in Los Angeles, Kiritimati and GMT+11 while passing here.
    env: { TZ: "UTC" },
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next"],
    coverage: {
      provider: "v8",
      // Reporting only. The missing `thresholds` key is deliberate — see
      // `document/standards/general.md §5`.
      reporter: ["text-summary", "json-summary", "html"],
      reportsDirectory: "coverage",
      exclude: [
        ...coverageConfigDefaults.exclude,
        "vitest.setup.ts",
        ".next/**",
        "next.config.ts",
        "postcss.config.mjs",
      ],
    },
  },
  resolve: { alias: { "@": new URL(".", import.meta.url).pathname } },
});
