/** Route-boundary schemas for `/api/admin/media/*` (file 33, FR-CMS-02). */
import { AssetKindSchema, LocaleSchema } from "@kidlearn/types";
import { z } from "zod";
import { isDeliveryUrl } from "./media.service.js";

export const MediaKindSchema = AssetKindSchema;
export const MediaLanguageSchema = LocaleSchema;

/**
 * What is being uploaded — the only thing the browser gets to choose, because it
 * decides the folder the signature is computed over.
 */
export const SignUploadSchema = z.object({ kind: MediaKindSchema }).strict();

export type SignUploadBody = z.infer<typeof SignUploadSchema>;

/** The delivery URL Cloudinary handed the browser, plus what the asset is. */
export const RegisterAssetSchema = z
  .object({
    url: z.string().url(),
    kind: MediaKindSchema,
    language: MediaLanguageSchema.nullable().default(null),
  })
  .strict()
  .refine((value) => isDeliveryUrl(value.url), {
    path: ["url"],
    message: "url must be a Cloudinary delivery URL for this cloud",
  });

export type RegisterAssetBody = z.infer<typeof RegisterAssetSchema>;

/** The page size when a caller does not ask for one. */
export const MEDIA_PAGE_SIZE = 100;

/**
 * Both filters are optional: the library grid opens unfiltered. Paged by cursor —
 * `before` is the id of the last asset the caller already has — and a page
 * shorter than `limit` is the last one, so the response stays a plain list.
 */
export const MediaListQuerySchema = z
  .object({
    kind: MediaKindSchema.optional(),
    language: MediaLanguageSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(MEDIA_PAGE_SIZE),
    before: z.string().uuid().optional(),
  })
  .strict();

export type MediaListQuery = z.infer<typeof MediaListQuerySchema>;
