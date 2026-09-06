---
name: code-review
description: Review a kidlearn feature branch against dev before it is pushed. Invoke as /code-review, or /code-review <branch-name>. Use when work on a branch is finished, when the user says "review this", "review my branch", or "check this before I push", and before running /pr.
---

# kidlearn Code Review

Pre-push review for the **kidlearn** monorepo, against `dev`.

**Your job is what automation cannot do.** Biome, TypeScript and the Vitest suites run in CI
(`.github/workflows/ci.yml`, job `gates`). Anything they catch is a build failure, not a review
finding, and reporting it spends the engineer's attention on something a command would have told
them in ten seconds. You are here for the `[REVIEW]` tier of `general.md §6` — the rules nothing
checks — and for bugs.

## The standards are the authority

| Document | Read when |
|---|---|
| `document/standards/general.md` | **Always** — layout, TypeScript, imports, naming, testing, the `[REVIEW]` matrix, GitHub flow |
| `document/standards/frontend.md` | The diff touches `packages/ui` or `apps/web` |
| `document/standards/backend.md` | The diff touches `apps/server`, `packages/db` or `packages/types` |
| `document/design.md` | The diff touches a component or a visual decision |

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

**The base is `dev`, not `main`.** Feature branches are cut from `dev` and `/pr` opens against
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

Launch these in parallel. Run D only if the diff touches `apps/server` or `packages/types`; run E
only if it touches `packages/ui/` or `apps/web/`. Give each the diff, the spec from Step 1, and
the layers in scope. Each returns findings with the rule quoted, or a bug with a failure path.

### A — Content safety and access control

Never dropped as a nitpick. One missing guard shows draft content to a child.

`backend.md §4`: *"Every Prisma query that serves student-facing content **must** include
`where: { status: "published" }`. A missing filter is a content-safety bug, not a style issue. It
must have an explicit test."*

Read every Prisma query in the diff — the top-level `where` **and every relation it pulls in**.
Related rows carry their own `status`, and Prisma cannot filter an `include`, so a published
lesson pointing at a draft activity serves that payload to a child (this shipped once, fixed in
`919b2c5`).

The rule lives in one place: `apps/server/src/lib/published-for-child.ts`. Read it. A query is
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
- **A guard applied to one verb but not its siblings.** `requirePinVerified` once guarded a single
  route while `PATCH`/`DELETE` on the same resource needed only a session cookie. When a diff adds
  a guard, check every verb on that resource, and check that any deliberate exemption is written
  down rather than implied.
- **Response leaks.** `packages/types` response schemas are `.strict()`, so an extra field on the
  wire is a content-safety failure, not a documentation slip (`backend.md §7`, NFR-SAFE-02).
- **The probe surface.** Unpublished content and another parent's child both return `404`, never
  `403`, so a probe cannot confirm a row exists. A `403` where the spec says `404` belongs here,
  not in the status-code nitpicks.
- Content published without human review — AI output never auto-publishes (`backend.md §4`).
- A deleted or weakened content-safety test. `general.md §5`: *"A PR that reduces test coverage on
  a service layer or disables a content-safety test does not merge."*

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
  except under the recorded exception. A suite using that exception is in scope for all four of
  its bounding rules and the file-header comment citing it — a suite breaking one is **not
  covered**, and that is a finding quoting the numbered rule. Test names describe observable
  behaviour, not implementation.
- **The progress tracker** — `general.md §7` makes it mandatory and tags it `[REVIEW]`: the row in
  `document/implementation/00-progress-tracker.md` for this branch's file reads `✅ Done` before
  the branch is pushed. Also: one implementation file per branch, not two.

Frontend:

- **Semantic tokens** — raw hex, a CSS colour literal or a Tailwind colour class in component code
  (`frontend.md §1`).
- **i18next** — a user-visible string not routed through it (`frontend.md §3`).
- **`'use client'`** — a boundary higher than the leaf needing it (`frontend.md §2`).
- **Layer placement** — the wrong `packages/ui` subdirectory, per the table in `frontend.md §1`
  ("if it matches more than one row, use the most specific match").
