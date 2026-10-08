---
name: code-review
description: Use when work on a kidlearn feature branch is finished, when the user says "review this", "review my branch" or "check this before I push", and before running /pr. Invoke as /code-review, /code-review <branch>, or /code-review <branch> <base>.
---

# kidlearn Code Review

Pre-push review for the **kidlearn** monorepo, against `dev`.

**Your job is what automation cannot do.** Biome, TypeScript and the Vitest suites run in CI
(`.github/workflows/ci.yml`, job `gates`). Anything they catch is a build failure, not a review
finding, and reporting it spends the engineer's attention on something a command would have told
them in ten seconds. You are here for the `[REVIEW]` tier of `general.md §6` — the rules nothing
checks — and for bugs.

## The standards are the authority

| Document                         | Read when                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| `document/standards/general.md`  | **Always** — layout, TypeScript, imports, naming, testing, the `[REVIEW]` matrix, GitHub flow |
| `document/standards/frontend.md` | The diff touches `packages/ui` or `apps/web`                                                  |
| `document/standards/backend.md`  | The diff touches `apps/server`, `packages/db` or `packages/types`                             |
| `document/design.md`             | The diff touches a component or a visual decision                                             |

`document/engineering-standards.md` is an index into those three; never cite it as a rule.

Each document carries **recorded exceptions** — dated, bounded deviations that look exactly like
violations of a rule written two paragraphs above them. Read the ones covering the layers in this
diff, and read their scope: the `(admin)` carve-outs stop at `app/(admin)/`, and a `(student)` or
`(parent)` route doing the same thing is a finding, not an exception.

**A rule you cannot quote is a rule you cannot report.** Every standards finding carries the
sentence, verbatim. If you cannot find the sentence, it is a bug or it is nothing.

---

## Step 0 — Establish the surface

```bash
git branch --show-current            # if no branch was passed as an argument
git status --short                   # uncommitted work
git log dev..<branch> --oneline
git diff dev...<branch> --name-only
git diff dev...<branch>
```

**The base is `dev`, not `main`, unless the user supplies one** (`/code-review <branch> <base>`,
any ref or SHA). Check that it resolves (`git rev-parse --verify <base>`) and that the diff is
non-empty before going further, and name the base in the report header. Feature branches are cut from `dev` and `/pr` opens against
`dev`; only a `dev` → `main` release PR uses `main` (`project-requirement-details.md §9`).

**If the diff comes back empty, find out why before improvising a base.** Two cases, opposite
responses:

```bash
git merge-base --is-ancestor <branch> dev && echo "already merged"
```

- **Already merged.** There is nothing to review before pushing. Say so, and ask whether the user
  wants a retrospective review instead. Never swap the base silently and present the result as a
  pre-push review — the two answer different questions.

  If they do want one, **get the range from the pull request, not from `git`**:

  ```bash
  gh pr list --state merged --search "<branch>" --json number,headRefName
  gh pr view <number> --json baseRefOid,headRefOid
  git diff <baseRefOid>...<headRefOid>
  ```

  Once a branch is merged, `git` can no longer tell you where it started: `merge-base` with `dev`
  returns the branch tip, and `<branch>^` returns its own second-to-last commit. **Both silently
  yield a fraction of the branch.** If there is no PR to read, ask the user for the base commit.
  Do not guess one, and never fall back to reviewing a single commit as though it were the branch
  — a review of 4 files out of 46 that does not say so is worse than no review.

- **Not merged, still empty.** The branch is not ahead of `dev`. Stop and say so.

**Uncommitted changes count.** `git diff dev...<branch>` cannot see the working tree, and a
pre-push review that ignores it reviews something the engineer is not about to push. If
`git status --short` is not empty, review `git diff HEAD` alongside it and say so in the output.

---

## Step 1 — What it does, and what it was meant to do

State in a paragraph what the branch does and which layers it touches.

Then read the spec. Branch names carry an implementation-file number
(`14-parent-onboarding-profile-ui` → `document/implementation/14-*.md`); read that file's
acceptance criteria and FR IDs and check the branch against them. **A branch that ships something
other than what it was asked for is the most expensive finding available, and no linter will ever
make it.** Say so if the branch name carries no file number, and skip this.

