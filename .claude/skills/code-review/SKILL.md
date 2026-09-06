---
name: code-review
description: Review a local branch against dev before pushing. Invoke as /code-review <branch-name>. Checks document/engineering-standards.md compliance, bugs, content-safety rules (status:"published" guard, i18next), TypeScript/architecture conventions, and packages/ui component layer placement. Use before any PR is opened.
model: sonnet
---

# kidlearn Code Review

You are performing a pre-push code review for the **kidlearn** monorepo. The branch to review is provided as args.

The authoritative standards for this codebase are:
- **`document/standards/general.md`** — always applies: monorepo layout, TypeScript, imports, naming, testing, enforcement matrix
- **`document/standards/frontend.md`** — read when the diff touches `packages/ui` or `apps/web`
- **`document/standards/backend.md`** — read when the diff touches `apps/server`, `packages/db`, or `packages/types`
- **`document/design.md`** — visual tokens, motion, accessibility (referenced for component changes)

`document/engineering-standards.md` is an index that routes to the three documents above. Load only the role documents matching the layers the diff touches (established in Step 1).

---

## Step 0 — Get the diff

Run the following to establish the review surface. Store the results for agents in subsequent steps.

```bash
# All files changed on the branch vs dev — the same base /pr opens the PR against
git diff dev...<branch> --name-only

# Full unified diff
git diff dev...<branch>

# Commit log for context
git log dev...<branch> --oneline
```

If the branch does not exist or has no commits ahead of `dev`, stop and tell the user.

**The base is `dev`, not `main`** — feature branches are cut from `dev` and the `/pr` skill opens
against `dev`; only `dev` → `main` release PRs use `main` (`project-requirement-details.md §9`).
Reviewing against `main` would show a diff nobody is being asked to approve.

---

## Step 1 — Summarise the change

Use a fast agent to read the diff and return a one-paragraph summary of what the branch does. Identify which layers are touched: `packages/ui`, `packages/db`, `apps/web`, `apps/server`, `document/`.

---

## Step 2 — Parallel review (5 agents)

Launch all five agents in parallel. Each agent reads the full diff and the files it needs. Each returns a list of issues with the violated rule quoted verbatim.

### Agent A — Engineering Standards: `[REVIEW]` rules

Read `document/standards/general.md` in full, plus `frontend.md` and/or `backend.md` for the layers this diff touches. Check every `[REVIEW]`-tagged rule against the diff. The consolidated list of `[REVIEW]` rules is in `general.md §6`. Focus especially on:

Always:
- **Cross-package direction** — any import in `packages/*` that resolves to `apps/*`. Rule: `general.md §3`.
- **Internal barrel files** — a new `index.ts` created inside a package at a path other than `src/index.ts` that re-exports from multiple sibling files. Rule: `general.md §3`.
- **`enum` usage** — any TypeScript `enum` declaration. Rule: `general.md §2`.
- **`as` cast without comment** — a type assertion (`as SomeType`) with no inline comment explaining why narrowing is not possible. Rule: `general.md §2`.
- **`any`** — any explicit `any` type. Rule: `general.md §2`.

Frontend layers only (`packages/ui`, `apps/web`):
- **Semantic tokens** — any raw hex, CSS color literal, or Tailwind color class (`text-blue-500`, `bg-red-600`) used in a component instead of a semantic token (`text-foreground`, `bg-primary`). Rule: `frontend.md §1`.
- **i18next** — any JSX string literal or template string that is user-visible and not routed through `i18next`. Rule: `frontend.md §3`; `design.md §10` (content voice).
- **`'use client'` placement** — boundary added higher in the tree than necessary; a Server Component converted to a Client Component when only a leaf needs interactivity. Rule: `frontend.md §2`.
- **Component layer** — a component placed in the wrong `packages/ui` subdirectory (e.g. a kid-specific widget in `primitives/`, a pure utility in `kid/`). Rule: `frontend.md §1`.

Backend layers only (`apps/server`, `packages/db`, `packages/types`):
- **Route handler thickness** — business logic (Prisma queries, conditional branching, calculations) inside a route handler function body rather than a service. Rule: `backend.md §2`.
- **Zod missing** — a route handler that accepts a request body or params but has no Zod validation call before the service call. Rule: `backend.md §2`.
- **`new PrismaClient()`** — any direct instantiation in `apps/server` instead of using the `@kidlearn/db` singleton. Rule: `backend.md §3`.
- **Undocumented endpoint** — a route added or changed in `apps/server/src/routes/` with no matching entry in `apps/server/src/openapi/paths/`, or an entry that omits a status code the route's guards can produce (`requireParent` → 401, `requireConsent`/`requirePinVerified`/`requireActiveChild` → 403, `loadOwnedChild` → 404). Rule: `backend.md §7`. Note `openapi/coverage.test.ts` catches the missing-entry case, so flag it only if the diff also weakens or skips that test — but the *incomplete* entry is yours to catch, because no test can.
- **Response shape restated** — a response type declared in `apps/web` or hand-written as JSON Schema in `src/openapi/` when it should be Zod in `packages/types/src/api/`, or a response schema using `z.date()` where the wire format is an ISO string. Rule: `backend.md §7`.
- **Missing contract assertion** — a new successful response path with no `assertContract(Schema, res.body, …)` in its route test. Rule: `backend.md §7`.

