import { z } from "zod";
import { IsoDateTimeSchema, ok } from "./envelope.js";

/**
 * `/api/parent` — the parent's own account: PIN, consent, deletion.
 *
 * Note what is absent from every schema here: the PIN, its hash, the failed
 * attempt count, and the lockout expiry. A PIN response says only that one
 * exists.
 */

/**
 * The consent text a parent is currently asked to accept (FR-AUTH-03).
 *
 * It lives here, shared by both sides, because it is a *client* contract in the
 * same way `ERROR_CODES` is: `POST /api/parent/consent` rejects any other version
 * with a `409`, so the consent screen has to know which version the copy it is
 * rendering corresponds to. The alternative was for the client to post a guess
 * and re-post whatever `error.details.currentVersion` came back with, which
 * records agreement to text the parent never saw.
 *
 * Bump it whenever the wording changes in a way that alters what is being agreed
 * to — that includes the copy in `apps/web/locales/*\/parent.json`, which is
 * where a parent actually reads it. Cosmetic edits do not warrant a bump;
 * anything that changes the scope of data collection does.
 *
 * What the stored consent record itself means is documented in
 * `document/implementation/notes/compliance-consent-deletion.md`.
 */
export const CONSENT_VERSION = "2026-06-v1";

export const PinStatusSchema = z.object({ hasPin: z.literal(true) }).strict();

/**
 * Whether the parent area is open right now — the answer `GET
 * /api/parent/gate-status` exists to give.
 *
 * Without it the client's only way to discover the state of the gate is to call
 * a PIN-gated endpoint and read the `403`, and the only such endpoint is
 * "request account deletion", which mints a deletion token as a side effect. So
 * this is a read-only probe of the two things the gate depends on.
 *
 * `hasPin` and `isPinVerified` are separate because they lead to different
 * screens: no PIN means setup, a lapsed grant means the PIN pad. That is the
 * same distinction `PIN_REQUIRED` and `PIN_VERIFICATION_REQUIRED` draw behind a
 * 403.
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