If the diff touches only `document/**`, `README` or `.github/**`, check the docs against the code
they describe, report that the diff is documentation-only, and stop.

---

## Step 2 — Parallel review

Launch these in parallel, each as its own sub-agent with its own context, so a long standards
pass cannot dilute the spec pass. S, A–C, F, G, H and K always run. Run D only if the diff touches `apps/server` or
`packages/types`; E only if it touches `packages/ui/` or `apps/web/`; I only if it touches
`packages/db/prisma/`; J only if it touches `**/Dockerfile`, `.github/**`, `config/env.ts` or
deployment docs. Give each the diff, the spec from Step 1, and the layers in scope.

A–E return a finding with the standards sentence quoted. S returns a finding with the
acceptance criterion or FR ID quoted. **F–K review what no standards document covers yet**, so they carry a different burden: every finding states a **failure path** (the
input, load or state, and the wrong outcome) or a **maintenance cost with a named future change
that gets harder**. "Could be cleaner" is not a finding.

The bar is a staff engineer's: would this survive a reviewer who owns the system in production
for the next two years? A correct diff that is hard to change, hard to operate or unsafe at ten
times today's data is still worth a finding.

**Briefing each sub-agent.** Every brief states:

1. Read-only. Never edit files, and never read `.env`, `.env.local`, `*.pem`, `*.key`, `.npmrc`
   or `~/.ssh/*` (`.env.example` is fine).
2. Which files to read **whole**, not as hunks, and which section of this skill is its rubric.
3. What not to report: anything Biome, `tsc` or the Vitest suites catch.
4. The return shape per finding: `file:line`, the quoted sentence or a **Fails when** path, a
   severity guess, a one-sentence fix, and whether it ran anything to confirm it.
5. **At most eight findings, ranked by blast radius.** An agent over the cap cuts its own tail
   rather than leaving the cut to you.

A sub-agent's report is a lead, not a verdict. Step 3 takes every finding back to the files
before it reaches the engineer.

### S — Spec fidelity

Give this agent the implementation file from Step 1 and the diff, and nothing from the standards.
Its question is only: does the branch build what was asked, no more and no less?

- **Missing.** An acceptance criterion or FR ID with no code and no test behind it.
- **Diverging.** Behaviour that contradicts the spec — a different status code, a different
  default, a different order of steps.
- **Extra.** A feature, endpoint, field or setting the spec never asked for. Unrequested surface
  is unreviewed surface, and for a children's product it is also unvetted content or data.
- **Untested requirement.** Each criterion needs a test that fails when it is broken.
- **Unrecorded decision.** The branch resolves an ambiguity in the spec one way with no note in
  the PR or the implementation file, so the next engineer cannot tell choice from accident.
- **Stale spec.** The code disagrees with the spec because the code follows a newer source of
  truth (a changed default in `config/env.ts`, say). The finding is "update the spec or record
  the divergence", Worth fixing — never "revert the code".
- **A step silently dropped.** A one-off instruction in the spec (measure, record, rehearse,
  verify from a log) that appears nowhere in the runbook or PR. Procedures are requirements too.
- **Status claims.** A progress-tracker or PR statement that something is "done", "verified" or
  "green" must name how: a CI run, a command and its output. A claim that rests on a local run
  nobody can repeat is reworded, not accepted.

With no implementation file (Step 1 says why), this agent runs against the branch's commit
messages and the user's description instead, and the header says so.

### A — Content safety and access control

Never dropped as a nitpick. One missing guard shows draft content to a child.

`backend.md §4`: _"Every Prisma query that serves student-facing content **must** include
`where: { status: "published" }`. A missing filter is a content-safety bug, not a style issue. It
must have an explicit test."_

Read every Prisma query in the diff — the top-level `where` **and every relation it pulls in**.
Related rows carry their own `status`, and Prisma cannot filter an `include`, so a published
lesson pointing at a draft activity serves that payload to a child (this shipped once, fixed in
`919b2c5`).

