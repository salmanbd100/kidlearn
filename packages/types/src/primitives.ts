/**
 * Shared primitives for every versioned content payload.
 *
 * Versioning rule (NFR-SCALE-02): an optional field may be added within a version. Any other change
 * (new required field, rename, narrowed type) bumps `SCHEMA_VERSION`, moves every `schemaVersion`
 * literal, and adds a step to the `*_MIGRATIONS` table, so stored rows upgrade as they are read.
 *
 * Writes are strict (no undeclared keys); reads are lenient (`./versioning`) so a key from a newer deploy is dropped.
 */
import { z } from "zod";

/** The version every payload is written at, and migrated up to when read. */
export const SCHEMA_VERSION = 1;

export const LOCALES = ["en", "bn"] as const;
export const LocaleSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof LocaleSchema>;

export const ASSET_KINDS = ["image", "audio", "video"] as const;
export const AssetKindSchema = z.enum(ASSET_KINDS);
export type AssetKind = z.infer<typeof AssetKindSchema>;

/** Media is served over TLS only — no mixed-content assets reach a child's device. */
const HttpsUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith("https://"), {
    message: "url must use https",
  });

/** Both locales required — see the localisation rule in this file's header. */
export const LocalizedTextSchema = z
  .object({
    en: z.string().min(1),
    bn: z.string().min(1),
  })
  .strict();
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;

export const AssetRefSchema = z
  .object({
    kind: AssetKindSchema,
    url: HttpsUrlSchema,
    alt: LocalizedTextSchema.optional(),
  })
  .strict();
export type AssetRef = z.infer<typeof AssetRefSchema>;

/** Kind-narrowed asset refs: a field named `image` holding `kind: "audio"` is never meaningful. `.extend()` carries the strict flag over. */
export const ImageAssetRefSchema = AssetRefSchema.extend({
  kind: z.literal("image"),
});
export type ImageAssetRef = z.infer<typeof ImageAssetRefSchema>;

export const AudioAssetRefSchema = AssetRefSchema.extend({
  kind: z.literal("audio"),
});
export type AudioAssetRef = z.infer<typeof AudioAssetRefSchema>;

/** Prompt/instruction audio, required in both locales (FR-QUIZ-05, FR-I18N-05). */
export const LocalizedAudioSchema = z
  .object({
    en: AudioAssetRefSchema,
    bn: AudioAssetRefSchema,
  })
  .strict();
export type LocalizedAudio = z.infer<typeof LocalizedAudioSchema>;
