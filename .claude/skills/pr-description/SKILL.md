---
name: pr-description
description: Generate a pull request description for the current feature branch. Reads the implementation spec for the branch, diffs against main, and produces a structured PR description ready to paste into GitHub. Invoke as /pr-description with no args (detects branch from git).
model: sonnet
---

# PR Description

Generate a pull request description for the current feature branch.

---

## Step 0 — Gather context

Run in parallel:

```bash
# Current branch name
git branch --show-current

# All commits on this branch vs main
git log main..HEAD --oneline

# Files changed
git diff main...HEAD --name-only

# Full diff
git diff main...HEAD
```

The current branch name is the implementation filename without `.md`. Derive it:

```bash
# Confirm the spec file exists
ls document/implementation/<branch-name>.md
```

Read:
1. `document/implementation/<branch-name>.md` — the spec for this work
2. The full diff — what actually changed

If the spec file does not exist, generate the PR description from the diff alone (note the missing spec).

If the branch is `main` or there are no commits ahead of `main`, stop and tell the engineer there is nothing to describe.

---

## Step 2 — Produce the PR description

Output the following markdown block **verbatim** (the engineer will paste it into GitHub). Fill in every section — do not leave placeholders.

````markdown
## Summary

<!-- 2–4 bullet points. What does this branch deliver? Focus on the user-visible or system-level outcome, not the implementation details. -->

- …

## Implementation file

`document/implementation/<branch-name>.md`

## Changes

<!-- One bullet per logical change. Group by package/app. -->

**`<package or app>`**
- …

## Acceptance criteria

<!-- Tick each item from the spec. Use ✅ / ❌. If the spec has no explicit criteria, derive them from the goal. -->

- ✅ …
- ❌ … _(reason if not done)_

## Testing

<!-- How was this tested? List the commands run and their outcomes. -->

- `pnpm typecheck` — …
- `pnpm lint` — …
- Manual smoke test: …

## Engineering standards compliance

<!-- A one-line confirmation or any known exceptions. -->

- Semantic tokens: ✅ / ❌
- i18next strings: ✅ / ❌ / N/A
- content-safety `status: "published"` filter: ✅ / ❌ / N/A
- Zod validation on new routes: ✅ / ❌ / N/A
- `'use client'` boundary as low as possible: ✅ / ❌ / N/A

## Notes for reviewer

<!-- Anything non-obvious: edge cases kept out of scope, tradeoffs made, follow-up items. Delete if empty. -->
````

**Rules for filling in the template:**

- `Summary` — outcome-focused, not "I changed X file". A reviewer unfamiliar with the spec should understand what shipped.
- `Changes` — group by `apps/web`, `apps/server`, `packages/ui`, `packages/db`, `packages/types`, `document/`. Only include groups that were actually touched.
- `Acceptance criteria` — derive from the spec's explicit criteria or its stated goal. Every item is either ✅ or ❌ with a reason.
- `Testing` — paste the actual `pnpm typecheck` and `pnpm lint` output status (PASSED / FAILED + error count). Describe the manual smoke test steps taken.
- `Engineering standards compliance` — mark N/A if the branch does not touch that concern (e.g. no UI = no semantic tokens to check).
- `Notes for reviewer` — only include known gaps, deferred scope, or non-obvious decisions. Omit the section entirely if there is nothing to say.
