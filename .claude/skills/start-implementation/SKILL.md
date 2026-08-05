---
name: start-implementation
description: Start work on a kidlearn implementation file. Invoke as /start-implementation <filename-without-extension> (e.g. /start-implementation 01-workspace-packages-and-test-setup). Creates the feature branch from main, loads only the standards docs relevant to the layers the spec touches, implements it, then stops before committing so the engineer can review manually.
model: sonnet
---

# Start Implementation

The engineer has invoked `/start-implementation <args>`.

`<args>` is the implementation filename **without** the `.md` extension, e.g. `01-workspace-packages-and-test-setup`.

---

## Step 0 — Validate preconditions

Run the following checks in parallel. Stop with a clear error message if any fail.

```bash
# 1. Confirm the implementation file exists
ls document/implementation/<args>.md

# 2. Confirm we are on main
git branch --show-current

# 3. Confirm main is clean (no uncommitted changes)
git status --short
```

If the file does not exist, list `document/implementation/` and ask the engineer to confirm the correct filename.

If the current branch is not `main`, stop: tell the engineer to switch to `main` before starting.

If there are uncommitted changes, stop: ask the engineer to stash or commit them first.

---

## Step 1 — Create the feature branch and mark In Progress

```bash
git checkout -b <args>
```

Confirm the branch was created and is now active.

Then immediately update `document/implementation/00-progress-tracker.md`: find the row for `<args>.md` and change its **Status** cell from `⬜ Not started` to `🟨 In progress`. Leave the file modified but **do not stage or commit it** — it will be committed together with the implementation work.

---

## Step 2 — Read the implementation spec

Read the full contents of `document/implementation/<args>.md`.

Identify from the spec:
- **Goal** — what this file delivers
- **Dependencies** — which earlier implementation files must already be done
- **Layers touched** — `packages/db`, `packages/ui`, `apps/web`, `apps/server`, `packages/types`, etc.
- **Acceptance criteria** — the explicit checks or outputs the spec lists as "done"

If the spec lists dependencies on files that appear to not be implemented yet (check the codebase), warn the engineer before proceeding. Do not block unless the dependency is structural (e.g. a package that does not exist yet).

---

## Step 3 — Load only the relevant standards

**Always read** `document/standards/general.md`. It applies to every file in the repo — monorepo layout, TypeScript, imports, naming, testing, GitHub flow.

Then classify the spec using the **Layers touched** from Step 2 and read only the matching documents. If the engineer stated the task type explicitly in their message ("this is a frontend task", "backend only"), that overrides the inference.

| If the spec touches… | Also read |
|---|---|
| `packages/ui`, `apps/web`, React, Next.js, components, styling, layouts, i18n copy | `document/standards/frontend.md` **and** `document/design.md` **and** `apps/web/AGENTS.md` |
| `apps/server`, Express, API routes, services, middleware, auth | `document/standards/backend.md` |
| `packages/db`, Prisma schema, migrations | `document/standards/backend.md` **and** `document/database-design.md` |
| `packages/types`, shared Zod schemas, activity/quiz payload types | `document/standards/backend.md` (the payload-type and validation rules live there) — add `frontend.md` only if the spec also renders them |
| Repo root config, `turbo.json`, workspace wiring, test tooling only | nothing beyond `general.md` |

**Do not read the role document you do not need.** A pure schema spec (files 03–07) does not need `frontend.md` or `design.md`. A pure UI spec does not need `backend.md` or `database-design.md`. A full-stack spec reads both.

State which documents you loaded before starting work, in one line:

```
Standards loaded: general.md + backend.md + database-design.md (db schema task)
```

---

## Step 4 — Implement

Work through the spec goal by goal, following every rule in the standards documents you loaded.

**Always applies (`general.md`):**
- TypeScript `strict: true` — no `any`, no implicit returns, no `enum` (use `as const`).
- `as` casts only at verified external boundaries, each with an explanatory comment.
- No cross-package relative imports — import by package name. `packages/*` never imports from `apps/*`.
- No barrel files beyond a package's `src/index.ts`.
- Naming conventions: PascalCase component files, kebab-case everything else, boolean `is`/`has`/`can` prefixes.
- Tests co-located next to the file under test. Never mock `@kidlearn/db`. No snapshot tests.

**If you loaded `frontend.md`:**
- Correct `packages/ui` layer — `primitives/` / `kid/` / `parent/` / `hooks/` / `lib/` / `styles/`.
- Variants via `cva` + `cn()`. Semantic tokens only — no raw hex or Tailwind color literals.
- No theme branching in JS — `data-theme` at the layout boundary.
- `'use client'` as low in the tree as possible; no data fetching in Client Components.
- Every user-facing string through `i18next`. `next/image` for images, `next/font` for fonts.

**If you loaded `backend.md`:**
- Route handlers stay thin — business logic goes in a service function callable without HTTP.
- Zod validation at the route boundary on every route that accepts input.
- `@kidlearn/db` singleton only — never `new PrismaClient()`, never raw SQL.
- Every student-facing Prisma query filters `status: "published"`.
- Throw errors; a single error-handler middleware sends them. Semantic status codes.
- Required env vars validated at boot, failing fast.

Run `pnpm typecheck` and `pnpm lint` after implementing. Fix all errors before stopping.

---

## Step 5 — Update progress tracker to Done

Edit `document/implementation/00-progress-tracker.md`: find the row for `<args>.md` and change its **Status** cell from `🟨 In progress` to `✅ Done`.

Leave the file modified but **do not stage or commit it**.

---

## Step 6 — Stop before committing

**Do not run `git add` or `git commit`.** Leave all changes — implementation files and the updated `00-progress-tracker.md` — in the working tree for the engineer to review.

**Keep the closing report short.** Do not write a PR description here: no per-file change list, no acceptance-criteria tick list, no standards-compliance table. The pull request is where all of that belongs, written from the real diff at commit time — producing it here as well just means the engineer reads the same thing twice.

What the report must contain — nothing more:

```
## <args> — implementation complete

Branch: <args>
Standards loaded: <the one-line list from Step 3>

<2–5 sentences on what now works and any decision a reviewer could not infer
from the diff. Prose, not a file inventory.>

### Verification
<the checks you actually ran, with their real results>

### Needs you
<Anything blocked, unverified, or requiring a human: a migration you could not
execute, a flow needing real credentials, a manual smoke test, a standards
deviation to sign off on. Say "nothing" if there is genuinely nothing — do not
pad this section.>

Run `/pr` to commit, push, and open the pull request — or, if `/pr` is not
installed, commit and push by hand and run `/pr-description` for the body.
```

Two rules for that report:

- **Never claim a check passed unless you ran it and saw it pass.** Anything you could not verify belongs under **Needs you**, stated plainly.
- **Pre-commit checks the engineer should make themselves** go under **Needs you**, drawn from the review checklist of whichever role document you loaded (`frontend.md §5`, `backend.md §7`) — but only the items this branch actually touches. A backend-only branch has no touch targets to check; listing them anyway trains the engineer to skim.
