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
   */
  APP_TIMEZONE: z
    .string()
    .default("Asia/Dhaka")
    .refine(isKnownTimeZone, "must be an IANA timezone name, e.g. Asia/Dhaka"),
  /** Shared secret for `/api/admin/jobs/*` (file 30). */
  CRON_SECRET: z.string().min(16),
  /** Cloudinary, the media host (file 33, FR-CMS-02). */
  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),
  /**
   * Google AI Studio — one key behind every generator that writes text (files
   * 34–35, FR-AI-01..03) and the one that draws pictures (file 36, FR-AI-05).
   */
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_TEXT_MODEL: z.string().min(1).default("gemini-2.5-flash"),
  GEMINI_IMAGE_MODEL: z.string().min(1).default("gemini-2.5-flash-image"),
  /**
   * Google Cloud Text-to-Speech — the narration voice (file 36, FR-AI-04,
   * FR-I18N-05).
   */
  GOOGLE_TTS_API_KEY: z.string().min(1),
  GOOGLE_TTS_VOICE_EN: ttsVoice("en").default("en-US-Standard-C"),
  GOOGLE_TTS_VOICE_BN: ttsVoice("bn").default("bn-IN-Standard-A"),
  /**
   * How many generation jobs a single `APP_TIMEZONE` day may create, per cost
   * bucket (file 36, resized against the free tiers in file 37a).
   */
  AI_TEXT_JOBS_PER_DAY: z.coerce.number().int().positive().default(8),
  AI_AUDIO_JOBS_PER_DAY: z.coerce.number().int().positive().default(100),
  AI_IMAGE_JOBS_PER_DAY: z.coerce.number().int().positive().default(15),
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
