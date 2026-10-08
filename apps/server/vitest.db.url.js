const DEFAULT_TEST_DATABASE_URL =
  "postgresql://postgres:password@localhost:5432/kidlearn_test";
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL?.trim() || DEFAULT_TEST_DATABASE_URL;
/** Only a database named `*_test` is accepted, since every test truncates every table. */
export function assertIsTestDatabase(url) {
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!name.endsWith("_test")) {
    throw new Error(
      `Refusing to run the database suites against "${name}": the name must end in "_test".`,
    );
  }
}
//# sourceMappingURL=vitest.db.url.js.map
