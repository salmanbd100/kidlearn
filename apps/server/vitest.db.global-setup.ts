import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  assertIsTestDatabase,
  TEST_DATABASE_URL,
} from "./src/shared/testing/test-database-url.js";

/** `migrate deploy`, not `db push`, so the suites exercise the migrations that ship. */
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
