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
// File 34 — the Claude API. A dummy key: every AI test stubs the client module,
// so nothing here reaches Anthropic, but env.ts requires the variable at boot.
process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
// File 36 — ElevenLabs and Gemini. Dummy values: every audio and image test stubs
// `fetch` or the SDK module, so nothing here reaches a provider, but env.ts
// requires all four at boot. `services/ai/elevenlabs.test.ts` asserts the request
// URL contains the voice id below, so changing one changes that expectation too.
process.env.ELEVENLABS_API_KEY ??= "test-elevenlabs-key";
process.env.ELEVENLABS_VOICE_ID_EN ??= "test-voice-en";
process.env.ELEVENLABS_VOICE_ID_BN ??= "test-voice-bn";
process.env.GEMINI_API_KEY ??= "test-gemini-key";
