import { defineConfig } from "vitest/config";
import { TEST_DATABASE_URL } from "./src/shared/testing/test-database-url.js";

// Kept apart from `vitest.config.ts` so `pnpm test` needs no database.
export default defineConfig({
  test: {
    environment: "node",
    env: { TZ: "UTC", DATABASE_URL: TEST_DATABASE_URL },
    include: ["src/**/*.db.test.ts"],
    globalSetup: ["./vitest.db.global-setup.ts"],
    setupFiles: ["./vitest.setup.ts", "./vitest.db.setup.ts"],
    // Two files at once would empty each other's tables mid-test.
    fileParallelism: false,
  },
});
