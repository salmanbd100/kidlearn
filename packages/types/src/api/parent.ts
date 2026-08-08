import { z } from "zod";
import { IsoDateTimeSchema, ok } from "./envelope.js";

/**
 * `/api/parent` — the parent's own account: PIN, consent, deletion.
 *
 * Note what is absent from every schema here: the PIN, its hash, the failed
 * attempt count, and the lockout expiry. A PIN response says only that one
 * exists.
 */

export const PinStatusSchema = z.object({ hasPin: z.literal(true) }).strict();

export const PinGrantSchema = z
  .object({
    /**
     * When the 15-minute parent-area grant on this session expires. The client
     * uses it to hide the parent dashboard proactively rather than waiting for a
     * 403 `PIN_VERIFICATION_REQUIRED` on the next request.
     */
    pinVerifiedUntil: IsoDateTimeSchema,
  })
  .strict();

export const ConsentRecordSchema = z
  .object({
    consentGivenAt: IsoDateTimeSchema,
    /** The consent text version accepted, e.g. `2026-06-v1`. */
    consentVersion: z.string(),
  })
  .strict();

export const DeletionRequestSchema = z
  .object({
    /** 64 hex characters. Pass it back to `DELETE /api/parent/account`. */
    confirmationToken: z.string(),
    expiresAt: IsoDateTimeSchema,
  })
  .strict();

export const DeletedSchema = z.object({ deleted: z.literal(true) }).strict();

export const PinStatusResponseSchema = ok(PinStatusSchema);
export const PinGrantResponseSchema = ok(PinGrantSchema);
export const ConsentRecordResponseSchema = ok(ConsentRecordSchema);
export const DeletionRequestResponseSchema = ok(DeletionRequestSchema);
export const DeletedResponseSchema = ok(DeletedSchema);