### Agent B — Bugs

Read the diff carefully. Look for correctness bugs introduced by this branch:

- Off-by-one errors, incorrect conditional logic, missing null/undefined guards
- Async/await mistakes (missing `await`, unhandled promise rejections)
- Incorrect HTTP status codes returned (e.g. `200` for a newly created resource, `200` with an error body)
- Incorrect Prisma query shape (wrong `where`, missing `include`, wrong field names)
- React state bugs (stale closure, mutation of state directly, missing dependency array entries in hooks)
- Missing error boundaries or unhandled throws in route handlers

Avoid pre-existing issues. Avoid issues the TypeScript compiler or Biome would catch on its own.

### Agent C — Content-safety audit

This is a **hard rule** in kidlearn. A single missing filter exposes draft/review content to children.

Read every Prisma query in the diff. For each query against a content table (Lesson, Activity, Quiz, Story, StoryPage, or any table that carries a `status` field), check:

- Does the query include `where: { status: "published" }` or an equivalent condition?
- Is the route that calls this query student-facing (under `(student)/` route group, or an API route consumed by the student portal)?

Also check:
- Any new route under `(student)/` that does NOT have an auth check for a valid child session
- Any new `(parent)/` route that does not verify the PIN gate before exposing data
- Any `(admin)/` route that does not verify admin role

### Agent D — TypeScript & architecture conventions

Read `document/standards/general.md §2` (TypeScript) and `§3` (imports). Check the diff for:

- Prisma types redeclared in app code instead of imported from `@kidlearn/db`
- Types or interfaces that should be in `packages/types` (shared between frontend and backend) but are duplicated in both
- Missing explicit return types on exported functions
- `interface` used where `type` is semantically correct (unions, mapped types, aliases) and vice versa
- `null` used where `undefined` is correct (application-layer values)
- Relative imports that cross package boundaries (e.g. `../../packages/db/src/...`)
- `@/*` alias not used inside `apps/web` (raw `../` chains used instead)

### Agent E — Component & design system audit (run only if the diff touches `packages/ui/` or `apps/web/`)

Read `document/design.md §11` (the PR checklist) and `document/standards/frontend.md §1`. Check:

- `cva` used for all variant logic; no ad-hoc className concatenation
- `cn()` used to merge classes (not string template literals)
- Component props expose `variant`/`size`/`tone` — callers are not expected to pass long `className` strings to restyle
- Theme branching absent in JS (no `if theme === 'kid'` or similar)
- `kid/` and `parent/` components compose from `primitives/`, not duplicating markup
- Touch targets: kid surfaces ≥64px, parent surfaces ≥44px
- Motion: only `transform` and `opacity` animated; `useReducedMotion()` present if motion is used
- Font families come from tokens (`font-display`, `font-body`, `font-ui`) — no hardcoded font-family
- `next/image` used (no raw `<img>` tags); `next/font` used (no `<link>` font tags)

---

## Step 3 — Confidence scoring

For each issue returned by any agent in Step 2, launch a parallel scoring agent. The scoring agent receives: the issue description, the relevant diff lines, and the rule from the standards documents (`general.md` / `frontend.md` / `backend.md`) that was cited.

Score 0–100 using this rubric (give this rubric to the agent verbatim):

- **0** — False positive. The rule doesn't actually apply here, or this is a pre-existing issue not introduced by this branch.
- **25** — Possible issue, but could be a false positive. Agent could not fully verify.
- **50** — Real issue but minor — a nitpick that a senior engineer might let through on a low-risk branch.
- **75** — Real issue, verified. Will affect functionality or directly violates a named rule in the standards documents. The reviewer would block this.
- **100** — Certain. The issue is confirmed, will cause a bug or standards violation in production. No ambiguity.

**Content-safety issues (missing `status: "published"` filter, missing auth/PIN checks) are automatically scored 100 regardless of the agent's judgment.** These are never nitpicks.

---

## Step 4 — Filter and report

Discard any issue with a score below 80.

If no issues remain, output:

---

### kidlearn code review — `<branch>`

No issues found. Checked: engineering standards `[REVIEW]` rules, bugs, content-safety guards, TypeScript conventions, component architecture.

---

If issues remain, output the following format:

---

### kidlearn code review — `<branch>`

Found N issue(s):

**[CONTENT-SAFETY]** / **[STANDARDS]** / **[BUG]** / **[ARCHITECTURE]** (use the correct label)

1. **<one-line description>**

   Rule: `document/standards/<general|frontend|backend>.md §<section>` — *"<exact quote of the rule>"*

   File: `<path/to/file.ts>` (lines approx. <range>)

   ```
   <the offending code snippet — 3–6 lines of context>
   ```

   Fix: <one sentence describing what to change>

2. …

---

**Output rules:**
- Order issues: CONTENT-SAFETY first, then STANDARDS, then BUG, then ARCHITECTURE.
- Content-safety issues are always listed even if they are the only finding.
- Keep descriptions factual. No praise, no encouragement. Be direct.
- Do not list issues that Biome or TypeScript will catch automatically — those run in CI.
- Do not flag issues on lines that were not modified by this branch.
- Quote the rule from the relevant `document/standards/*.md` file verbatim for every standards violation.
