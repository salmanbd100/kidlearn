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
  // --- API documentation (file 12a) --------------------------------------
  // Publishes Swagger UI at `/docs` in production, where it is off by default:
  // the docs describe the whole attack surface, so exposing them is a decision
  // somebody should make deliberately. Always on outside production.
  //
  // Not `z.coerce.boolean()` — that returns `true` for the *string* "false",
  // which is exactly how this variable arrives from a shell or a dashboard.
  ENABLE_API_DOCS: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
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

/**
 * Whether to mount the API documentation routes.
 *
 * A pure predicate over the two fields it needs, rather than a check against the
 * module-level `env`, so `app.test.ts` can assert both branches without
 * re-importing this module (which would re-run `dotenv` and `process.exit`).
 */
export function isDocsEnabled(
  config: Pick<Env, "NODE_ENV" | "ENABLE_API_DOCS">,
): boolean {
  return config.NODE_ENV !== "production" || config.ENABLE_API_DOCS;
}