The rule lives in one place: `apps/server/src/shared/utils/published-for-child.ts`. Read it. A query is
expected to call `publishedForChild`, `publishedOnly`, `publishedRelation`,
`publishedRelationForChild` or `isPublished` rather than hand-write the condition — a new query
spelling out `status: "published"` itself is a finding even when correct today, because the rule
then has two homes and one will drift. A gate on the detail endpoint but not the list endpoint is
a finding on whichever lacks it.

Also:

- A route under `app/(student)/` with no valid-child-session check; `app/(parent)/` exposing data
  without the PIN gate; `app/(admin)/` without an admin-role check.
- **Fail-open on a guard state that could not be read.** The most repeated defect in this
  repository: a gate enforced in the browser but not on the route (`3d433a2`), and a client whose
  `isLocked` stayed at its initial `false` when the gate-status request failed, so one network
  blip rendered the whole parent area unlocked. For every guard the diff touches, ask what it
  does when its input is missing, stale or unreadable. **Unknown means locked.** A branch of a
  guard with no `else` is the shape to look for.
- **A guard applied to one verb but not its siblings.** The now-removed `requirePinVerified` once
  guarded a single route while `PATCH`/`DELETE` on the same resource needed only a session cookie.
  When a diff adds a guard, check every verb on that resource, and check that any deliberate
  exemption is written down rather than implied.
- **Response leaks.** `packages/types` response schemas are `.strict()`, so an extra field on the
  wire is a content-safety failure, not a documentation slip (`backend.md §7`, NFR-SAFE-02).
- **The probe surface.** Unpublished content and another parent's child both return `404`, never
  `403`, so a probe cannot confirm a row exists. A `403` where the spec says `404` belongs here,
  not in the status-code nitpicks.
- Content published without human review — AI output never auto-publishes (`backend.md §4`).
- A deleted or weakened content-safety test. `general.md §5`: _"A PR that reduces test coverage on
  a service layer or disables a content-safety test does not merge."_

### B — Correctness

Bugs this branch introduces. Not pre-existing ones, not what `tsc` or Biome already caught.
**Read the whole file, not the hunk** — the commonest false positive here is flagging a guard the
twenty lines above the diff already handle.

**Running down a list of React and async clichés is not review** — that is how the bug in
`75b0884` shipped past a reviewer who checked the effect for stale closures, dependency arrays and
cleanup, found none, and passed it.

For every value the diff computes, ask what its consumer does with a value outside the range it
expects, and answer from the platform's documented behaviour rather than from what looks
reasonable. Then look hardest at the classes that have actually shipped here:

- **Platform limits on data-derived values.** Any timer, counter or offset computed from an API
  value rather than a constant, checked against its consumer's accepted range and against `NaN`.
- **Read-modify-write on a shared row.** A lost update on the PIN attempt counter shipped through
  a fixed-row test stub. Prefer `{ increment: n }` and a transaction over read-then-write.
- **`Date` arithmetic** — `NaN` from an unparseable string, `getTime()` on an invalid date.
- Off-by-one, inverted conditionals, missing null/undefined guards.
- Missing `await`, unhandled rejection, a promise where a value is expected.
- Prisma query shape: wrong `where`, missing `include`, a field that does not exist.
- React: stale closure, state mutated in place, a dependency array missing something the effect
  reads, an effect that reschedules itself every render, cleanup that does not cancel what the
  effect started.

State the **failure path** for each: the input or state, and the wrong output. A bug with no
failure path is a suspicion, not a finding.

### C — `[REVIEW]` standards compliance

`general.md §6` holds the definitive list of what a human must catch. Work through every row.

Always:

