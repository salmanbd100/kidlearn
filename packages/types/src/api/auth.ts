import { z } from "zod";
import { IsoDateTimeSchema, ok } from "./envelope.js";

/** The signed-in parent as the client sees them. */
export const ParentSummarySchema = z
  .object({
    id: z.string(),
    email: z.string().email(),
    /**
     * Display name and photo as Google gave them at sign-in. Both nullable: a
     * Google account may carry neither, so every surface needs a fallback.
     */
    name: z.string().nullable(),
    avatarUrl: z.string().url().nullable(),
    hasPin: z.boolean(),
    /** `null` until the parent accepts COPPA consent (FR-AUTH-03). */
    consentGivenAt: IsoDateTimeSchema.nullable(),
  })
  .strict();

export type ParentSummaryResponse = z.infer<typeof ParentSummarySchema>;

export const AuthMeSchema = z
  .object({
    parent: ParentSummarySchema,
    /**
     * Which child the session is currently acting as (FR-AUTH-06). `null` until
     * `POST /api/children/{id}/activate` sets it, and the content API answers
     * 403 for the whole of that time.
     */
    activeChildProfileId: z.string().nullable(),
  })
  .strict();

export const AuthMeResponseSchema = ok(AuthMeSchema);
