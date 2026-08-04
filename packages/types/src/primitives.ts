/**
 * Shared primitives for every versioned content payload in kidlearn.
 *
 * ## Versioning rule (NFR-SCALE-02) — read before editing any schema here
 *
 * Every payload carries `schemaVersion` as a Zod **literal**. Revisions are
 * strictly additive: to introduce a v2 shape, add a new schema with
 * `schemaVersion: z.literal(2)` and widen the top-level union to include it.
 * Never edit a shipped v1 schema in a way that would stop already-stored
 * JSONB from parsing — rows written months ago must keep parsing forever.
 *
 * ## Localisation rule (FR-I18N-01, FR-I18N-05)
 *
 * Every child-facing string and every prompt audio clip is required in *both*
 * locales. These use `z.object` rather than `z.record` deliberately: `z.record`
 * infers optional keys, which would let a missing `bn` translation slip past
 * the compiler. `z.object` makes both locales statically required.
 *
 * ## Strictness rule
 *
 * Every object schema in this package is `.strict()`. Zod's default is to strip
 * unknown keys silently, which is the wrong behaviour for a validator that gates
 * author submissions and AI-generated payloads (files 33–35): a misspelled
 * `promptAudioo` or a hallucinated third locale would vanish instead of being
 * reported, and the human reviewer would approve a payload that lost data.
 * Strict mode turns those into issues the `400` response can name.
 *
 * Note the interaction with the versioning rule above: a v2 field must arrive
 * with a `schemaVersion: 2` schema, never as an extra key on a v1 payload.
 */
import { z } from "zod";

/** The current content schema version. Bump only by adding a new literal union member. */
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

/**
 * Kind-narrowed asset refs. A field named `image` holding `kind: "audio"` is
 * never meaningful, so the field's role pins the kind — the same reasoning the
 * spec applies to `LocalizedAudio`. `.extend()` carries the strict flag over.
 */
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