- **Cross-package direction** — `packages/*` importing from `apps/*` (`general.md §3`).
- **Barrel files** — a new `index.ts` inside a package other than `src/index.ts` (`general.md §3`).
- **`enum`** — `as const` only (`general.md §2`).
- **`as` cast with no comment** explaining why narrowing is impossible (`general.md §2`).
- **Testing rules** — the three `[REVIEW]` rules in `general.md §5` nothing else checks: tests
  co-located beside the file under test (no `__tests__/`); no snapshot tests; Prisma not mocked
  in a **new** suite — that is a `.db.test.ts` (`pnpm --filter server test:db`). An existing
  stubbed suite is in scope for all four bounding rules of the recorded exception and the
  file-header comment citing it — a suite breaking one is **not covered**, and that is a finding
  quoting the numbered rule. A diff that changes a status gate, a cascade, a transaction or a
  unique constraint with no `.db.test.ts` assertion for it is a finding: the stub cannot see it. Test names describe observable
  behaviour, not implementation.
- **The progress tracker** — `general.md §7` makes it mandatory and tags it `[REVIEW]`: the row in
  `document/implementation/00-progress-tracker.md` for this branch's file reads `✅ Done` before
  the branch is pushed. Also: one implementation file per branch, not two.

Frontend:

- **Semantic tokens** — raw hex, a CSS colour literal or a Tailwind colour class in component code
  (`frontend.md §1`).
- **i18next** — a user-visible string not routed through it (`frontend.md §4`).
  Key parity, blanks and `{{placeholders}}` between `en` and `bn` are `[CI]` now
  (`packages/i18n/src/parity.test.ts`); what CI cannot see is a Bangla string that is
  present but is a copy of the English, or a machine translation nobody checked — flag new
  Bangla copy for a native speaker's read.
- **`'use client'`** — a boundary higher than the leaf needing it (`frontend.md §3`).
- **Layer placement** — the wrong `packages/ui` subdirectory, per the table in `frontend.md §1`
  ("if it matches more than one row, use the most specific match").
- **Exports** — a new public component missing from `src/index.ts` _or_ the `package.json`
  `exports` map. Both are required.

Backend:

- **Thin handlers** — Prisma calls, branching or calculation in the handler rather than a service
  callable without HTTP (`backend.md §2`).
- **Zod at the boundary** on every route taking a body, params or query (`backend.md §2`).
- **`new PrismaClient()`** anywhere in `apps/server`; raw SQL (`backend.md §3`).
- **Errors thrown, not sent**; semantic status codes, never `200` with an error body.
- **Server-authoritative progress** — rewards, streaks, screen time or completion computed client
  side (`backend.md §8`).

### D — API contract and types

`backend.md §7` splits into rules a test enforces and rules only you can. **Do not report the
first group** — `coverage.test.ts` and `document.test.ts` already fail the build for an
undocumented route, a stale registry entry, a missing or duplicate `operationId`, a tag with no
`x-tagGroups` group, and an example that does not parse. Report those only if the diff weakens or
skips one of those tests, which _is_ a finding.

Yours:

- **An incomplete path entry** — registered but omitting a status code its guards produce:
  `requireParent` → 401; `requireConsent` → 403 `CONSENT_REQUIRED`; `requireActiveChild` → 403;
  `loadOwnedChild` → **404, never 403**. No test sees this.
- **A second source of truth** — a response shape declared in `apps/web` or hand-written as JSON
  Schema instead of Zod in `packages/types/src/api/`. Request schemas are the Zod objects in
  each module's `.schema.ts` that `validate()` already runs.
- **`z.date()` in a response schema** — the wire format is an ISO string; use `IsoDateTimeSchema`.
- **Missing `assertContract(Schema, res.body, "<operation>")`** on a new successful response.
- **A refinement that vanished** — `.refine()`/`.superRefine()` are dropped in JSON Schema
  conversion, so a rule like "at least one field required" must be restated in a `description`.
- **A hand-mirrored Prisma enum in `packages/types`** with no compile-time assertion that it still
  matches (`src/openapi/paths/children.ts` has the pattern).
- **`operationId` convention** — `verbResource` camelCase, admin operations prefixed
  (`getAdminLesson` beside `getLesson`). Uniqueness is tested; the convention is not.

