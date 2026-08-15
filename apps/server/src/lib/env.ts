import "dotenv/config";
import { z } from "zod";

/** Whether the running platform's ICU data recognises the zone name. */
function isKnownTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

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
  BETTER_AUTH_URL: z.string().url().default("http://localhost:4000"),
  // Signing key for session tokens and OAuth state. Generate with
  // `openssl rand -base64 32`. Rotating it invalidates every live session.
  BETTER_AUTH_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  // Where the browser lands after a successful Google round-trip.
  PARENT_POST_LOGIN_PATH: z.string().startsWith("/").default("/parent"),
  /**
   * The timezone every "day" in this product is measured in — the once-a-day
   * reward grant (file 23) and the streak roll-over (file 27) both read it, and
   * they must agree or a child could earn today's coins twice.
   *
   * One zone for the whole deployment, not one per child: per-child timezones
   * are post-MVP, and the audience is a single country. `.refine` rejects a
   * value the platform's ICU data does not know, at boot rather than at the
   * moment a grant is computed.
   */
  APP_TIMEZONE: z
    .string()
    .default("Asia/Dhaka")
    .refine(isKnownTimeZone, "must be an IANA timezone name, e.g. Asia/Dhaka"),
  // --- API documentation --------- //
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

export function isDocsEnabled(
  config: Pick<Env, "NODE_ENV" | "ENABLE_API_DOCS">,
): boolean {
  return config.NODE_ENV !== "production" || config.ENABLE_API_DOCS;
}
