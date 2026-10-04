# kidlearn — Pre-Deployment Improvement Plan

> **Status:** proposed, 2026-09-04. Written after files 01–37a were complete and before file 38
> (deployment) was started.
> **Scope:** what needs to change so this codebase stays maintainable for years, not what needs
> to change to ship. Two of the findings block a safe deployment; the rest are debt that is
> cheap to clear now and expensive to clear after `apps/mobile` exists.
> **Method:** the whole tree was read and every check in §1 was actually run. Numbers in this
> document are measured, not estimated. Where something is inferred rather than verified, it
> says so.
>
> **Updated 2026-10-04 — second review.** §1–§6 are the v1 plan and stay as written, as the record
> of what was found on 2026-09-04. §7 is a second whole-codebase review on commit `a00244e`: the
> status of every v1 finding, and 32 new ones. The work list for both lives in
> [`improvement-tracker.md`](improvement-tracker.md) — one row per item, done one at a time.

---

## Table of Contents

1. [Verified baseline](#1-verified-baseline)
2. [What is already good — and should not be touched](#2-what-is-already-good--and-should-not-be-touched)
3. [Findings, ranked](#3-findings-ranked)
4. [Sequenced roadmap — implementation files 39–46](#4-sequenced-roadmap--implementation-files-3946)
5. [Harness updates — CLAUDE.md, README, skills, agents](#5-harness-updates--claudemd-readme-skills-agents)
6. [Explicitly not recommended](#6-explicitly-not-recommended)
7. [Second review — 2026-10-04](#7-second-review--2026-10-04)

---

## 1. Verified baseline

Every command below was run from the repo root on 2026-09-04, on commit `08bb5fe`.

| Check | Command | Result |
| --- | --- | --- |
| Lint | `pnpm lint` | **Clean** — 591 files, no findings |
| Types | `pnpm typecheck` | **Clean** — 7/7 tasks |
| Tests | `pnpm test` + per-package runs | **2,526 passing, 0 failing** |
| — `apps/server` | | 64 files, 1,354 tests |
| — `apps/web` | | 91 files, 991 tests |
| — `packages/types` | | 4 files, 163 tests |
| — `packages/ui` | | 2 files, 18 tests |
| — `packages/db` | | 1 file (schema text assertions) |

Size and hygiene:

| Metric | Value |
| --- | --- |
| Source lines (`.ts`/`.tsx`, incl. tests) | ~92,300 |
| `apps/server/src` | 193 files / 46,599 lines |
| `apps/web` | 305 files / 40,400 lines |
| `packages/types/src` | 38 files / 4,427 lines |
| `packages/ui/src` | 10 files / 597 lines |
| Prisma models / migrations | 37 models, 22 migrations |
| `TODO` / `FIXME` / `HACK` markers | **0** |
| `console.log` outside tests | **2** |
| `@ts-ignore` / `@ts-expect-error` / `biome-ignore` | 14 total |
| Commits on `main` | 118 |

**This is a healthy codebase.** The findings below are not a rescue plan. They are the
difference between a codebase that is currently clean and one that stays clean while a third
client, a second engineer and a year of feature work land on it.

---

## 2. What is already good — and should not be touched

Naming these matters, because a refactor plan that does not say what to leave alone invites
churn.

- **The OpenAPI coverage gate** (`apps/server/src/openapi/coverage.test.ts`). A test that walks
  the live Express routers and fails on an undocumented route is the single best structural
  decision in the repo. Everything else in this plan should aspire to that pattern: a rule the
  machine enforces, not a rule a reviewer remembers.
- **`assertContract` on every successful response.** Response schemas in `packages/types` that
  document *and* test, without policing bodies at runtime, is the right trade.
- **Env validation** (`apps/server/src/config/env.ts`). Zod-parsed, frozen, fail-fast at boot, with
  the *why* commented on the non-obvious entries (`APP_TIMEZONE`, the TTS voice regex). Nothing
  to improve.
- **Error handling.** One terminal handler, `ApiError`/`ZodError` mapped to envelopes, unknown
  errors logged server-side and flattened to `INTERNAL`. Correlation ids reused from an inbound
  `x-request-id`. This is production-grade already.
- **The recorded-exception convention** in the standards documents. Dated, bounded, with a stated
  exit condition and — in the Prisma-stub case — an honest accounting of what the deviation has
  already cost. Keep writing exceptions this way.
- **Comment discipline.** Comments explain *why*, consistently, across 92k lines. Do not let a
  refactor dilute this.

---

## 3. Findings, ranked

### P0-1 — There is no CI pipeline

**Evidence:** no `.github/` directory exists. `document/standards/general.md §6` defines a `[CI]`
enforcement tier — "blocks merge" — and `backend.md §7` says the OpenAPI rule "is enforced, not
requested". Neither statement is true today. Every `[CI]` tag in the standards is currently a
`[REVIEW]` tag wearing a costume.

**Why it matters long-term:** the repo has exactly one enforcement mechanism right now — the
engineer remembering to run four commands. That works at 118 commits and one contributor. It
does not survive the first tired Friday, and it definitely does not survive `apps/mobile`
tripling the surface area. The gates already exist and already pass; they are just not wired to
anything.

**Fix:** one workflow, `.github/workflows/ci.yml`, on push and pull request:

```
pnpm install --frozen-lockfile
pnpm lint
pnpm build          # ^build is required before typecheck resolves
pnpm typecheck
pnpm test
```

Add branch protection on `main` requiring it. Cache the pnpm store and the Turbo cache. Total
work: under an hour, and the pipeline is green the moment it is written — verified above.

**Effort:** S. **Blocks deployment:** yes, in the sense that shipping without it means the first
production regression is found by a child.

---

### P0-2 — 1,354 server tests, and none of them touch Postgres

**Evidence:** 30 of the 64 server test files stub `../lib/prisma.js` with `vi.mock`. The
deviation is documented in `general.md §5` under a recorded exception, which also records its
cost on the record: *two defects shipped through it in files 10–12 — a content-safety leak
through `include`d relations, invisible to `where`-clause assertions, and a lost-update on the
PIN counter that a fixed-row stub could not express.*

**The exception's own exit condition is "once the Vitest test-database harness exists" — and the
infrastructure for that harness is already in the repo:**

- `docker-compose.yml` runs `postgres:16-alpine` with a healthcheck.
- `docker/postgres/init/01-create-test-db.sql` already creates `kidlearn_test`.
- `apps/server/vitest.setup.ts` already points `DATABASE_URL` at
  `postgresql://postgres:password@localhost:5432/kidlearn_test`.
- 22 migrations exist and are ordered.

Nothing connects to it. The database is created, addressed, and never opened.

**Why it matters long-term:** this is the finding with the highest expected cost. Content safety
in this product is a query-shape property — `status: "published"` on every student-facing read,
including on `include`d relations. A stub can assert the `where` clause that was *passed*; only
Postgres can prove the rows that come *back*. The exception acknowledges this and mitigates it
with four disciplined rules, but it has already leaked twice. Cascade deletes (account deletion,
NFR-SAFE-06), transaction isolation (the reward ledger's unique grant) and unique constraints
are all currently asserted against `schema.prisma` *as text*.

**Fix — and this is a phased port, not a rewrite:**

1. Build the harness: a `globalSetup` that runs `prisma migrate deploy` against `kidlearn_test`,
   plus a per-file `beforeEach` that truncates in FK order (or wraps each test in a rolled-back
   transaction). Add factory helpers under `apps/server/src/test/`.
2. Port in risk order, not file order. The suites whose guarantees a stub *cannot* express go
   first: `content.test.ts` and `stories.test.ts` (the `include`d-relation status gate),
   `children.test.ts` (cascades), `progress.test.ts` and the reward ledger (the once-a-day
   unique grant). `parent.test.ts` was on this list for its PIN counter; the PIN was removed on
   2026-09-09, so the account-deletion token is what is left worth porting there.
3. Leave the rest stubbed until they are touched. A stubbed suite that only checks routing and
   validation is not costing anything.
4. Delete the recorded exception from `general.md §5` when the list in (2) is done — and not
   before. Deleting it early is worse than leaving it.

**Effort:** L (the harness is S–M; the ported suites are the bulk). This is the one item on the
list worth doing slowly.

---

### P1-1 — The Next.js app has no error, loading or not-found boundaries

**Evidence:** zero `error.tsx`, `global-error.tsx`, `loading.tsx` or `not-found.tsx` files exist
anywhere under `apps/web/app`. There are also zero `next/dynamic` or `React.lazy` call sites.

**Why it matters:** the primary user is a three-year-old who cannot read. An unhandled render
error in a lesson step currently produces Next's default error surface — in production, a blank
page. There is no route in the product where that is an acceptable outcome, and `(student)` is
the surface where it is worst.

**Fix:**

- `app/global-error.tsx` — the last-resort boundary.
- One `error.tsx` per route group. `(student)`'s is not a stack trace: it is a friendly,
  narrated, illustrated "let's try that again" with a single big button, built to the same
  kid-surface rules as everything else (≥64px targets, no text below 20px, strings through
  i18next). `(parent)` and `(admin)` get a plain retry surface.
- `not-found.tsx` per route group, same split.
- `loading.tsx` where a route awaits data — the `(student)` one should be a character animation,
  not a spinner.
- While here: consider `next/dynamic` for the heaviest kid-surface widgets (`TraceActivity`,
  `PuzzleActivity`, the confetti bundle). Measure before splitting — this is an optimisation, not
  a correctness fix.

**Effort:** M. **Note:** this is genuinely new UI, not a refactor. It should be built with the
`create-component` and `responsive-design` skills, and it needs design decisions
(`document/design.md` has no error-state section — add one).

---

### P1-2 — The server has no baseline HTTP hardening, and file 38 is next

**Evidence:** `apps/server/src/app.ts` sets `x-powered-by: false` and CORS with a single allowed
origin. That is the whole of it. There is no `helmet`, no response security headers, no
`express.json({ limit })`, no HTTP-level rate limiting, and no `app.set("trust proxy", …)`.
`apps/web/next.config.ts` sets no `headers()` either.

To be fair to what exists: AI generation is capped per day per cost bucket (`rate-guard.ts`,
`require-generation-budget.ts`). The gap is the generic transport layer beneath it. Note that
the parental PIN gate — which had escalating lockouts with strike persistence, and was the other
application-level abuse control — was removed on 2026-09-09, so per-IP rate limiting on auth now
has nothing per-account sitting behind it.

**Why it matters now specifically:** file 38 puts this behind Caddy on an EC2 box, serving
`api.kidlearn.net` over TLS. Without `trust proxy`, `req.ip` is the proxy's address — which
silently weakens any IP-based control added later — and better-auth's secure-cookie handling
behind a TLS-terminating proxy needs it too. Adding this *after* the first deployment means
debugging it in production.

**Fix:**

- `helmet()` with a CSP that the `/docs` Swagger UI route is exempted from.
- `express.json({ limit: "1mb" })` — currently unbounded; the admin editors POST large JSONB
  payloads, so size the limit against a real quiz/activity payload rather than guessing.
- `express-rate-limit` on `/api/auth/*`. This matters more since the PIN gate's per-parent
  lockout was removed — there is no longer an application-level counterpart to it.
- `app.set("trust proxy", 1)` behind the deployment's proxy, driven by an env flag so local dev
  is unaffected. **This one bullet is already file 38's requirement 4** — Caddy makes it a
  prerequisite of the first deploy rather than a hardening nicety. The rest of this list is not.
- Security headers in `next.config.ts` for the web app.

**Effort:** S. `trust proxy` ships with file 38; do the remainder immediately after it, not later.

---

### P1-3 — `CLAUDE.md` and the standards documents contradict the code

**Evidence** — every one of these is currently false:

| Claim | Where | Reality |
| --- | --- | --- |
| "**No test runner** is configured yet" | `CLAUDE.md` | Vitest in 5 packages, 2,526 tests |
| "`types/` placeholder — no package.json yet" | `CLAUDE.md` layout block | `@kidlearn/types`, 38 files, active workspace |
| "`config/` placeholder — no package.json yet" | `CLAUDE.md` layout block | `@kidlearn/config`, active, holds 3 shared tsconfigs |
| "Shared schemas live in `packages/types` (placeholder — create this package…)" | `CLAUDE.md` | Created in file 01 |
| "`packages/types` and `packages/config` are **not active workspaces**" | `CLAUDE.md`, `general.md §1` | Both active |
| "Schema: `Parent` ↔ `Child[]`" | `CLAUDE.md` | 37 models |
| "`document/` … design.md, project-requirement-details.md, key-description.md" | `CLAUDE.md` | `key-description.md` does not exist; 9 documents and 2 spec directories do |
| "**Tooling is not yet configured.** Vitest is the chosen runner… once tooling is added" | `general.md §5` | Configured in file 01 |
| "`[CI]` … once Vitest is configured" (×4) | `general.md §5, §6`, `backend.md §4, §7` | Vitest is configured; there is still no CI |

**Why it matters more than it looks:** `CLAUDE.md` is loaded into context on every single
session, and it is the first thing a new contributor reads. A file that opens by telling you
there are no tests, in a repo with 2,526 of them, teaches the reader to distrust the whole
document — including the parts that are load-bearing and correct. Stale agent instructions also
actively cause wrong work: an agent told `packages/types` is a placeholder will not put a schema
there.

**Fix:** rewrite the stale sections. Exact changes in §5 below. **Effort:** S.

---

### P1-4 — `packages/ui`'s documented architecture does not exist, and cannot

**Evidence:** `document/standards/frontend.md §1` specifies six layers for `packages/ui`
(`primitives/`, `kid/`, `parent/`, `hooks/`, `lib/`, `styles/`), gives a decision table for
placing files into them, and makes "component sits in the correct layer" the first item on the
frontend review checklist.

**Partly resolved.** `hooks/` now exists and holds `useIsMotionReduced`, which fifteen files
across six features call and which depends on nothing app-owned; `lib/` gained the a11y
preference store it reads. `kid/` and `parent/` are still empty, and `frontend.md §1` now says
so explicitly rather than implying occupants. What remains of this item is the rule below.

**The rule is not being broken by accident; it is being broken because it has no payoff.**
`packages/ui` has exactly one consumer. `document/mobile-app-plan.md §4.2` settles the question
in the other direction and is right to: *"React components — Shared with web? **No.** Radix
primitives are DOM-bound, Tailwind v4's `@theme` CSS variables do not exist in React Native…
Sharing here means rewriting the web app, not saving mobile work."*

So the standard mandates a layering whose only justification — cross-app reuse — the architecture
of record has ruled out.

**Why it matters:** a documented rule that every reviewer silently ignores erodes the authority
of the rules that matter. `general.md` closes with "if a pattern in the codebase contradicts the
standards, the standards win unless a deliberate decision is recorded there." No decision has
been recorded, so a literal reading of the standards says 157 files are misplaced. That is not a
refactor anyone should do.

**Fix — record the decision, do not move the code:**

- Amend `frontend.md §1` to say what `packages/ui` actually is: the theme-agnostic primitive
  layer (`primitives/`, `lib/`, `styles/`) plus anything a *second* consumer genuinely needs.
- State the placement rule that is actually in force: surface-specific components live in the app
  that renders them, under `apps/web/features/<domain>/`, with `shared/components/kid/` as the
  kid-surface layer. Promotion to `packages/ui` needs a second consumer *and* no app-owned
  dependency — the test `BigButton` and `IconTile` fail on `useAudio`.
- Replace the review-checklist item with the rule being applied: *a component that two surfaces
  render belongs in `packages/ui/src/primitives/`; one that a single surface renders stays in
  `apps/web`.*
- Point at `mobile-app-plan.md §4.2` as the reasoning, dated, in the recorded-exception style the
  standards already use.

**Effort:** S (documentation only). **Do not** attempt the alternative — hoisting 157 files into
`packages/ui` — which would be days of churn for negative value.

---

### P2-1 — Extract `packages/tokens` and `packages/i18n` now, while `apps/web` is the only consumer

**Evidence:** `mobile-app-plan.md §4.1` already specifies both packages as NEW and required.
Today, design tokens exist only as CSS custom properties in
`packages/ui/src/styles/tokens.css` (148 lines) — unreadable from React Native, which has no
`@theme` and no CSS variables. Locale JSON lives in `apps/web/locales/{en,bn}/{common,student,
parent,lesson}.json`, inside the web app.

**Why do it now rather than during mobile work:** both extractions require touching the web app —
`lib/i18n.ts` changes its resource imports, and `tokens.css` becomes generated output rather than
a hand-written source. Doing that while the web app is the sole consumer, with 991 web tests green
as the safety net, is a contained refactor. Doing it *while* standing up an Expo app means
debugging a token pipeline and a Metro monorepo resolver at the same time. This is the single
highest-leverage sequencing decision in the plan.

**Fix:**

- `packages/tokens` — token values as plain TypeScript (the source of truth), plus a small
  generator that emits `tokens.css` for the web build. `document/design.md` stays the prose
  source of truth; the TS file becomes the machine-readable one. Add a test asserting the two
  agree on the values design.md names.
- `packages/i18n` — move `apps/web/locales/*` in wholesale, update `apps/web/shared/lib/i18n.ts`, and add
  the test the current setup lacks: **every key present in `en` is present in `bn`, and vice
  versa.** There is no such check today, so a missing Bangla string is invisible until a Bangla
  reader hits it.

**Effort:** M for both. Sequence them before file 38 if deployment can wait a day; otherwise
immediately after.

---

### P2-2 — The same domain logic is implemented twice, differently

**Evidence:** locale fallback exists in two places with different shapes and different
guarantees:

- `apps/server/src/lib/locale.ts` — `pickLocale()` returns `{ value, locale }` so the client is
  told *which* locale it actually got (FR-PROF-03), with English as the one safe fallback.
- `apps/web/shared/lib/localized-label.ts` — `pickLabel()` returns a bare string, silently falling back
  to `en` without reporting it.

These will diverge. When a Bangla label is missing, the server tells the caller so and the web
helper does not.

Other logic that is platform-free, lives in `apps/web`, and will be copy-pasted the moment
`apps/mobile` exists: `components/activities/evaluate.ts` (activity grading),
`components/quiz/evaluate-answer.ts` (quiz grading), `components/lesson/lesson-machine.ts`,
`components/student/story-reader/reader-machine.ts`, `components/activities/trace/geometry.ts`
and `coverage.ts`, `lib/week-range.ts`, `lib/duration.ts`, `lib/worlds.ts`, `lib/avatars.ts`.

**Fix — narrow now, broad later.** Fix only the demonstrated duplication: move locale
resolution into `packages/types` (or `packages/tokens`'s sibling, if a `packages/core` is created
for the mobile work) and have both sides consume one function with the reporting shape.
`mobile-app-plan.md §4.2` is right that the rest should be lifted *"only when the mobile file
would otherwise be a copy-paste — do not pre-emptively extract."* Honour that. The list above is
a watchlist, not a work item.

**Effort:** S for the locale fix. The watchlist costs nothing until M-phase.

---

### P2-3 — Dependency versions are managed by hand across five manifests

**Evidence:** `zod@^3.24.0` is declared independently in `apps/server`, `apps/web` and
`packages/types`. `lucide-react`, `motion` and `class-variance-authority` are each declared in
both `apps/web` and `packages/ui`. Nothing keeps them in step but attention. There is also no
`engines` field and no `.nvmrc` — the Node version this builds against is undeclared, which
matters the moment CI, the Dockerfiles and a developer's machine stop agreeing on it.

Pending major upgrades, measured with `pnpm outdated -r`:

| Package | Current | Latest | Note |
| --- | --- | --- | --- |
| `zod` | 3.25.76 | 4.5.4 | Largest. v4 ships native `z.toJSONSchema()`, which would **delete** the `zod-to-json-schema` dependency and simplify `src/openapi/to-json-schema.ts`. Touches every schema in the repo. |
| `prisma` / `@prisma/client` | 6.19.3 | 7.10.0 | Do this *behind* the test-database harness (P0-2), not before — this is exactly the change a stubbed suite cannot validate. |
| `motion` | 11.18.2 | 13.2.0 | Two majors. Affects every animated kid surface. |
| `tailwind-merge` | 2.6.1 | 3.6.0 | Paired with Tailwind v4 usage. |
| `lucide-react` | 0.469.0 | 1.40.0 | First stable major. |
| `vitest` | 4.1.8 | 5.0.0 | Do after CI exists, so a regression is caught by the pipeline. |
| `typescript` | 5.9.3 | 7.0.2 | Large; schedule deliberately. |
| `@types/node` | 20.19.43 | 26.4.1 | Pin to whatever Node version the `engines` field ends up declaring. |

**Fix:**

- Adopt **pnpm catalogs** (`pnpm-workspace.yaml`) so `zod`, `motion`, `lucide-react` and
  `class-variance-authority` are declared once as `catalog:` and cannot drift.
- Add `engines.node` to the root `package.json` and an `.nvmrc`, matching what CI and the
  deployment target will run.
- Sequence the majors: **CI first → test-database harness → Prisma 7 → zod 4 → the rest.** Each
  gets its own branch and its own PR. Upgrading zod before there is a pipeline to catch the
  fallout is how a weekend disappears.

**Effort:** S for catalogs and the Node pin; the upgrade ladder is ongoing.

---

### P2-4 — A handful of modules and test files have outgrown a single file

Not a crisis — the code inside them is well-organised — but these are where the next reader will
struggle:

| File | Lines | Observation |
| --- | --- | --- |
| `apps/server/src/modules/progress/progress.routes.test.ts` | 2,202 | One file covering rewards, streaks, sessions and completion |
| `apps/server/src/modules/admin/content/content.routes.test.ts` | 2,095 | Four resources' CRUD plus the transition matrix |
| `apps/server/src/modules/admin/ai/review.ts` | 900 | 30 functions: listing, detail assembly, asset attachment, approve/reject, chain walking |
| `apps/server/src/modules/admin/content/content.service.ts` | 894 | Four near-identical CRUD blocks (world/subject/topic/lesson) + transitions + reordering |
| `apps/web/features/admin/admin-api.ts` | 641 | 50 exports spanning auth, content, media, editors, AI and characters |
| `apps/web/app/(admin)/admin/curriculum/CurriculumScreen.tsx` | 782 | The largest client component |

**Fix, in priority order:**

1. **`admin-api.ts` — split by resource** (`features/admin/content-api.ts`, `media-api.ts`,
   `ai-api.ts`, `editors-api.ts`). This is the cheapest and clearest win: it is a flat
   list of independent functions, mechanical to split, and it mirrors the server's own route
   grouping. Note `general.md §3` bans barrel files beyond a package entry point, so these are
   imported directly, not re-exported through an index.
2. **`review.ts` — split along its seams** into `review/queue.ts` (list/detail),
   `review/attach.ts` (asset attachment and conflict handling) and `review/decide.ts`
   (approve/reject/chain). The seams are already visible in the function grouping.
3. **The two large test files — split by feature, not by size.** `progress.test.ts` becomes
   `progress.rewards.test.ts`, `progress.streaks.test.ts`, `progress.sessions.test.ts`. Do this
   *during* the P0-2 port, not as separate churn.
4. **`adminContentService.ts` — leave the four CRUD blocks alone.** They look like duplication and
   are not quite: each resource has different translation handling, different parent-existence
   checks and different sort scoping. Collapsing them into one generic engine trades readable
   repetition for an abstraction nobody can debug. Extract only the genuinely identical helpers
   (`nameUpserts`, `nextSortOrder`, `assertParentExists`) if they are not already shared.

**Effort:** M in total, and safely incremental — each item is independent.

---

### P3 — Housekeeping

- **`apps/web/README.md` is the stock `create-next-app` boilerplate.** It tells a reader to run
  `npm run dev`, in a pnpm repo. Delete it or replace it with three lines pointing at the root
  README.
- **No coverage reporting is configured** in any `vitest.config`. Do not set a coverage
  *threshold* — with 2,526 hand-written behavioural tests, a percentage gate would only invite
  gaming. Do enable `--coverage` reporting in CI so a PR that deletes a content-safety test is
  visible.
- **The two remaining `console.log` calls** outside tests should be `logger` calls or deleted.
- **`document/implementation/00-progress-tracker.md`** has no rows for the work in this plan. Add
  them (see §4) — the tracker is the stated source of truth and this work should live in it, not
  in a side document.

---

## 4. Sequenced roadmap — implementation files 39–46

This repo's process is numbered implementation files with a progress tracker, one branch each.
This plan should enter that process rather than sitting beside it. Proposed rows for
`00-progress-tracker.md`, in dependency order:

| # | Proposed file | What | Depends on | Est. |
| --- | --- | --- | --- | --- |
| 39 | `39-ci-pipeline-and-branch-protection.md` | GitHub Actions: lint → build → typecheck → test, pnpm + Turbo caching, branch protection, coverage reporting. Flip every `[CI once tests are configured]` tag in the standards to plain `[CI]`. | — | 2–3h |
| 40 | `40-docs-and-standards-truth-pass.md` | P1-3 and P1-4: correct `CLAUDE.md`, close the stale-tooling caveats in `general.md §5/§6`, record the `packages/ui` scope decision in `frontend.md §1`, delete `apps/web/README.md`. Update the skills per §5. | 39 | 2–3h |
| 41 | `41-server-http-hardening.md` | P1-2: helmet, body limits, per-IP rate limiting on auth routes, web security headers. `trust proxy` is excluded — file 38 requirement 4 ships it. **Do this immediately after file 38: the API is public from that moment.** | 38, 39 | 2–3h |
| 42 | `42-test-database-harness.md` | P0-2 part 1: `globalSetup` + migrate + truncation strategy + factories. No suites ported yet. | 39 | 3–4h |
| 43 | `43-port-content-safety-suites-to-real-db.md` | P0-2 part 2: port `content`, `stories`, `children`, `parent`, `progress` and the reward-ledger suites. Split `progress.test.ts` while porting. Delete the recorded exception in `general.md §5`. | 42 | 4–6h |
| 44 | `44-error-and-loading-boundaries.md` | P1-1: `global-error`, per-group `error`/`not-found`/`loading`. Add an error-state section to `design.md` first. | 40 | 3–4h |
| 45 | `45-tokens-and-i18n-packages.md` | P2-1: `packages/tokens` (TS source → generated `tokens.css`) and `packages/i18n` (moved locales + an en/bn key-parity test). Mobile prerequisite. | 40 | 3–4h |
| 46 | `46-dependency-governance.md` | P2-3: pnpm catalogs, `engines.node` + `.nvmrc`, then the upgrade ladder as separate branches (Prisma 7 → zod 4 → the rest). | 39, 43 | 2–3h + ongoing |

The `admin-api.ts` and `review.ts` splits (P2-4) do not need files of their own — do them as
opportunistic cleanups on the next branch that touches either, and note them in the PR.

**If only three things get done before deployment: 39, 41 and 40.** CI, hardening and honest
docs. 42–43 is the item worth the most and it is also the one that should not be rushed.

---

## 5. Harness updates — `CLAUDE.md`, README, skills, agents

### 5.1 `CLAUDE.md` (root) — corrections

Replace, verbatim, the false statements identified in P1-3:

| Current text | Replace with |
| --- | --- |
| "**No test runner** is configured yet (see … assumption 8 — Vitest is the planned choice)." | "**Vitest is configured in every package.** `pnpm test` runs the suite through Turbo (~2,500 tests). `apps/web` uses jsdom + React Testing Library; `apps/server` uses Supertest. Note: 30 server suites still stub `lib/prisma.js` — see the recorded exception in `document/standards/general.md §5` before writing a new one." |
| "`types/ placeholder — no package.json yet`" | "`types/ @kidlearn/types — Zod contracts: activity/quiz payloads + every API response shape (src/api/)`" |
| "`config/ placeholder — no package.json yet`" | "`config/ @kidlearn/config — shared tsconfig bases (base/node/react-library)`" |
| "Shared schemas live in `packages/types` (placeholder — create this package before adding schemas)." | "Shared schemas live in `packages/types`." |
| "`packages/types` and `packages/config` are not yet active workspaces." (Workspace wiring section) | Delete the sentence; keep the checklist that precedes it. |
| "Schema: `Parent` ↔ `Child[]`." | "37 models across auth, curriculum, content, progress, gamification and the AI pipeline — `document/database-design.md` is authoritative." |
| "`document/ design.md, project-requirement-details.md, key-description.md`" | "`document/ standards/, implementation/, implementation-mobile/, design.md, database-design.md, project-requirement-details.md, user-journey-manual.md, mobile-app-plan.md, improvement-plan.md`" |

**Add** three short sections that a session currently has to discover by reading code:

- **Testing** — where the runners are configured, the Prisma-stub caveat, `assertContract`, and
  the fact that the OpenAPI coverage test will fail an undocumented route.
- **A pointer to `document/mobile-app-plan.md`** as the architecture of record for what is and
  is not shared — this is what stops an agent "helpfully" hoisting components into
  `packages/ui`.
- **A pointer to this document** for anything phrased as cleanup, refactoring or tech debt.

**Add after file 39 lands:** the CI section — what runs, and that a PR is not done until it is
green.

### 5.2 Root `README.md`

The README is accurate and well-written; it needs additions, not corrections.

- Add a **Testing** row-set to the "Running Locally" section: `pnpm test`, and the
  `docker compose up -d postgres` step that the test database will need after file 42.
- Add a **CI** badge and a one-line description of the pipeline after file 39.
- Note under Repo layout that `packages/ui` is web-only by design, linking `mobile-app-plan.md
  §4.2`.

### 5.3 Skills — `.claude/skills/`

The six existing skills are well-scoped. Changes needed:

| Skill | Change | Why |
| --- | --- | --- |
| `code-review` | Add explicit checks for the rules that CI still cannot see: the `include`d-relation status gate (not just the `where` clause), en/bn key parity for any new i18next key, and OpenAPI registration in the same diff. Add "a new server suite that stubs Prisma must cite the recorded exception in its file header" — that is a rule the standards state and no reviewer currently applies. | The skill currently routes to the standards but does not encode the two failure modes that have actually shipped defects. |
| `create-component` | Add error, empty and loading states to the required checklist — every kid-surface component needs all three, and file 44 is about to make that concrete. | P1-1 exists partly because no skill ever asked for these. |
| `start-implementation` | After file 39, add "confirm CI is green on `main` before branching". Also update its standards-loading logic to know about `improvement-plan.md` for files 39–46. | Keeps the numbered-file workflow intact for the refactor work. |
| `pr-description` | **Superseded 2026-09-06** — folded into the new `pr` skill (below). | The skill produced a description and stopped; the engineer still ran commit, push and `gh pr create` by hand. One skill for the whole pass is fewer moving parts, and it can refuse to claim gates it did not run. |
| `explain`, `responsive-design` | No change. | Both are scoped to teaching and layout, neither of which this plan alters. |

**One new skill is worth adding — and only one.** `/upgrade-dependency <package>`: read the
changelog between the pinned and target major, list the call sites in this repo, branch, upgrade,
run the four gates, and report honestly what it could not verify. P2-3 is a recurring, mechanical,
easy-to-get-wrong task with a fixed shape — exactly what a skill is for. Everything else in this
plan is one-off work that does not justify one.

> **Amendment, 2026-09-06 — two more skills, both from outside this plan.**
>
> - **`/sync-docs`** — after a change lands, work out which of the seven top-level `document/*.md`
>   files the change contradicts, and correct them. Added because this plan's own P1-3 is *exactly*
>   this failure with a nine-row table of evidence: the harness drifted from the code and nobody
>   noticed until someone read the whole tree. P1-3 is the one-off cleanup; `/sync-docs` is what
>   stops it recurring. It is explicitly barred from touching `document/implementation/**`, which
>   is a build log of work already done, not a description of the present.
> - **`/pr`** — commit, push and open the pull request in one pass, replacing `pr-description`.
>
> Neither contradicts the "do not add a `/refactor` skill" reasoning below it: both are
> procedure-shaped with a fixed output, not judgement-shaped.

**Do not add** a `/refactor` skill. Refactoring here is judgement-shaped, not procedure-shaped,
and a skill would only encourage the kind of speculative extraction §6 warns against.

### 5.4 Agents — `.claude/agents/`

There are none, and none are needed. The work in §4 is sequential and mostly small; a subagent
fan-out would add coordination cost without parallelism to exploit. The one place a subagent
earns its keep is file 43 — porting six independent test suites to the harness — and that is
better handled by dispatching parallel agents *at the time*, from the plan, than by defining a
persistent agent type for a job that happens once.

### 5.5 `.claude/settings.json`

Two additions once the corresponding work lands:

- Allow `Bash(docker compose up -d postgres)` and `Bash(docker compose ps)` — file 42 makes these
  routine, and they are safe.
- Allow `Bash(pnpm --filter @kidlearn/i18n:*)` and `Bash(pnpm --filter @kidlearn/tokens:*)` after
  file 45, matching the existing per-package entries.

The `autoMode.environment` block should gain one line after file 39: that CI runs on every push
and a PR is not done until it is green.

---

## 6. Explicitly not recommended

A refactor plan is only as useful as the work it talks you out of.

- **Do not hoist `apps/web/features/**` into `packages/ui`.** The standard that implies it is
  the thing that is wrong (P1-4). Fix the document.
- **Do not collapse the four CRUD blocks in `adminContentService.ts`** into a generic engine.
  They differ in ways that a generic engine would hide behind configuration.
- **Do not extract `packages/api-client` yet.** `mobile-app-plan.md §4.2` says mobile needs its
  own client because auth differs, and that a shared extraction is *"a fair refactor once both
  sides have settled."* Both sides have not settled.
- **Do not pre-emptively lift the platform-free logic listed in P2-2.** Lift each file the day
  a second consumer would otherwise copy it, and not before.
- **Do not set a coverage threshold.** Report coverage; do not gate on a number. A percentage
  target in a repo with this many hand-written behavioural tests optimises for the wrong thing.
- **Do not upgrade zod to v4 before CI and the test-database harness exist.** It touches every
  schema in the repo, and the payoff — deleting `zod-to-json-schema` — is worth having, but only
  with a pipeline underneath it.
- **Do not rewrite the recorded exceptions in the standards.** They are the best-written prose in
  the repo. Delete them when their exit conditions are met; leave them alone until then.

---

## 7. Second review — 2026-10-04

Commit `a00244e` on `dev`. Five parallel read-only passes, split by slice: server security,
server logic and database, web correctness, web UI and accessibility, and cross-cutting
(types, tests, CI, ops, dependencies). Each pass was told to skip what §3 and the tracker's
*Open follow-up fixes* already record.

**Verification.** Every finding below was found by reading code. Findings marked **✔** were
re-read independently while this section was written; the others come from a single pass
and should be re-confirmed as the first step of fixing them. Nothing was run against a
database.

### 7.1 Baseline

| Check | Command | Result |
| --- | --- | --- |
| Lint | `pnpm lint` | **Clean** — 614 files |
| Build | `pnpm build` | Clean, 5/5 — **served from the Turbo cache**, not re-run |
| Types | `pnpm typecheck` | Clean, 8/8 — **served from the Turbo cache**, not re-run |
| Tests | `pnpm turbo run test --force` | **2,714 passing, 0 failing**, no Supertest flake on this run |
| — `apps/server` | | 66 files, 1,392 tests |
| — `apps/web` | | 97 files, 1,032 tests |
| — `packages/types` | | 5 files, 180 tests |
| — `packages/ui` | | 9 files, 56 tests |
| — `packages/db` | | 1 file, 54 tests |

Still clean: no `.skip`/`.only`/`.todo`, no snapshot tests, en/bn locale keys at exact parity
in all four namespaces, no raw colours in component code, no kid text below 20px,
`console.log` only in CLI scripts.

### 7.2 Status of the v1 findings

| v1 | Status | What remains |
| --- | --- | --- |
| P0-1 CI | ✅ Done | `gates` is not yet a *required* check — blocked on the Supertest flake, tracked |
| P0-2 Real-database tests | ⬜ Open | No `globalSetup`, no factories; 35+ server test files still `vi.mock` Prisma |
| P1-1 Boundaries | 🟨 Partial | `global-error`, root `error`, `(student)/error` and root `not-found` exist. No `error.tsx` in `(parent)` or `(admin)` — a parent-page crash falls to the root boundary, which drops the parent layout and theme. No `loading.tsx` (low value: data is fetched client-side) |
| P1-2 HTTP hardening | 🟨 Partial | `trust proxy` and web security headers done. No `helmet`, no rate limit on `/api/*` outside better-auth. **Correction to v1:** the body was never unbounded — Express defaults to 100kb and the error handler already maps 413; and better-auth's own limiter is on in production for `/api/auth/*` |
| P1-3 Docs truth | ✅ Done | — |
| P1-4 `packages/ui` scope | 🟨 Partial | Code matches the recorded rule. `frontend.md`'s decision table, §3 line 177 and checklist line 228, and `.claude/skills/create-component/SKILL.md:50-51,94` still point at `packages/ui/src/kid/` and `parent/` |
| P2-1 Tokens/i18n packages | ⬜ Open | — |
| P2-2 Duplicated logic | ⬜ Open | `pickLabel` vs `pickLocale` unchanged. Quiz grading *was* moved to `packages/types/src/quiz/evaluate.ts` |
| P2-3 Dependency governance | ⬜ Open | No catalog, `engines` or `.nvmrc`; `@types/node ^20` while CI and both Dockerfiles run Node 22 |
| P2-4 Oversized files | ⬜ Open, slightly worse | `progress.routes.test.ts` 2,324, `content.routes.test.ts` 2,142, admin `content.service.ts` 930, `review.ts` 900, `CurriculumScreen.tsx` 782 |
| P3 Housekeeping | 🟨 Partial | Tracker has no rows for 40–46 — superseded by `improvement-tracker.md` |

### 7.3 New findings

IDs are stable; `improvement-tracker.md` uses them. Severity is the expected cost if left,
not the effort to fix.

#### Fix first — correctness and child safety

**R-01 ✔ High — production runs on one database connection.**
`deployment-walkthrough.md:166-169` and `runbook.md:267` prescribe
`?pgbouncer=true&connection_limit=1` for a long-running Express container. That setting
suits serverless; here every Prisma call in the process shares one connection —
`Promise.all` runs serially, an interactive `$transaction` holds the connection for its
whole run, and a second transaction waiting past Prisma's 2s `maxWait` fails with `P2028`,
which `withSerializationRetry` does not retry → 500. Account deletion (120s timeout) stalls
the whole API. The walkthrough's own line 968 says the setting "serialises the entire app".
*Fix:* `connection_limit` sized against the Supabase pooler cap (5–10), and retry `P2028`.

**R-02 ✔ High — a badge's AI icon can be published without review.**
`content-editors.service.ts:717`: `readEditorGuardFields` selects only `status` for badges,
so `assertAiPublishable` never sees `iconAsset.aiJobId`. An image from a rejected or pending
job, picked as a badge icon, reaches children through `achievement.service.ts`. Worlds and
lessons already check linked assets (`admin/content/content.service.ts:642-692`).
*Fix:* select `iconAsset: { select: { aiJobId: true } }` and add it to `aiJobIds`.

**R-03 ✔ Medium — quiz submission bypasses the screen-time lock.**
`assertMayOpenLesson` is called only at `lesson-progress.service.ts:78`.
`recordQuizResponses` creates the `LessonProgress` row (~`:313`) without it, and a fresh row
makes `isLessonInProgress` true for 30 minutes — reopening the hole the assertion closed.
*Fix:* call `assertMayOpenLesson` before the transaction, or never create the row on that path.

**R-04 ✔ Medium — a slow quiz upload loses the child's quiz rewards.**
`QuizStep.tsx:55` fires `submitQuizResponses` with `void` and `retries: 0`.
`RewardStep` can call `completeLesson` first, and the server derives the quiz reward from
responses already stored. On 3G or a cold API the quiz star, per-answer coins and the parent
report's quiz data are lost. *Fix:* hand the submit promise to `RewardStep` and await it
before completing; allow a retry only once the endpoint is idempotent per question/attempt.

**R-05 ✔ Medium — one invalid payload 500s the whole lesson.**
`content.service.ts:499-506, 524-531` throw on a single activity or quiz question that fails
`safeParse`. The web engines already degrade per step (`ActivityUnavailable`, skipped
questions); the 500 means they never get the chance. Tightening any schema refinement turns
every lesson containing older content into an error page. *Fix:* log, then return
`activity: null` / omit the question.

**R-06 Low/Medium — lessons and stories can be completed without being played.**
`POST /lessons/:id/complete` on a never-opened visible lesson writes the reward and grants
stars, daily coins and the streak; story completion is not screen-time gated at all
(`lesson-progress.service.ts:145-155`, `story-progress.service.ts`). *Fix:* require existing
progress at or past the quiz/activity step (or a `story_start` event) before granting.

**R-07 Medium — deleting a heavy child profile can never succeed.**
`child-profile.service.ts:223-231` runs the cascade inside a transaction with Prisma's
default 5s timeout; account deletion documents that the same cascade needs 120s. Worse under
R-01. *Fix:* the `SetNull` FK on `session` makes the manual `updateMany` redundant — a single
`delete` with no interactive transaction, or the same timeout as account deletion.

**R-08 Medium — the weekly-report job hides failure and can run twice.**
`weekly-report.service.ts:601-645` counts per-child failures but never returns the count; the
route (`jobs.routes.ts:13-21`) always answers 200, so `curl --fail` and the heartbeat report
success when every child failed. The loop is sequential and unbounded; past curl's
`--max-time 300` (`deploy/weekly-reports.sh:54`) curl retries and starts a second full pass.
*Fix:* return `childrenFailed` and answer non-2xx when it is above zero; batch, or 202 and
process in the background.

#### Web correctness and UX

**R-09 ✔ Medium — parent and admin dialogs render in the kid theme.**
`data-theme` sits on a wrapper `<div>` in each route-group layout; Radix portals
(`packages/ui/src/primitives/dialog.tsx:113`, `dropdown-menu.tsx:34`) mount into `<body>`
and inherit `:root`'s kid tokens. DeleteChildDialog, the account menu and every admin dialog
get the kid primary, radius and Nunito. *Fix:* set `data-theme` on `<html>` per route group,
or pass a themed `container` to the Portal.

**R-10 High (placement ✔, overlap not measured) — the parent lock catches children's taps.**
`ParentCorner` (`features/student/ParentCorner.tsx:18`) is rendered by the student layout on
every route, `absolute top-2 right-2 z-10`, including the lesson player and story reader. It
overlaps the corner of StepContainer's exit X (`StepContainer.tsx:88`) and the story
auto-advance toggle (`StoryReader.tsx:390`), and wins on z-order. With the PIN gate removed,
a stray tap lands in `/parent/children` unchallenged. *Fix:* hide it on `/lesson/*` and
`/stories/[id]`, or reserve a gutter in those headers.

**R-11 ✔ Medium — a child's language overwrites the parent's.**
`shared/lib/i18n.ts:102-103` sets `caches: ["cookie"]`, so every `changeLanguage` — including
the one `active-child.tsx:163-168` makes for a Bangla child — rewrites the device cookie. The
parent dashboard, `<html lang>` and the login page stay Bangla afterwards. *Fix:* no detector
cache; write the cookie explicitly in `LanguageSwitch` only.

**R-12 Medium — an expired admin session is never noticed.**
`app/(admin)/context/admin-session.tsx:48-70` does not subscribe to `onUnauthorized` (2733ea4
wired the parent session and active-child provider only), and `AdminShell.tsx:36` keeps
polling while signed out. *Fix:* subscribe and `refresh()`, as the other two providers do.

**R-13 Medium (admin) — Bangla preview plays English quiz and activity content.**
`previewLanguage` reaches the API only; `QuizStep.tsx:18` and `ActivityStep.tsx:13` choose
locale from `i18n.resolvedLanguage`. A reviewer approves Bangla content they never heard.
*Fix:* `locale` on `LessonStepProps`, `previewLanguage ?? toLocale(i18n.resolvedLanguage)`.

**R-14 Low — lesson audio edge cases.**
(a) Narration keeps playing after leaving a lesson: `AudioProvider` is at the root and
`LessonPlayer` has no stop on unmount (`StoryReader.tsx:282` does). (b) A resumed lesson
mounts `intro` first and jumps in an effect, so `IntroStep` starts narrating before the jump
(`LessonPlayer.tsx:158-176`). *Fix:* `useEffect(() => stop, [stop])`; initialise the reducer
at `resumeAt`.

**R-15 Medium — safe-area insets and `min-h-dvh` applied twice.**
`StepContainer.tsx:50`, `StoryReader.tsx:361`, `ScreenTimeLock.tsx:58` re-add what
`app/(student)/layout.tsx:10` already applies; on a notched phone in landscape the insets
double and the lesson scrolls. `max-h-[70vh]` (TraceActivity:159), `[40vh]` (IntroStep:124),
`[24vh]` (RewardStep:333) should be `dvh`. *Fix:* drop the inner padding and `min-h-dvh`, use
`flex-1`.

#### Accessibility

**R-16 Medium — drag activities have no non-drag path.**
`DragDropActivity`, `PuzzleActivity`, `quiz/DragAnswerQuestion` accept drag only;
`use-activity-sensors.ts:24` uses dnd-kit's default 25px-per-arrow `KeyboardSensor`.
VoiceOver on iPad cannot complete them. `MatchActivity` already has tap-to-select.
*Fix:* tap-to-pick / tap-to-place mode, and a `coordinateGetter` that jumps between droppables.

**R-17 Medium — focus is dropped on every transition.**
No `.focus()` in lesson, quiz, activity or story code; `QuizEngine.tsx:178` remounts by key.
*Fix:* focus the new question/step heading (`tabIndex={-1}`) on change.

**R-18 Medium — feedback that disappears under reduced motion, and low-contrast marks.**
Wrong-answer feedback is audio plus a `motion-safe` wiggle (`use-activity-feedback.ts:109`,
`DragDropActivity.tsx:234`) — muted with reduced motion, there is no signal. The correct
ticks (`OptionCard.tsx:107`, `MatchActivity.tsx:376`, `MatchPairQuestion.tsx:296`) are
`text-success` at ~1.9:1 and 16px in the match cases; `todo` progress dots
(`StepContainer.tsx:21`) are ~1.08:1. `tokens.test.ts` checks only fill/foreground pairs.
*Fix:* a static wrong-answer cue, ink/emerald marks, larger ticks, bordered dots, and extend
the contrast test to non-text pairs.

**R-19 Low — kid-surface polish.**
`ExitConfirm.tsx:50` uses the primitive's 44px close X (below the 64px kid floor); celebrations
exceed design.md §5.2's 400ms cap (`RewardStep.tsx:323` repeats forever,
`StreakCelebration.tsx:43`, `StarBurst.tsx:13`); the 64px replay-button class string is
hand-copied in `QuizEngine.tsx:163`, `IntroStep.tsx:80`, `ActivityEngine.tsx:133` and near-
copied in `StepContainer.tsx:92`. *Fix:* kid close size or `isDismissable={false}`; trim
durations; promote StoryReader's `iconControlVariants` to `shared/components/kid/IconControl`.

#### Security hardening

**R-20 Medium — finish P1-2.** `helmet` with a CSP that the Scalar `/docs` route is handled
under (it loads its bundle from a CDN on the API origin — unverified, check
`renderApiReference`'s `cdn` default), an explicit `express.json({ limit })` sized against a
real editor payload, and `express-rate-limit` on `/api/*`.

**R-21 Low — Google OAuth codes are logged.** `pinoHttp` (`app.ts:36`,
`request-logger.ts:9`) logs full `url`/`query`; only cookie and authorisation headers are
redacted (`config/logger.ts:5-10`). Every `/api/auth/callback/google?code=…&state=…` lands in
the log store. *Fix:* log paths without query strings, or redact for `/api/auth/callback/*`.

**R-22 Low — admin sessions live 30 days.** `config/auth.ts:11-13,37-39` gives admin sessions
the parent expiry, no MFA, no re-check before approve/publish. *Fix:* reject admin sessions
older than ~12h in `requireAdmin`; plan MFA.

**R-23 Low — asset URL and upload scope.** `AssetRefSchema.url` (`primitives.ts:16-21,35`)
accepts any https host inside content JSON — `isDeliveryUrl` guards only `POST /api/admin/media`
— so a third-party tracker or an unreviewed AI asset URL can be published. The Cloudinary
signature (`media.service.ts:33-36`) signs only `{timestamp, folder}`; `listAssets`
(`:200-212`) is unpaged. *Fix:* validate content URLs in `parsePayload` (ideally resolve them to
`MediaAsset` and feed `aiJobId` into R-02's check); sign `allowed_formats` per kind; page the list.

#### Data, schema and performance

**R-24 Medium — payload versions have no migration path.** `schemaVersion: z.literal(1)`;
`SCHEMA_VERSION` is read only by a test; nothing upgrades old payloads or checks the column
against the payload. Payloads are `.strict()` on read, so an old bundle on a tablet rejects any
new optional field (as `tolerance` and `prePlaced` were). *Fix:* strict on write, lenient on
read; add `migratePayload(v) → latest` before version 2 exists. Pairs with R-05.

**R-25 Low/Medium — `SessionEvent` grows forever and is read three times per dashboard load.**
No retention job; `dashboard.service.ts:239-241` calls `getLearningMinutes` for today, week and
month separately. *Fix:* one covering read, three in-memory sums; prune raw events after ~90
days (weekly reports already hold the aggregates).

**R-26 Low — migration locking convention.** `20260912010000_…`, `20260911000000_…`,
`20260822010000_…` use plain `CREATE INDEX` on `QuizResponse`/`SessionEvent` and re-add FKs
without `NOT VALID`. Harmless at today's size. *Fix:* adopt `CREATE INDEX CONCURRENTLY`
(single-statement migration) and `NOT VALID` + `VALIDATE` as the documented convention. Also
`deployment-walkthrough.md:181` ("ending in `20260910…`") is four migrations stale.

**R-27 Low/Medium — web load path.** Kid screens start their own fetches only after
`ActiveChildProvider`'s three resolve (`StudentGuard.tsx:15-40`) — two serial round trips,
each with retry backoff on a cold start; this also contradicts `frontend.md §3` ("Never fetch
data in a Client Component"), which should be amended to record client fetching as deliberate
(the session cookie belongs to the API origin). The root layout preloads five font families on
every route, including JetBrains Mono (admin only) and Noto Sans Bengali (`app/layout.tsx:16-48`).
`use-preload-next-step.ts:11-27,76` holds a module-level cache nothing reads. *Fix:* parallel
fetches; move JetBrains Mono to `(admin)`, `preload: false` on Bengali; delete the dead cache.

#### Ops and supply chain

**R-28 Medium — backup and deploy scripts.** `deploy/backup.sh:27,97` runs `pg_dump` from
`postgres:16-alpine`; against a Postgres 17 Supabase project it aborts on version mismatch —
check `SELECT version()` and pin to the server's major (and fix the comment claiming the dump
is made "by the major version that wrote the data"). `deploy.sh:111-132,153` writes the new
`IMAGE_TAG` to `compose.env` before the health gate, so a failed deploy leaves the broken image
running and suggests rolling back to it. `weekly-reports.sh:54-55` puts `CRON_SECRET` on curl's
command line, visible in `ps` — `backup.sh:95` already does this right via stdin.

**R-29 Low — Actions pinned by tag.** `.github/workflows/ci.yml:33,38,40,46,104`, including
third-party `pnpm/action-setup@v6`. Limited today (`contents: read`, no secrets); real once 38a
adds AWS credentials. *Fix:* pin by SHA, add `.github/dependabot.yml` for `github-actions` and
`npm`. The `promotion-guard` remains file 38a's.

#### Housekeeping

**R-30** — finish P1-1: `error.tsx` and `not-found.tsx` for `(parent)` and `(admin)`.
**R-31** — finish P1-4: correct `frontend.md` and the `create-component` skill.
**R-32** — `as` casts without the comment `general.md` requires
(`content-status.service.ts:62,73`, `admin/ai/prompts/quiz.ts:28`, `packages/ui/src/lib/a11y-prefs.ts:16`);
unused `dotenv` in `packages/db/package.json:42`; `VideoStep.tsx:92` ships no captions, which
design.md §1.6's AA target requires (captions are Level A) — record a decision either way.

### 7.4 What the second review found done well

- **Ownership.** `loadOwnedChild` answers 404 for missing and foreign children alike on every
  `/api/children/:id*` route; student routes resolve the child via `requireActiveChild`;
  `activeChildProfileId` is `input: false`.
- **Reward ledger.** A unique index on `(childId, rewardType, sourceType, sourceId)`,
  `skipDuplicates`, Serializable with jittered retry, and the local date read once outside the
  retry so a retry cannot cross midnight.
- **AI review.** The daily cap is re-checked inside the job-creating transaction, model URLs are
  rewritten to a placeholder host until replaced, and published content cannot be edited.
- **Client resilience.** Per-attempt timeouts, opt-in POST retries, one 401 broadcast; engines
  `safeParse` and degrade per item; completion refs stop double-taps skipping a step.
- **Reduced motion** is honoured everywhere, by both `useIsMotionReduced` and the CSS reset.

### 7.5 Order of work

One item per branch, in the order `improvement-tracker.md` lists. R-01 to R-05 first — each is
small and each is a live defect. v1's P0-2 (the test-database harness) is still the item worth
the most; it is carried into the tracker as `V1-P0-2` and should not be rushed.

---

_Improvement Plan v1 — kidlearn, 2026-09-04; §7 added 2026-10-04. This document proposes work; it does not authorise
it. Each item becomes real when it has a row in `document/implementation/00-progress-tracker.md`
and a branch of its own._
