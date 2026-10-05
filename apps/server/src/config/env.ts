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

/** A Google Cloud TTS voice name, pinned to the language it may speak. */
function ttsVoice(language: Locale) {
  return z
    .string()
    .regex(
      new RegExp(`^${language}-[A-Z]{2}-[A-Za-z0-9-]+$`),
      `must be a ${language} voice name, e.g. ${language}-XX-Standard-A`,
    );
}

/** Whether a URL points at the machine it is read on — a dev default, never a deploy target. */
export function isLocalUrl(value: string): boolean {
  const { hostname } = new URL(value);
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost")
  );
}

const EnvSchema = z
  .object({
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
    PARENT_POST_LOGIN_PATH: z.string().startsWith("/").default("/parent"),
    /** Timezone every "day" is measured in; reward grant and streak roll-over must agree or coins could be earned twice. */
    APP_TIMEZONE: z
      .string()
      .default("Asia/Dhaka")
      .refine(
        isKnownTimeZone,
        "must be an IANA timezone name, e.g. Asia/Dhaka",
      ),
    CRON_SECRET: z.string().min(16),
    CLOUDINARY_CLOUD_NAME: z.string().min(1),
    CLOUDINARY_API_KEY: z.string().min(1),
    CLOUDINARY_API_SECRET: z.string().min(1),
    GEMINI_API_KEY: z.string().min(1),
    GEMINI_TEXT_MODEL: z.string().min(1).default("gemini-3.6-flash"),
    GEMINI_IMAGE_MODEL: z.string().min(1).default("gemini-2.5-flash-image"),
    GOOGLE_TTS_API_KEY: z.string().min(1),
    GOOGLE_TTS_VOICE_EN: ttsVoice("en").default("en-US-Standard-C"),
    GOOGLE_TTS_VOICE_BN: ttsVoice("bn").default("bn-IN-Standard-A"),
    /** Generation jobs per day per cost bucket; a text job is several requests, so this trips before Google's free-tier cap. */
    AI_TEXT_JOBS_PER_DAY: z.coerce.number().int().positive().default(3),
    AI_AUDIO_JOBS_PER_DAY: z.coerce.number().int().positive().default(100),
    AI_IMAGE_JOBS_PER_DAY: z.coerce.number().int().positive().default(15),
    /** Per-IP requests a minute to `/api/*` — a flood guard; households share one IP behind NAT. */
    API_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(300),
    ENABLE_API_DOCS: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
  })
  // Localhost defaults in production would boot cleanly then break sign-in, so fail at boot naming the variable.
  .superRefine((config, ctx) => {
    if (config.NODE_ENV !== "production") return;

    for (const key of ["WEB_ORIGIN", "BETTER_AUTH_URL"] as const) {
      if (isLocalUrl(config[key])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: "must be the deployed origin in production, not localhost",
        });
      }
    }
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

export const env: Readonly<Env> = Object.freeze(parsed.data);

export function isDocsEnabled(
  config: Pick<Env, "NODE_ENV" | "ENABLE_API_DOCS">,
): boolean {
  return config.NODE_ENV !== "production" || config.ENABLE_API_DOCS;
}