- **Exports** — a new public component missing from `src/index.ts` *or* the `package.json`
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
skips one of those tests, which *is* a finding.

Yours:

- **An incomplete path entry** — registered but omitting a status code its guards produce:
  `requireParent` → 401; `requireConsent` → 403 `CONSENT_REQUIRED`; `requirePinVerified` → 403
  `PIN_REQUIRED`/`PIN_VERIFICATION_REQUIRED`; `requireActiveChild` → 403; `loadOwnedChild` →
  **404, never 403**. No test sees this.
- **A second source of truth** — a response shape declared in `apps/web` or hand-written as JSON
  Schema instead of Zod in `packages/types/src/api/`. Request schemas are the Zod objects in
  `apps/server/src/schemas/` that `validate()` already runs.
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
- No theme branching in JS; `data-theme` on the layout boundary only.
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

---

## Step 3 — Verify before reporting

Take each finding to the code itself, not the diff hunk, and answer all four:

1. **Does the cited rule say what the finding claims?** Re-read the sentence. A paraphrase that
   drifts is a false positive with a citation attached — the worst kind.
2. **Is it exempted?** Check the recorded exceptions, by path, and check their stated scope.
3. **Did this branch introduce it?** `git log -1 -S'<the line>' -- <file>`. If the line predates
   the branch, drop it — a review that relitigates merged code is noise.
4. **Does it survive the whole file?** The guard may be four lines above the hunk.

Then rate what is left:

| | Meaning |
|---|---|
| **Blocking** | A content-safety or access-control gap, a bug with a concrete failure path, or a `[REVIEW]` rule violated with the sentence quoted. |
| **Worth fixing** | Real and verified, but the branch ships without harm — a convention slip, a missing return type, an unclear name. |
| **Drop** | Anything you could not answer all four questions for. Anything a tool catches. Anything you would preface with "consider" or "might want to". |

**Every content-safety and access-control finding is Blocking**, and is never rated down for being
small — a one-word `where` clause is the whole guard.

Uncertainty is not a severity. If you are not sure a finding is real, do the work to find out or
drop it. Do not report it hedged and leave the engineer to check.

---

## Step 4 — Report

````markdown
### kidlearn code review — `<branch>` → `dev`

<N commits, M files. Layers: apps/web, apps/server.>
<Spec: document/implementation/14-*.md — matches / diverges: …>
<Includes N uncommitted files.>

**Blocking: N. Worth fixing: M.** | **No issues found.**

---

#### 🔴 CONTENT SAFETY — <one-line description>

`apps/server/src/services/lessonService.ts:42`

> `backend.md §4` — "<the sentence, verbatim>"

```ts
<3–6 lines>
```

**Fails when:** <the concrete path to the wrong outcome.>
**Fix:** <one sentence.>
````

Labels: `🔴 CONTENT SAFETY`, `🔴 BUG`, `🔴 STANDARDS`, `🔴 API CONTRACT`, `🟡 DESIGN` — 🔴 Blocking,
🟡 Worth fixing. Order: content safety, bugs, standards, API contract, design; Blocking before
Worth fixing within each.

A clean branch names what was checked:

```markdown
### kidlearn code review — `<branch>` → `dev`

**No issues found.**

Checked: content-safety guards including related rows, correctness, the `[REVIEW]` matrix
(`general.md §6`), testing rules (`§5`), the progress tracker (`§7`), API contract completeness
(`backend.md §7`), design system (`design.md §11`).
```

**Rules for the output:**

- Say what is wrong and where. No praise, no summary of the good parts, no encouragement.
- One finding per issue — three instances of one rule in one file is one finding, three lines.
- Quote the standards sentence verbatim, or reclassify the finding.
- Never report what Biome or `tsc` catches. Never report a line this branch did not touch.
- Never soften a Blocking finding into a suggestion.
- If you skipped a step — could not find the implementation file, did not read a standards
  document — say which, in the header. An unstated gap reads as a clean bill.
