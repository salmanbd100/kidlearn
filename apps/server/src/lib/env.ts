import "dotenv/config";
import type { Locale } from "@kidlearn/types";
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

/**
 * A Google Cloud TTS voice name (`en-US-Standard-C`), pinned to the language it
 * is allowed to speak.
 *
 * The `languageCode` sent to the API is derived from this name's own prefix
 * (`services/ai/google-tts.ts`), so the name is the whole of the configuration —
 * which makes a voice from the wrong language the one config error worth
 * rejecting at boot rather than accepting. It is the failure with no error at
 * runtime: a Bangla page read by an English voice generates, uploads and passes a
 * review that was not listening in that language (FR-I18N-05).
 */
function ttsVoice(language: Locale) {
  return z
    .string()
    .regex(
      new RegExp(`^${language}-[A-Z]{2}-[A-Za-z0-9-]+$`),
      `must be a ${language} voice name, e.g. ${language}-XX-Standard-A`,
    );
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
   * Google AI Studio — one key behind every generator that writes text (files
   * 34–35, FR-AI-01..03) and the one that draws pictures (file 36, FR-AI-05).
   *
   * Required on the same reasoning as `CRON_SECRET` and the Cloudinary triple: an
   * optional key would let a deployment boot with an AI Queue that answers `500`
   * the first time an admin asks for a lesson, and the cause would be a variable
   * nobody looked for.
   *
   * Both models are defaulted because a model is a tuning knob rather than a
   * credential — pinning a newer or cheaper snapshot is a config change, not a
   * deployment. They share the key, the account and therefore the free tier's
   * rate limits, which is what `AI_TEXT_JOBS_PER_DAY` and
   * `AI_IMAGE_JOBS_PER_DAY` below are sized against.
   */
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_TEXT_MODEL: z.string().min(1).default("gemini-2.5-flash"),
  GEMINI_IMAGE_MODEL: z.string().min(1).default("gemini-2.5-flash-image"),
  /**
   * Google Cloud Text-to-Speech — the narration voice (file 36, FR-AI-04,
   * FR-I18N-05).
   *
   * The key is required, like every other credential here. The two voice names
   * are defaulted, and the defaults are Standard voices deliberately: Standard's
   * free allowance is an order of magnitude larger than WaveNet's, and
   * "child-friendly" means warm and unhurried rather than expensive.
   *
   * Which voices they name is still an administrator's listening decision,
   * documented in `.env.example` — the defaults are a starting point, not a
   * verdict.
   */
  GOOGLE_TTS_API_KEY: z.string().min(1),
  GOOGLE_TTS_VOICE_EN: ttsVoice("en").default("en-US-Standard-C"),
  GOOGLE_TTS_VOICE_BN: ttsVoice("bn").default("bn-IN-Standard-A"),
  /**
   * How many generation jobs a single `APP_TIMEZONE` day may create, per cost
   * bucket (file 36, resized against the free tiers in file 37a).
   *
   * These exist because the batch endpoints turn one click into *n* provider
   * calls: "generate narration" on a story is two clips a page, and a misclick on
   * a long story is a day's quota. The caps are a floor under that, not a quota
   * system — they are counted across the whole deployment rather than per admin,
   * because what is being protected is a shared free tier.
   *
   * Three buckets rather than one total, because the three draw on different
   * allowances and one shared ceiling would let a morning of audio work block the
   * afternoon's lesson writing.
   *
   * **Sized to trip before the provider's own quota does.** A `429 RATE_LIMITED`
   * naming the cap is a far better admin experience than an opaque provider quota
   * error surfacing through `runGenerationJob`'s generic failure path. Text and
   * image share one Google AI Studio account, whose free-tier daily request
   * limits Google no longer publishes per model — they are visible only in AI
   * Studio's own rate-limit dashboard, and the reported figure for Flash is as low
   * as 20 requests/day (checked 2026-09-04). Both defaults sit under that with
   * room for the one retry a text job may spend, and both are meant to be raised
   * by an operator who has read their own dashboard.
   *
   * Audio is on a different and much larger allowance — 4,000,000 characters a
   * month for Standard voices (checked 2026-09-04) — so its cap is set by what a
   * month of daily batches would spend against that, not by a request count.
   */
  AI_TEXT_JOBS_PER_DAY: z.coerce.number().int().positive().default(8),
  AI_AUDIO_JOBS_PER_DAY: z.coerce.number().int().positive().default(100),
  AI_IMAGE_JOBS_PER_DAY: z.coerce.number().int().positive().default(15),
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