Plus, from `general.md §2`–`§3`: Prisma types redeclared instead of imported from `@kidlearn/db`;
a type duplicated in both apps that belongs in `packages/types`; a missing return type on an
exported function; `null` where `undefined` is the application-layer value; a relative import
crossing a package boundary; `@/*` not used inside `apps/web`.

### E — Design system

Read `design.md §11` and `frontend.md §1`.

- `cva` for every variant API, `cn()` to merge — no ad-hoc `className` concatenation. A caller
  passing a long `className` to restyle internals means the variant is missing.
- No theme branching in JS; `ThemeScope` on the layout boundary only — a bare `data-theme` div leaves portalled dialogs and menus in the kid theme.
- `kid/`/`parent/` compose from `primitives/` rather than duplicating markup.
- Touch targets ≥64px kid, ≥44px parent; no text below 20px on kid surfaces (`design.md §7`).
- Motion animates only `transform` and `opacity` and respects `prefers-reduced-motion`
  (`design.md §5`).
- Fonts via the `font-display`/`font-body`/`font-ui` tokens and `next/font`; images via
  `next/image`.
- Visible focus ring, keyboard operable on parent surfaces; contrast ≥ AA; meaning never carried
  by colour alone.
- No horizontal scroll at 360/768/1024, `dvh` and safe-area insets, layout survives +40% text
  length from translation (`design.md §11`).

### F — Security and children's data

kidlearn holds data about children aged 3–6, so a privacy slip is a safety slip.

- **Object-level authorisation (IDOR).** Every handler taking an id from params, query or body:
  where is ownership established? A parent reaching another parent's child, session or
  subscription by guessing an id is the canonical failure. `loadOwnedChild` is the pattern;
  a hand-rolled `findUnique({ where: { id } })` with no owner in the `where` is the smell.
- **Mass assignment.** A request body spread into a Prisma `data` object
  (`update({ data: req.body })`, `{ ...input }`) lets a caller set `status`, `role` or
  `parentId`. Fields are picked explicitly from the Zod-parsed value, never from the raw body.
- **PII in logs, errors and responses.** Child name, birth date, email or session tokens in a
  log line, a thrown message or an error body. `config/logger.ts` redacts a fixed path list —
  a new field carrying PII that is not on it is a finding.
- **Data minimisation.** A new field collected about a child with no requirement in
  `project-requirement-details.md` behind it. Check account deletion still removes it
  (`document/` consent and deletion requirements).
- **Auth and session handling.** Cookie flags (`HttpOnly`, `Secure`, `SameSite`), a state-changing
  `GET`, a token compared with `===` rather than a constant-time compare, a secret or cron
  endpoint left unauthenticated, an open redirect after sign-in.
- **Trust in the client.** Anything the server accepts because the browser said so: a role, a
  price, a child id not tied to the session, a `status` field.
- **Abuse surface.** A new unauthenticated or expensive endpoint (AI generation, email, file
  upload) with no rate limit, size limit or per-parent quota. Verify what protection exists
  before asserting there is none.
- **Dependencies.** A new package: is it maintained, is it needed, does the repo already have
  something that does this? Lockfile changes with no matching `package.json` change.
- **Secrets.** A real key, token or connection string in code, fixtures, docs or a Dockerfile
  `ENV`/`ARG` baked into a layer. `.env.example` holds names only.
- **Injection and unsafe rendering.** `dangerouslySetInnerHTML`, a URL built from user input
  and fetched server-side (SSRF), a payload from AI output rendered or stored without passing
  the `packages/types` validator.

### G — Data access, scale and failure modes

- **N+1 and unbounded reads.** A query inside a loop or `.map`; a list endpoint with no `take`
  or cursor; an `include` that pulls a large JSONB payload into a list response. State the row
  count at which it hurts.
- **Missing index.** A new `where`/`orderBy` column with no index in the schema. Check
  `schema.prisma` and recent migrations before reporting; `20260910…content_visibility_indexes`
  shows the repo's pattern.
- **Transactions and idempotency.** Two writes that must succeed together outside
  `prisma.$transaction`; a retried request (network blip, double-click, webhook redelivery)
  that creates a duplicate or double-awards a reward. Server-authoritative progress must be
  idempotent per event.
