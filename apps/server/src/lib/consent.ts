/**
 * COPPA / GDPR consent contract (FR-AUTH-03, NFR-SAFE-03).
 *
 * `CONSENT_VERSION` identifies the consent text a parent actually agreed to.
 * Bump it whenever the wording changes in a way that alters what is being
 * agreed to — the stored `Parent.consentVersion` then no longer matches, and
 * `POST /api/parent/consent` will reject a client still posting the old version
 * so the parent is re-shown the new text. Cosmetic copy edits do not warrant a
 * bump; anything that changes the scope of data collection does.
 *
 * What the consent record means is documented in
 * `document/implementation/notes/compliance-consent-deletion.md`.
 */
export const CONSENT_VERSION = "2026-06-v1";
