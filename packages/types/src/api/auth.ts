import { z } from "zod";
import { IsoDateTimeSchema, ok } from "./envelope.js";

/**
 * The signed-in parent as the client sees them.
 *
 * An allowlist, not an omission — `pinHash` and the PIN-lockout counters live on
 * the same row and must never cross the wire. `hasPin` is the whole of what a
 * client needs: it decides between "set a PIN" and "enter your PIN".
 */
export const ParentSummarySchema = z
  .object({
    id: z.string(),
    email: z.string().email(),
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
