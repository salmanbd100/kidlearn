/**
 * Route-boundary schemas for `/api/admin/media/*` (file 33, FR-CMS-02).
 *
 * `AssetKindSchema` and `LocaleSchema` are re-exported from `@kidlearn/types`
 * rather than rebuilt, for the reason `schemas/admin-content.ts` gives about
 * grades: they are the same three kinds and two locales the content payloads
 * already speak, and a second spelling of either is a thing that drifts. Both
 * happen to match Prisma's `MediaKind` and `Language` exactly, which
 * `openapi/paths/admin-media.ts` asserts at compile time.
 */
import { AssetKindSchema, LocaleSchema } from "@kidlearn/types";
import { z } from "zod";
import { deliveryUrlPrefix } from "../services/mediaService.js";

export const MediaKindSchema = AssetKindSchema;
export const MediaLanguageSchema = LocaleSchema;

/**
 * What is being uploaded — the only thing the browser gets to choose, because it
 * decides the folder the signature is computed over.
 *
 * No filename, no size, no MIME type: those are Cloudinary's business, and a
 * client-declared size is not a limit anybody could rely on. Quota and format
 * hardening are the upload preset's job (file 38).
 */
export const SignUploadSchema = z.object({ kind: MediaKindSchema }).strict();

export type SignUploadBody = z.infer<typeof SignUploadSchema>;

/**
 * The delivery URL Cloudinary handed the browser, plus what the asset is.
 *
 * **The refinement is the whole security of this endpoint.** The client reports
 * the URL — nothing else can, since the upload bypassed this server — so without
 * a check that it is a delivery URL for *our* cloud, `POST /api/admin/media`
 * would write any address on the internet into a row a child's lesson later
 * plays. Cross-checked against `deliveryUrlPrefix()` rather than a literal, so
 * the schema and the module that builds the URLs cannot disagree about the host.
 *
 * `language` is explicitly nullable rather than optional-and-absent: an image
 * carries no language and that is a fact worth recording, not a gap. `.default`
 * makes omitting it mean exactly that.
 *
 * Zod refinements are dropped in JSON Schema conversion, so the host rule is
 * restated in the operation's OpenAPI description (`backend.md §7`).
 */
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
