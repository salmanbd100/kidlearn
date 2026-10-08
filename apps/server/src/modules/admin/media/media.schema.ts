import { AssetKindSchema, LocaleSchema } from "@kidlearn/types";
import { z } from "zod";
import { isDeliveryUrl } from "./media.service.js";

export const MediaKindSchema = AssetKindSchema;
export const MediaLanguageSchema = LocaleSchema;

// The only thing the browser chooses; it decides the folder the signature is computed over.
export const SignUploadSchema = z.object({ kind: MediaKindSchema }).strict();

export type SignUploadBody = z.infer<typeof SignUploadSchema>;

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

export const MEDIA_PAGE_SIZE = 100;

// Cursor paging: `before` is the last asset id the caller has; a page shorter than `limit` is the last.
export const MediaListQuerySchema = z
  .object({
    kind: MediaKindSchema.optional(),
    language: MediaLanguageSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(MEDIA_PAGE_SIZE),
    before: z.string().uuid().optional(),
  })
  .strict();

export type MediaListQuery = z.infer<typeof MediaListQuerySchema>;