- **Check-then-act races.** `findFirst` then `create` where a unique constraint should decide.
- **Error paths of external calls** (Google OAuth, Gemini, email, storage): no timeout, no
  handling of a non-2xx, a failure that leaves half-written state, a retry with no backoff.
- **Client data fetching.** A waterfall of sequential requests that could be one; no loading or
  error state, so a failed request renders as an empty screen; an optimistic update with no
  rollback.
- **Hot paths on small devices.** Work on the render path of kid screens (large lists, layout
  thrash, unmemoised heavy computation, unbounded bundle imports such as a whole icon set) —
  the primary devices are low-end phones and tablets.

### H — Test quality

`general.md §5` governs where tests live; nothing checks whether they test anything.

- **A test that cannot fail.** Asserts only that a mock was called, that a value `toBeDefined()`,
  or restates the implementation. Ask: if the feature were deleted, would this go red?
- **Only the happy path.** A new branch, guard or error class with no test hitting it. For
  every new `throw`, `404` and `403` there should be a test that triggers it.
- **Boundary cases absent** — empty list, one item, `null` birth date, expired session, a
  second request replaying the first.
- **Over-mocking.** A service test that stubs the very collaborator whose behaviour is the thing
  that can break.
- **Order or time dependence.** Real timers, `Date.now()` without a fake clock, shared mutable
  fixtures between tests — the cause of the intermittent Supertest failures the CI section of
  `CLAUDE.md` describes; do not add to it.
- **A skipped or loosened test** (`it.skip`, `.only`, a widened matcher, a deleted assertion) in
  a diff that also changes the code under test.

### I — Migrations (only if `packages/db/prisma/` changed)

A migration is the one change that cannot be reverted by reverting the commit.

- **Destructive in one step.** `DROP COLUMN`/`DROP TABLE`, a type change, or a `NOT NULL` added
  without a default or backfill — against rows that already exist. The safe shape is expand,
  migrate, contract across deploys.
- **Old code against new schema.** Containers roll over one at a time, so for a moment the
  previous release runs against the new schema. Does it survive?
- **Backfill inside the migration** on a large table, holding a lock.
- **Index creation** on a table with rows without `CONCURRENTLY`, or a foreign key added to one
  without `NOT VALID` — `backend.md §3`; `packages/db/src/migrations.test.ts` catches the
  common shapes, not every one.
- **Schema and migration disagree** — an edit to `schema.prisma` with no migration, or a
  hand-edited migration already applied elsewhere (rewriting history).
- **Cascades.** A new relation's `onDelete` against the deletion requirement: removing a parent
  must remove the child's data and nothing else.
- **`database-design.md` not updated** for a schema change (`database-design.md` wins on any
  schema question).

### J — Operability and deployment (only if infra files changed)

- **Backup and recovery.** Where a script writes the only copy of production data, trace every
  failure, not the success path: a dump that dies midway must not leave a file that looks like a
  backup (write to a temporary key, promote on success); a failed run must reach a monitored
  channel, because cron with no redirect and no mail agent fails silently; and the restore path
  must have been run once, since an unrehearsed backup is a guess.
- **Rollout and rollback.** A deploy script that overwrites its record of the previous version
  before the new one is proven healthy has destroyed its own rollback. Ask what the operator
  types at 3 a.m., and whether the health gate exercises the dependency that is most likely to
  be broken (the database), not just the process.
- **Order of operations across steps.** Where two documented steps read shared state (a tag, an
  env file), walk them in the documented order and check the second sees what the first
  promised. Two scripts that each look right can disagree.
- **Concurrency.** Two operators or two retries running the same script at once: is there a lock?
- **Zero-downtime claims.** A proxy in front of a container that gets recreated returns errors
  for the gap unless it retries.
- **Secrets at rest and in flight.** Credentials passed as command-line arguments are visible in
  `ps` and `docker inspect`; prefer inherited env vars or stdin.
