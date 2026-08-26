import { z } from "zod";
import { AssetKindSchema, LocaleSchema } from "../primitives.js";
import { IsoDateTimeSchema, ok } from "./envelope.js";

/**
 * `/api/admin/media` — the media library (file 33, FR-CMS-02).
 *
 * `AssetKindSchema` and `LocaleSchema` are reused rather than mirrored: Prisma's
 * `MediaKind` and `Language` hold exactly the same values these already carry,
 * and `apps/server/src/openapi/paths/admin-media.ts` asserts that at compile
 * time. One spelling of "audio" across the payload schemas, the database and this
 * API.
 */
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

/**
 * What the browser needs to post a file **directly** to Cloudinary.
 *
 * Note what is absent: the API secret. It signs `timestamp` and `folder` on the
 * server and never leaves it, which is the whole reason this endpoint exists
 * rather than an upload preset the client could use unsigned.
 *
 * `signature` covers exactly `timestamp` and `folder`, so the upload form must
 * send those two and no other signed field — Cloudinary verifies the signature
 * over the parameters it was computed from and answers `Invalid Signature`
 * otherwise.
 */
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
