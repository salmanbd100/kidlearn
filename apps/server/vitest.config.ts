import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // The server derives calendar windows from `APP_TIMEZONE`, never the host's
    // zone, so this pin is insurance rather than a fix: it keeps a suite that
    // reaches for a local date from passing only on the machine that wrote it.
    env: { TZ: "UTC" },
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