- **Dockerfile.** Runs as root; secrets via `ARG`/`ENV`; dev dependencies in the final image;
  unpinned base image; layer order that busts the install cache on every source change;
  `.dockerignore` missing `.env*`.
- **Fail-fast config.** A new env var read outside `config/env.ts`, or one with no entry in
  `.env.example` and the deploy docs (`backend.md §5`).
- **Health and shutdown.** A health check that returns healthy while the database is
  unreachable; no `SIGTERM` handling so deploys drop in-flight requests.
- **Observability.** A new failure mode that logs nothing, or logs without a request id, so
  production cannot answer "what happened to this user".
- **CI.** A step that widens secrets exposure to fork PRs, a removed gate, an unpinned action.
- **Runbook.** A new operational step missing from `document/runbook.md` or
  `document/deployment-walkthrough.md`.

### K — Maintainability

Judged against the code around the diff, not an abstract ideal.

- **Wrong altitude.** An abstraction with one caller; a generic helper that takes five flags;
  logic duplicated across modules that already has a home. Search before reporting
  duplication — name the existing function.
- **Leaky boundaries.** A module reaching into another module's internals; `shared/` importing a
  module; a component that knows which API endpoint backs it when its feature's hook should.
- **Names that lie.** A function whose name says one thing and whose side effects say another;
  a boolean flag that inverts behaviour; a `data`/`result`/`handle` with no noun.
- **Scope creep.** An unrelated refactor or rename in the same branch (`general.md §7`: one
  implementation file per branch) that makes the real change harder to review. This includes
  deleting or rewording comments in a file the spec only touched elsewhere: a deleted comment
  that carried a *why* the code cannot show (a requirement ID, a cross-file coupling) is a
  finding; one that restated the code is not.
- **Leftovers.** `console.log`, commented-out code, a `TODO` with no owner or ticket, dead
  exports, an unused feature flag.
- **Comments.** One that restates the code, or a non-obvious decision (a workaround, an
  invariant) with none. The `why` goes in a comment; the `what` goes in a name.
- **Language.** US spelling in prose, comments, docs or UI copy — British English throughout
  (`colour`, `behaviour`, `organise`), matching the `en-GB` locale.
- **Error messages and UX copy** a parent could not act on, or a kid-surface string above the
  reading level of a 5-year-old's carer.

---

## Step 3 — Verify before reporting

Take each finding to the code itself, not the diff hunk, and answer all four:

1. **Does the cited rule say what the finding claims?** Re-read the sentence. A paraphrase that
   drifts is a false positive with a citation attached — the worst kind. For an F–K finding there
   is no sentence: re-trace the failure path through the real code and confirm every step of it,
   including the protection you claimed was absent (a rate limit, an index, a transaction in a
   caller).
2. **Is it exempted?** Check the recorded exceptions, by path, and check their stated scope.
3. **Did this branch introduce it?** `git log -1 -S'<the line>' -- <file>`. If the line predates
   the branch, drop it — a review that relitigates merged code is noise.
4. **Does it survive the whole file?** The guard may be four lines above the hunk.

Then rate what is left:

|                  | Meaning                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Blocking**     | A content-safety, access-control or child-privacy gap (IDOR, mass assignment, PII leak); a bug with a concrete failure path; data loss or an irreversible migration step; a spec criterion missing or contradicted; a `[REVIEW]` rule violated with the sentence quoted. |
| **Worth fixing** | Real and verified, but the branch ships without harm — a convention slip, a missing return type, an unclear name, an N+1 on a table that stays small, a test that cannot fail, a maintainability cost with a named future change. |
| **Drop**         | Anything you could not answer all four questions for. Anything a tool catches. Anything you would preface with "consider" or "might want to". |

**Every content-safety and access-control finding is Blocking**, and is never rated down for being
small — a one-word `where` clause is the whole guard.

Uncertainty is not a severity. If you are not sure a finding is real, do the work to find out or
drop it. Do not report it hedged and leave the engineer to check.

