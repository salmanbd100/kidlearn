const DEFAULT_TEST_DATABASE_URL =
  "postgresql://postgres:password@localhost:5432/kidlearn_test";
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL?.trim() || DEFAULT_TEST_DATABASE_URL;
/**
 * Every test truncates every table, so a URL that reaches a real database
 * would wipe it. Only a database whose name ends in `_test` is accepted —
 * checked here, before any connection is opened.
 */
export function assertIsTestDatabase(url) {
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!name.endsWith("_test")) {
    throw new Error(
      `Refusing to run the database suites against "${name}": the name must end in "_test".`,
    );
  }
}
//# sourceMappingURL=vitest.db.url.js.map
