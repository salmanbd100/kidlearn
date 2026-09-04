/** Route-boundary schemas for `/api/admin/media/*` (file 33, FR-CMS-02). */
import { AssetKindSchema, LocaleSchema } from "@kidlearn/types";
import { z } from "zod";
import { deliveryUrlPrefix } from "../services/mediaService.js";

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
  .refine((value) => value.url.startsWith(deliveryUrlPrefix()), {
    path: ["url"],
    message: "url must be a Cloudinary delivery URL for this cloud",
  });

export type RegisterAssetBody = z.infer<typeof RegisterAssetSchema>;

/** Both filters are optional: the library grid opens unfiltered. */
export const MediaListQuerySchema = z
  .object({
    kind: MediaKindSchema.optional(),
    language: MediaLanguageSchema.optional(),
  })
  .strict();

export type MediaListQuery = z.infer<typeof MediaListQuerySchema>;
