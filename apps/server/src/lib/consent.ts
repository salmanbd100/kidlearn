/**
 * COPPA / GDPR consent contract (FR-AUTH-03, NFR-SAFE-03).
 *
 * `CONSENT_VERSION` identifies the consent text a parent actually agreed to. It
 * moved to `@kidlearn/types` in file 14 and is re-exported here so every existing
 * import keeps working: the consent *screen* has to name the same version, and a
 * constant the client has to guess at is not a contract. The full reasoning, and
 * the rule for when to bump it, are in the docstring there.
 *
 * What the consent record means is documented in
 * `document/implementation/notes/compliance-consent-deletion.md`.
 */
export { CONSENT_VERSION } from "@kidlearn/types";
