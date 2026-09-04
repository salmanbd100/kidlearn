# kidlearn — Pre-Deployment Improvement Plan

> **Status:** proposed, 2026-09-04. Written after files 01–37a were complete and before file 38
> (deployment) was started.
> **Scope:** what needs to change so this codebase stays maintainable for years, not what needs
> to change to ship. Two of the findings block a safe deployment; the rest are debt that is
> cheap to clear now and expensive to clear after `apps/mobile` exists.
> **Method:** the whole tree was read and every check in §1 was actually run. Numbers in this
> document are measured, not estimated. Where something is inferred rather than verified, it
> says so.

---

## Table of Contents

1. [Verified baseline](#1-verified-baseline)
2. [What is already good — and should not be touched](#2-what-is-already-good--and-should-not-be-touched)
3. [Findings, ranked](#3-findings-ranked)
4. [Sequenced roadmap — implementation files 39–46](#4-sequenced-roadmap--implementation-files-3946)
5. [Harness updates — CLAUDE.md, README, skills, agents](#5-harness-updates--claudemd-readme-skills-agents)
6. [Explicitly not recommended](#6-explicitly-not-recommended)

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
- **Env validation** (`apps/server/src/lib/env.ts`). Zod-parsed, frozen, fail-fast at boot, with
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
NFR-SAFE-06), transaction isolation (the reward ledger's unique grant, the PIN strike counter)
and unique constraints are all currently asserted against `schema.prisma` *as text*.

**Fix — and this is a phased port, not a rewrite:**

1. Build the harness: a `globalSetup` that runs `prisma migrate deploy` against `kidlearn_test`,
   plus a per-file `beforeEach` that truncates in FK order (or wraps each test in a rolled-back
   transaction). Add factory helpers under `apps/server/src/test/`.
2. Port in risk order, not file order. The suites whose guarantees a stub *cannot* express go
   first: `content.test.ts` and `stories.test.ts` (the `include`d-relation status gate),
   `children.test.ts` (cascades), `parent.test.ts` (the PIN counter), `progress.test.ts` and the
   reward ledger (the once-a-day unique grant).
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

To be fair to what exists: application-level abuse controls *are* thoughtfully built — the PIN
gate has escalating lockouts with strike persistence (`parentSecurityService.ts`), and AI
generation is capped per day per cost bucket (`rate-guard.ts`, `require-generation-budget.ts`).
The gap is the generic transport layer beneath them.

**Why it matters now specifically:** file 38 puts this behind Caddy on an EC2 box, serving
`api.kidlearn.net` over TLS. Without `trust proxy`, `req.ip` is the proxy's address — which
silently weakens any IP-based control added later — and better-auth's secure-cookie handling
behind a TLS-terminating proxy needs it too. Adding this *after* the first deployment means
debugging it in production.

**Fix:**

- `helmet()` with a CSP that the `/docs` Swagger UI route is exempted from.
- `express.json({ limit: "1mb" })` — currently unbounded; the admin editors POST large JSONB
  payloads, so size the limit against a real quiz/activity payload rather than guessing.
- `express-rate-limit` on `/api/auth/*` and the PIN verification route. The app-level lockout is
  per-parent; this is per-IP, and they defend different attacks.
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

What actually exists is `primitives/` (6 components, 597 lines total), `lib/cn.ts` and
`styles/tokens.css`. There is no `kid/`, no `parent/`, no `hooks/`. Meanwhile `apps/web` holds
`components/kid/`, `components/parent/`, `components/activities/`, `components/quiz/`,
`components/rewards/`, `components/student/`, `components/admin/` and `hooks/` — roughly 157
non-test component files.

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
  that renders them, under `apps/web/components/<surface>/`, and the existing
  `kid/` / `parent/` / `student/` / `admin/` split is the layering.
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
- `packages/i18n` — move `apps/web/locales/*` in wholesale, update `apps/web/lib/i18n.ts`, and add
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
- `apps/web/lib/localized-label.ts` — `pickLabel()` returns a bare string, silently falling back
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
| `apps/server/src/routes/progress.test.ts` | 2,202 | One file covering rewards, streaks, sessions and completion |
| `apps/server/src/routes/admin/content.test.ts` | 2,095 | Four resources' CRUD plus the transition matrix |
| `apps/server/src/services/ai/review.ts` | 900 | 30 functions: listing, detail assembly, asset attachment, approve/reject, chain walking |
| `apps/server/src/services/adminContentService.ts` | 894 | Four near-identical CRUD blocks (world/subject/topic/lesson) + transitions + reordering |
| `apps/web/lib/admin-api.ts` | 641 | 50 exports spanning auth, content, media, editors, AI and characters |
| `apps/web/app/(admin)/admin/curriculum/CurriculumScreen.tsx` | 782 | The largest client component |

**Fix, in priority order:**

1. **`admin-api.ts` — split by resource** (`admin/content-api.ts`, `admin/media-api.ts`,
   `admin/ai-api.ts`, `admin/editors-api.ts`). This is the cheapest and clearest win: it is a flat
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
| 41 | `41-server-http-hardening.md` | P1-2: helmet, body limits, per-IP rate limiting on auth and PIN routes, web security headers. `trust proxy` is excluded — file 38 requirement 4 ships it. **Do this immediately after file 38: the API is public from that moment.** | 38, 39 | 2–3h |
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
| `pr-description` | No change. | Works as written. |
| `explain`, `responsive-design` | No change. | Both are scoped to teaching and layout, neither of which this plan alters. |

**One new skill is worth adding — and only one.** `/upgrade-dependency <package>`: read the
changelog between the pinned and target major, list the call sites in this repo, branch, upgrade,
run the four gates, and report honestly what it could not verify. P2-3 is a recurring, mechanical,
easy-to-get-wrong task with a fixed shape — exactly what a skill is for. Everything else in this
plan is one-off work that does not justify one.

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

- **Do not hoist `apps/web/components/**` into `packages/ui`.** The standard that implies it is
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

_Improvement Plan v1 — kidlearn, 2026-09-04. This document proposes work; it does not authorise
it. Each item becomes real when it has a row in `document/implementation/00-progress-tracker.md`
and a branch of its own._
