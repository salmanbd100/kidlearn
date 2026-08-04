// Loads apps/server/.env into process.env before the schema below reads it.
// Kept here rather than in index.ts so that every entry point — the server, the
// test runner, a one-off script — gets the same environment without ordering
// hazards.
import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  // --- better-auth (file 09) ---------------------------------------------
  // Public base URL of THIS server. better-auth builds its OAuth redirect URI
  // from it, so it must match the Authorized redirect URI registered in the
  // Google Cloud console exactly (`<BETTER_AUTH_URL>/api/auth/callback/google`).
  BETTER_AUTH_URL: z.string().url().default("http://localhost:4000"),
  // Signing key for session tokens and OAuth state. Generate with
  // `openssl rand -base64 32`. Rotating it invalidates every live session.
  BETTER_AUTH_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  // Where the browser lands after a successful Google round-trip.
  PARENT_POST_LOGIN_PATH: z.string().startsWith("/").default("/parent"),
});

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const fieldErrors = parsed.error.flatten().fieldErrors;
  console.error(
    "Invalid environment configuration. Fix these variables in apps/server/.env:",
  );
  for (const [key, messages] of Object.entries(fieldErrors)) {
    console.error(`  - ${key}: ${messages?.join(", ")}`);
  }
  process.exit(1);
}

/** Validated, immutable environment. Import this instead of `process.env`. */
export const env: Readonly<Env> = Object.freeze(parsed.data);
