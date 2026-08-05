# Compliance note — parental consent & account deletion

> Source of truth for how kidlearn satisfies COPPA verifiable parental consent
> and the GDPR right to erasure. Written for file 10; update it whenever the
> consent text, the consent record, or the deletion path changes.
> Requirements: FR-AUTH-03, FR-AUTH-05, NFR-SAFE-03, NFR-SAFE-05, NFR-SAFE-06.

## What the consent record stores

| Column | Meaning |
|---|---|
| `Parent.consentGivenAt` | **When** — UTC timestamp of the last affirmative consent. |
| `Parent.consentVersion` | **What** — the version string of the consent text that was on screen, e.g. `2026-06-v1`. |
| `Parent.userId` → `User` | **Who** — the Google-verified identity that agreed (email, name). |

The current text version is the server constant `CONSENT_VERSION` in
`apps/server/src/lib/consent.ts`. Posting any other version to
`POST /api/parent/consent` is a `409 CONFLICT`, so a client can never record
agreement to text the parent did not see. Re-consenting is idempotent: it
refreshes the timestamp and version rather than creating a second row.

Consent is enforced server-side by `requireConsent`, which returns
`403 CONSENT_REQUIRED` while `consentGivenAt` is null. File 11 mounts it on
`POST /api/children`, so **no child record can exist before consent**. A
checkbox the frontend could skip would not be verifiable consent; the guard is.

Identity is established by Google OAuth (FR-AUTH-02) — the consenting adult is a
verified account holder, not an unauthenticated form submission.

## Deletion is synchronous and complete

`DELETE /api/parent/account` runs one transaction
(`apps/server/src/services/accountDeletionService.ts`):

1. `childProfile.deleteMany({ parentId })` — each child row cascades to
   `LessonProgress`, `QuizResponse`, `RewardLedger`, `ChildCharacter`,
   `Streak`, `ScreenTimeSetting`, `SessionEvent` and `WeeklyReport`.
2. `parent.delete` — PIN hash, consent record, deletion token.
3. `user.delete` — the better-auth identity, cascading `Session` and `Account`,
   which is what invalidates the caller's cookie.

There is **no soft-delete, no tombstone and no archive** of child PII. Nothing
is queued for later; when the request returns, the data is gone. Deletion is
gated by a two-step flow — a PIN-verified `POST /account/delete-request` issues
a single-use 32-byte token valid for 15 minutes, compared with
`timingSafeEqual` — so it cannot be triggered by a stray click or a CSRF-style
request.

## What is intentionally retained

Nothing personal. Shared content rows — `Badge`, `Character`, lessons, quizzes —
survive because they were never the child's data; only the child-owned join and
ledger rows referencing them are deleted. Anonymous aggregate counters (totals
with no `childId`, `parentId` or free text) are permissible and are not
re-identifiable. No such counter exists yet; adding one that stores an
identifier would require updating this note first.

## Regulatory mapping

| Obligation | How it is met |
|---|---|
| COPPA §312.5 — verifiable parental consent before collecting a child's data | Google-authenticated parent + `consentGivenAt`/`consentVersion` record; `requireConsent` blocks child creation until it exists |
| COPPA §312.6 — parent may review and delete the child's information | Parent dashboard (files 29–30) for review; per-child delete (file 11) and full-account delete here |
| COPPA §312.8 — retain only as long as necessary | Deletion is immediate and total; no retention window |
| GDPR Art. 17 — right to erasure | `DELETE /api/parent/account`, synchronous, no soft-delete |
| GDPR Art. 7(1) — demonstrate consent was given | Timestamp + version + verified identity, queryable per parent |
| GDPR Art. 8 — child consent given by the holder of parental responsibility | Only the parent account can consent; children never authenticate |
| NFR-SAFE-06 — audit trail of consent and deletion | This document plus the columns above |

## Known gaps (post-MVP)

- **Data export** (GDPR Art. 20 portability) is not implemented — out of scope
  for file 10.
- **Deletion confirmation is in-band**: the token is returned in the API
  response rather than emailed. The email step replaces one handler without
  changing the HTTP contract.
- **No deletion audit log.** Because erasure is total, the deletion itself
  leaves no record. If a regulator-facing log is ever required, it must store
  only a non-identifying event, never the deleted email.
