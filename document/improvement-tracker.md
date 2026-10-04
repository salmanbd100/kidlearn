# kidlearn — Improvement Tracker

> **Source:** `document/improvement-plan.md` — §7 for every `R-` item, §3 for every `V1-` item.
> The plan says *what* and *why*; this file says *what is next* and *what is done*.
> **How to use:** take the first `⬜ Not started` row whose **Depends on** is satisfied. One item
> per branch, named `improve/<id>-<slug>` (e.g. `improve/r-01-db-connection-limit`), off `dev`.
> Status: `⬜ Not started` → `🟨 In progress` → `✅ Done` (or `⏭ Won't do`, with the reason).
> **Done means:** the fix, a test that fails without it (where the item is code), lint, build,
> typecheck and test green locally, and `gates` green on the PR. Record the PR number in **Notes**.
> **✔** in the plan means the finding was re-read independently; without it, re-confirm the
> finding against the code before writing the fix — and mark it `⏭ Won't do` if it does not hold.

---

## Phase A — Live defects (do first)

| # | ID | Item | Sev. | Area | Depends on | Est. | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | R-01 | Production DB `connection_limit=1` serialises the API; retry `P2028` | High | server, docs | — | 1h | ✅ Done | `connection_limit=5` (Prisma's default on 2 vCPU, stated so nobody sets `=1`); only the never-started `P2028` is retried, not an expired transaction. Update the SSM `DATABASE_URL` before the next deploy — PR #56 |
| 2 | R-02 | Badge publish skips the AI-review check on its icon | High | server | — | 1h | ✅ Done | Guard reads `iconAsset.aiJobId`; published badges are already uneditable, so the icon cannot be swapped afterwards — PR #56 |
| 3 | R-03 | Quiz submission bypasses the screen-time lock | Medium | server | — | 1h | ✅ Done | `assertMayOpenLesson` before grading — only blocks when no progress row exists, so a lesson under way still finishes — PR #56 |
| 4 | R-04 | Quiz responses not awaited before `completeLesson` — rewards lost | Medium | web, server | — | 2h | ✅ Done | `RewardStep` awaits a per-lesson `PendingWrites` before completing (bounded by the 20s fetch timeout). Submission still `retries: 0` — making it idempotent per question/attempt is left open, so a dropped upload still loses the quiz reward — PR #56 |
| 5 | R-05 | One invalid payload 500s the whole lesson | Medium | server | — | 1h | ✅ Done | Corrupt or mismatched activity → `null`, question → omitted, all questions → `quiz: null`; each still logged at `error` — PR #56 |
| 6 | R-10 | Parent lock overlaps kid controls in lesson and story | High | web | — | 1h | ✅ Done | Overlap computed from classes, not measured on a device: lock covers a 36×36px patch of the exit X. Lock now hidden on `/lesson/*` and `/stories/[id]` — PR #56 |
| 7 | R-07 | Child-profile deletion uses the 5s transaction default | Medium | server | — | 1h | ✅ Done | Single `delete`, no interactive transaction; session pointer cleared by the existing `SET NULL` FK, now asserted against the schema. Real-DB proof waits on V1-P0-2 — PR #56 |
| 8 | R-08 | Weekly-report job reports success on failure; curl retry runs it twice | Medium | server, deploy | — | 2h | ✅ Done | `childrenFailed` in the result, `500` when above zero; overlapping calls join the in-flight run. Kept sequential, per the endpoint's recorded pool-sharing decision — PR #56 |
| 9 | R-06 | Lesson/story completion without play-through | Low/Med | server | R-03 | 2h | 🟨 In progress | **Lessons only.** Completion needs a row at/past `activity` (or already complete) → else `409 LESSON_NOT_PLAYED`; step reports join `PendingWrites`. **Stories not done — decision needed:** the only proof of play is `story_start`, sent with `retries: 0`, so gating on it would cost children rewards on a flaky network — PR #56 |

## Phase B — Web correctness

| # | ID | Item | Sev. | Area | Depends on | Est. | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | R-09 | Radix portals render parent/admin dialogs in the kid theme | Medium | web, ui | — | 1–2h | ⬜ Not started | |
| 11 | R-11 | Child's language overwrites the parent's cookie | Medium | web | — | 1h | ⬜ Not started | |
| 12 | R-12 | Admin session ignores 401s | Medium | web | — | 1h | ⬜ Not started | |
| 13 | R-13 | Bangla preview plays English quiz/activity content | Medium | web | — | 1h | ⬜ Not started | |
| 14 | R-15 | Safe-area insets and `min-h-dvh` applied twice; `vh` → `dvh` | Medium | web | — | 1–2h | ⬜ Not started | Check on a notched device in landscape |
| 15 | R-14 | Narration survives leaving a lesson; resume mounts intro | Low | web | — | 1h | ⬜ Not started | |
| 16 | V1-P1-1 / R-30 | `error.tsx` + `not-found.tsx` for `(parent)` and `(admin)` | Low | web | — | 1–2h | ⬜ Not started | |