**A deliberate trade-off is not a defect — but its consequence still has to be acceptable.** When
the spec, a comment or the runbook records a choice (manual rollback, a speed-bump rather than a
boundary), do not report the choice. Report it only if the recorded rationale does not cover the
failure you found: a manual rollback is a decision, but a rollback whose target tag was deleted
by the script is not what was decided. Rate such findings Worth fixing unless they lose data or
expose content, and say which decision they sit under.

**Default drops for infrastructure diffs**, unless the diff makes them newly exploitable:
unpinned base-image tags, a root user in a build-only stage, an unchecksummed download in a
one-off bootstrap script, and tag validation on an argument only root can supply. They are
hygiene and are worth one line in a follow-up, not a slot in the review. Rank what survives by
blast radius: data loss, then prod down, then security, then operability, then convention.

**Unverified is a section, not a finding.** What you could not check from the repo (instance
metadata settings, bucket policies, a restore never run) goes under a short **Unverified** list
with the one command or console page that would settle it. It never counts toward Blocking.

---

## Step 4 — Report

````markdown
### kidlearn code review — `<branch>` → `dev`

<N commits, M files. Layers: apps/web, apps/server.>
<Spec: document/implementation/14-\*.md — matches / diverges: …>
<Ran: the commands you executed and their result, e.g. "`vitest run app.test.ts` — 11 pass".
Not run: build, typecheck, Docker, CI — everything you did not execute.>
<Skipped reviewers and why; sub-agent reads that were partial.>
<Includes N uncommitted files.>

**Verdict: Request changes** (Blocking > 0) | **Approve with comments** (only Worth fixing) | **Approve**
**Blocking: N. Worth fixing: M.** Base: `<dev or supplied ref>`.

---

#### 🔴 CONTENT SAFETY — <one-line description>

`apps/server/src/modules/content/story.service.ts:42`

> `backend.md §4` — "<the sentence, verbatim>"

```ts
<3–6 lines>
```

**Fails when:** <the concrete path to the wrong outcome.>
**Fix:** <one sentence.>
````

Labels: `🔴 CONTENT SAFETY`, `🔴 SECURITY`, `🔴 SPEC`, `🔴 BUG`, `🔴 DATA`, `🔴 STANDARDS`,
`🔴 API CONTRACT`, `🟡 PERF`, `🟡 TESTS`, `🟡 OPS`, `🟡 MAINTAINABILITY`, `🟡 DESIGN` — 🔴 Blocking,
🟡 Worth fixing; any label takes either colour per the Step 3 table. Order: content safety,
security, spec, bugs, data, standards, API contract, then the rest; Blocking before Worth fixing
within each. A finding from F–K replaces the quoted standards line with its **Fails when** path,
which is mandatory.

A clean branch names what was checked:

```markdown
### kidlearn code review — `<branch>` → `dev`

**No issues found.**

Checked: spec fidelity, content-safety guards including related rows, security and child data
(ownership, mass assignment, PII), correctness, data access and scale, the `[REVIEW]` matrix
(`general.md §6`), test quality and testing rules (`§5`), migrations, the progress tracker
(`§7`), API contract completeness (`backend.md §7`), design system (`design.md §11`),
maintainability. Not applicable: <reviewers skipped because the diff did not touch their layer>.
```

**Rules for the output:**

- Say what is wrong and where. No praise, no summary of the good parts, no encouragement.
- One finding per issue — three instances of one rule in one file is one finding, three lines.
- Quote the standards sentence verbatim, or reclassify the finding.
- Never report what Biome or `tsc` catches. Never report a line this branch did not touch.
- Never soften a Blocking finding into a suggestion.
- Findings about the code, never the author. State the consequence, then the fix; a fix that
  needs a design choice names the option you would take and why.
- At most ten Worth-fixing findings, ranked by cost of leaving them. If more survive Step 3,
  say how many were cut and name the classes; a long list buries the Blocking ones.
- Finish with **Unverified** (see Step 3) and, if the review exposed a rule this skill lacks,
  one line proposing it. Offer next steps; do not start fixing unasked.
- If you skipped a step — could not find the implementation file, did not read a standards
  document — say which, in the header. An unstated gap reads as a clean bill.
