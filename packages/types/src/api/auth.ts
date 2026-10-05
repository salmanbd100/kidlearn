import { z } from "zod";
import { IsoDateTimeSchema, ok } from "./envelope.js";

/** The signed-in parent as the client sees them. */
export const ParentSummarySchema = z
  .object({
    id: z.string(),
    email: z.string().email(),
    /** Name and photo as Google gave them; both nullable, so every surface needs a fallback. */
    name: z.string().nullable(),
    avatarUrl: z.string().url().nullable(),
    /** `null` until the parent accepts COPPA consent (FR-AUTH-03). */
    consentGivenAt: IsoDateTimeSchema.nullable(),
  })
  .strict();

export type ParentSummaryResponse = z.infer<typeof ParentSummarySchema>;

export const AuthMeSchema = z
  .object({
    parent: ParentSummarySchema,
    /**
     * The child the session acts as (FR-AUTH-06); `null` until `POST /api/children/{id}/activate`,
     * and the content API answers 403 until then.
     */
    activeChildProfileId: z.string().nullable(),
  })
  .strict();

export type AuthMeResponse = z.infer<typeof AuthMeSchema>;

export const AuthMeResponseSchema = ok(AuthMeSchema);