## Phase C — Accessibility

| # | ID | Item | Sev. | Area | Depends on | Est. | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 17 | R-18 | Static wrong-answer cue; contrast of ticks and progress dots; non-text contrast test | Medium | web, ui | — | 2h | ⬜ Not started | |
| 18 | R-17 | Focus management on question/step/page change | Medium | web | — | 2h | ⬜ Not started | |
| 19 | R-16 | Tap-to-place for drag activities; droppable-jumping keyboard sensor | Medium | web | — | 3–4h | ⬜ Not started | |
| 20 | R-19 | Kid close-button size, celebration durations, `IconControl` cva | Low | web | — | 1–2h | ⬜ Not started | |

## Phase D — Security hardening

| # | ID | Item | Sev. | Area | Depends on | Est. | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 21 | V1-P1-2 / R-20 | `helmet` + CSP, explicit JSON limit, `/api/*` rate limit | Medium | server | — | 2–3h | ⬜ Not started | Check Scalar's CDN default first |
| 22 | R-21 | OAuth callback `code`/`state` written to logs | Low | server | — | 0.5h | ⬜ Not started | |
| 23 | R-23 | Content asset URLs unchecked; Cloudinary signature scope; unpaged media list | Low | server, types | R-02 | 2–3h | ⬜ Not started | |
| 24 | R-22 | Admin sessions live 30 days | Low | server | — | 1h | ⬜ Not started | MFA is a separate decision |

## Phase E — Data, schema and performance

| # | ID | Item | Sev. | Area | Depends on | Est. | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 25 | R-24 | Lenient read parse + `migratePayload` for content payloads | Medium | types, web, server | R-05 | 2–3h | ⬜ Not started | |
| 26 | R-25 | `SessionEvent` retention; one dashboard read instead of three | Low/Med | server | — | 2h | ⬜ Not started | |
| 27 | R-27 | Parallel kid-screen fetches; font preloads; dead preload cache; amend `frontend.md §3` | Low/Med | web, docs | — | 2–3h | ⬜ Not started | |
| 28 | R-26 | Migration locking convention; stale migration line in the walkthrough | Low | db, docs | — | 1h | ⬜ Not started | |

## Phase F — Ops and supply chain

| # | ID | Item | Sev. | Area | Depends on | Est. | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 29 | R-28 | `pg_dump` version; deploy writes tag before health gate; `CRON_SECRET` in `ps` | Medium | deploy | — | 2h | ⬜ Not started | Needs `SELECT version()` from you |
| 30 | R-29 | Pin Actions by SHA; add Dependabot | Low | ci | — | 1h | ⬜ Not started | `promotion-guard` stays with file 38a |

## Phase G — Housekeeping

| # | ID | Item | Sev. | Area | Depends on | Est. | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 31 | V1-P1-4 / R-31 | Correct `frontend.md` and the `create-component` skill | Low | docs | — | 1h | ⬜ Not started | |
| 32 | R-32 | Uncommented `as` casts; unused `dotenv`; video captions decision | Low | server, ui, db | — | 1h | ⬜ Not started | |

## Carried from v1 — larger items

These are the v1 findings still open. Each is bigger than one sitting; split them when you start.

| # | ID | Item | Area | Depends on | Est. | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 33 | V1-P0-2a | Test-database harness: `globalSetup`, migrate, truncation, factories | server | — | 3–4h | ⬜ Not started | Was proposed file 42; also unblocks the Supertest flake fix |
| 34 | V1-P0-2b | Port content-safety, cascade and reward-ledger suites to the real DB; split `progress.routes.test.ts` | server | V1-P0-2a | 4–6h | ⬜ Not started | Was proposed file 43 |
| 35 | V1-P2-3 | pnpm catalog, `engines.node` + `.nvmrc`, `@types/node` to 22 | repo | — | 1–2h | ⬜ Not started | Upgrade ladder after V1-P0-2b |
| 36 | V1-P2-2 | One locale-resolution function in `packages/types` | types, web, server | — | 1–2h | ⬜ Not started | |
| 37 | V1-P2-4 | Split `admin-api.ts` and `review.ts` | web, server | — | 2–3h | ⬜ Not started | Opportunistic, per v1 |
| 38 | V1-P2-1 | `packages/tokens` and `packages/i18n` | packages | V1-P2-3 | 3–4h | ⬜ Not started | Mobile prerequisite |
