---
name: start-implementation
description: Start work on a kidlearn implementation file. Invoke as /start-implementation <filename-without-extension> (e.g. /start-implementation 01-workspace-packages-and-test-setup). Creates the feature branch from main, reads the spec, implements it, then stops before committing so the engineer can review manually.
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

Also read:
- `document/engineering-standards.md` — standards that apply to every file
- `document/design.md` — only if the spec touches UI or components

Identify from the spec:
- **Goal** — what this file delivers
- **Dependencies** — which earlier implementation files must already be done
- **Layers touched** — `packages/db`, `packages/ui`, `apps/web`, `apps/server`, `packages/types`, etc.
- **Acceptance criteria** — the explicit checks or outputs the spec lists as "done"

If the spec lists dependencies on files that appear to not be implemented yet (check the codebase), warn the engineer before proceeding. Do not block unless the dependency is structural (e.g. a package that does not exist yet).

---

## Step 3 — Implement

Work through the spec goal by goal. Follow all rules in `document/engineering-standards.md`. Key reminders:

- TypeScript `strict: true` — no `any`, no implicit returns.
- Semantic tokens only in components — no raw hex, no Tailwind color literals.
- `'use client'` as low in the tree as possible.
- Every Express route that accepts input gets Zod validation before the service call.
- Every student-facing Prisma query filters `status: "published"`.
- No hard-coded user-facing strings — route through `i18next`.
- Use `@kidlearn/db` singleton — never `new PrismaClient()`.
- No cross-package relative imports.

Run `pnpm typecheck` and `pnpm lint` after implementing. Fix all errors before stopping.

---

## Step 4 — Update progress tracker to Done

Edit `document/implementation/00-progress-tracker.md`: find the row for `<args>.md` and change its **Status** cell from `🟨 In progress` to `✅ Done`.

Leave the file modified but **do not stage or commit it**.

---

## Step 5 — Stop before committing

**Do not run `git add` or `git commit`.** Leave all changes — implementation files and the updated `00-progress-tracker.md` — in the working tree for the engineer to review.

Output a concise summary:

```
## Implementation complete — <args>

Branch: <args> (created from main)

### What was done
<bullet list of changes — one line per file or logical change>

### Typecheck & lint
<output of pnpm typecheck and pnpm lint — PASSED or list of remaining issues>

### Acceptance criteria
<tick each item from the spec's acceptance criteria — ✓ done / ✗ not done + reason>

### Review checklist for the engineer
- [ ] Run `pnpm dev` and smoke-test the new surface
- [ ] Check content-safety filters (status: "published") on any new Prisma queries
- [ ] Verify i18n strings are routed through i18next
- [ ] Confirm touch targets (≥64px kid / ≥44px parent) if UI was touched
- [ ] Verify 00-progress-tracker.md shows ✅ Done for this file
- [ ] Commit everything (including 00-progress-tracker.md) and push, then run /pr-description
```
