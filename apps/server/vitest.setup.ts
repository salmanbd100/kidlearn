/**
 * Runs before every test file. `src/lib/env.ts` parses `process.env` at import
 * time and exits the process when a required variable is missing, so the suite
 * needs these present even though no test opens a database connection.
 */
process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??=
  "postgresql://postgres:password@localhost:5432/kidlearn_test";
process.env.WEB_ORIGIN ??= "http://localhost:3000";
// Silence pino so assertion failures are readable.
process.env.LOG_LEVEL ??= "fatal";
