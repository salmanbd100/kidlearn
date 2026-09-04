import { z } from "zod";
import { AssetKindSchema, LocaleSchema } from "../primitives.js";
import { IsoDateTimeSchema, ok } from "./envelope.js";

/** `/api/admin/media` — the media library (file 33, FR-CMS-02). */
export const MediaAssetSchema = z
  .object({
    id: z.string(),
    /** A Cloudinary delivery URL for this deployment's cloud. */
    url: z.string(),
    kind: AssetKindSchema,
    /**
     * `null` for a language-neutral asset. An illustration has no language; a
     * narration clip does, and getting it wrong is how a Bangla learner hears
     * English (FR-I18N-01).
     */
    language: LocaleSchema.nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .strict();

export type MediaAsset = z.infer<typeof MediaAssetSchema>;

/** What the browser needs to post a file **directly** to Cloudinary. */
export const UploadSignatureSchema = z
  .object({
    timestamp: z.number().int(),
    folder: z.string(),
    signature: z.string(),
    apiKey: z.string(),
    cloudName: z.string(),
  })
  .strict();

export type UploadSignature = z.infer<typeof UploadSignatureSchema>;

export const UploadSignatureResponseSchema = ok(UploadSignatureSchema);
export const MediaAssetResponseSchema = ok(MediaAssetSchema);
export const MediaAssetListResponseSchema = ok(z.array(MediaAssetSchema));
