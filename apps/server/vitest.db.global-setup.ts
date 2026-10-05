import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  assertIsTestDatabase,
  TEST_DATABASE_URL,
} from "./src/shared/testing/test-database-url.js";

/**
 * Brings the test database to the committed schema once per run. `migrate
 * deploy`, not `db push`: the suites then exercise the migrations that ship,
 * including the ones that change referential actions.
 */
export default function setup(): void {
  assertIsTestDatabase(TEST_DATABASE_URL);
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: fileURLToPath(new URL("../../packages/db/", import.meta.url)),
    env: {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
      DIRECT_URL: TEST_DATABASE_URL,
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
}
