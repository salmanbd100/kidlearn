import { defineConfig } from "vitest/config";
import { TEST_DATABASE_URL } from "./src/shared/testing/test-database-url.js";

// The real-database suites (`*.db.test.ts`), kept apart from `vitest.config.ts`
// so `pnpm test` still needs no database. See `document/standards/general.md §5`.
export default defineConfig({
  test: {
    environment: "node",
    env: { TZ: "UTC", DATABASE_URL: TEST_DATABASE_URL },
    include: ["src/**/*.db.test.ts"],
    globalSetup: ["./vitest.db.global-setup.ts"],
    setupFiles: ["./vitest.setup.ts", "./vitest.db.setup.ts"],
    // One database, truncated before every test: two files at once would empty
    // each other's tables mid-test.
    fileParallelism: false,
  },
});
