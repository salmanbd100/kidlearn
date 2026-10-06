import { z } from "zod";
import { IsoDateTimeSchema, ok } from "./envelope.js";

// `/api/parent` — the parent's own account: consent and deletion.

/** The consent text a parent is currently asked to accept (FR-AUTH-03). */
export const CONSENT_VERSION = "2026-06-v1";

/** Consent to an older text is not consent to this one, so a version bump sends every parent back through it (NFR-SAFE-03). */
export function hasCurrentConsent(parent: {
  consentGivenAt: Date | string | null;
  consentVersion: string | null;
}): boolean {
  return (
    parent.consentGivenAt !== null && parent.consentVersion === CONSENT_VERSION
  );
}

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

export const ConsentRecordResponseSchema = ok(ConsentRecordSchema);
export const DeletionRequestResponseSchema = ok(DeletionRequestSchema);
export const DeletedResponseSchema = ok(DeletedSchema);
