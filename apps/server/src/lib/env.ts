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
  /**
   * Shared secret for `/api/admin/jobs/*` (file 30).
   *
   * Required, not optional. An optional secret would make the weekly-report job
   * open to anyone the moment a deployment forgot the variable, and the failure
   * would be silent — the job would keep working. Failing at boot is the only
   * version of this that cannot be missed.
   *
   * 16 characters is a floor rather than a policy: this is the *whole* of the
   * authorisation on those routes, so a memorable string is not an option.
   * Generate with `openssl rand -base64 32`.
   */
  CRON_SECRET: z.string().min(16),
  /**
   * Cloudinary, the media host (file 33, FR-CMS-02).
   *
   * All three required, on the same reasoning as `CRON_SECRET`: an optional
   * credential would let a deployment boot with a media library that answers
   * `500` the first time an admin picks a file, and the cause would be a missing
   * variable nobody looked for. The CMS is not usable without them, so the
   * failure belongs at boot.
   *
   * `CLOUDINARY_API_SECRET` never leaves the server. It signs the upload
   * parameters the browser then posts *directly* to Cloudinary — the file itself
   * never transits this process (`services/mediaService.ts`).
   */
  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),
  /**
   * The Claude API, behind every generator in files 34–36 (FR-AI-01..03).
   *
   * Required on the same reasoning as `CRON_SECRET` and the Cloudinary triple: an
   * optional key would let a deployment boot with an AI Queue that answers `500`
   * the first time an admin asks for a lesson, and the cause would be a variable
   * nobody looked for.
   *
   * `ANTHROPIC_MODEL` has a default because the model is a tuning knob rather
   * than a credential — pinning a newer or cheaper one is a config change, not a
   * deployment. The default is the latest Sonnet-class model per the tracker's
   * Shared Technical Decisions.
   */
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().min(1).default("claude-sonnet-5"),
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
