import { z } from "zod";
import { IsoDateTimeSchema, ok } from "./envelope.js";

// `/api/parent` — the parent's own account: PIN, consent, deletion.

/** The consent text a parent is currently asked to accept (FR-AUTH-03). */
export const CONSENT_VERSION = "2026-06-v1";

/** The answer to `POST /api/parent/pin`. */
export const PinStatusSchema = z
  .object({
    hasPin: z.literal(true),
    pinVerifiedUntil: IsoDateTimeSchema,
  })
  .strict();

/**
 * Whether the parent area is open right now — the answer `GET
 * /api/parent/gate-status` exists to give.
 */
export const GateStatusSchema = z
  .object({
    hasPin: z.boolean(),
    /** True only while a live grant covers this session. */
    isPinVerified: z.boolean(),
    /** When the live grant lapses. `null` whenever `isPinVerified` is false. */
    pinVerifiedUntil: IsoDateTimeSchema.nullable(),
  })
  .strict();

export type GateStatusResponse = z.infer<typeof GateStatusSchema>;

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
export const GateStatusResponseSchema = ok(GateStatusSchema);
export const ConsentRecordResponseSchema = ok(ConsentRecordSchema);
export const DeletionRequestResponseSchema = ok(DeletionRequestSchema);
export const DeletedResponseSchema = ok(DeletedSchema);
