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
// better-auth (file 09). Dummy values only — no test drives the real Google
// flow, but `betterAuth()` is constructed at import time and env.ts rejects
// blank credentials, so the suite needs syntactically valid placeholders.
process.env.BETTER_AUTH_URL ??= "http://localhost:4000";
process.env.BETTER_AUTH_SECRET ??= "test-secret-at-least-32-chars-long!!";
process.env.GOOGLE_CLIENT_ID ??= "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET ??= "test-google-client-secret";
// File 30 — `/api/admin/jobs/*` authenticates with this shared secret, and
// env.ts requires it at boot. `routes/jobs.test.ts` asserts against this value.
process.env.CRON_SECRET ??= "test-cron-secret-value";
// File 33 — Cloudinary. Dummy values: no test uploads anything, but env.ts
// requires all three at boot. `routes/admin/media.test.ts` asserts a signature
// reproduced from this secret, so changing it changes that expectation too.
process.env.CLOUDINARY_CLOUD_NAME ??= "test-cloud";
process.env.CLOUDINARY_API_KEY ??= "test-api-key";
process.env.CLOUDINARY_API_SECRET ??= "test-api-secret";
