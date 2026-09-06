---
name: pr
description: Commit, push and open a GitHub pull request for the current kidlearn branch in one pass. Invoke as /pr. Targets dev, never main. Runs the same four gates CI runs and refuses to claim any it did not run. Use when a branch is finished and ready for review.
model: sonnet
---

# kidlearn Pull Request

One pass: check the gates, commit what is staged-worthy, push, open the PR against `dev`.

Replaces the old `pr-description` skill, which produced text and left the engineer to run
`git` and `gh` by hand.

---

## The base branch is `dev`

**Every pull request this skill opens targets `dev`.** `main` accepts pull requests only from
`dev`, enforced by a required check — see `project-requirement-details.md §9`. A feature branch
pointed at `main` will be rejected, and pointing one there by hand is how the deployment
pipeline gets bypassed.

`gh` defaults to the repository's default branch, which is `main`. **Always pass `--base dev`
explicitly.** Never rely on the default.

The only case for a different base is a `dev` → `main` release PR, which the user must ask for
in those words.

---

## Step 0 — Refuse to run in the wrong place

```bash
git branch --show-current
git status --short
git log dev..HEAD --oneline
```

Stop and tell the user, without doing anything else, if:

- the current branch is `dev` or `main` — commit to a feature branch first;
- there is nothing to commit **and** nothing ahead of `dev`;
- a pull request already exists for this branch (`gh pr view --json url,state`) — report its
  URL and state, then ask whether to push new commits onto it rather than opening a second.

---

## Step 1 — Run the gates

CI runs these, in this order, and a PR is not done until `gates` is green
(`CLAUDE.md` → CI). Run them here so the PR opens with the answer already known:

```bash
pnpm lint
pnpm build          # ^build must precede typecheck and test
pnpm typecheck
pnpm test
```

**Report exactly what happened.** If a gate fails, stop, show the real output, and ask whether
to fix it or open the PR anyway with the failure stated in the description. Do not open a PR
that silently claims green.

Known flake: `apps/server`'s Supertest suites time out intermittently under load, which is why
`gates` is not yet a required check (`CLAUDE.md` → CI). If a server suite times out, re-run that
package's suite alone once — `pnpm --filter server test` — before treating it as a real failure.
If it passes alone, say so in the PR rather than hiding it.

---

## Step 2 — Commit

Derive the convention from the repository, not from habit:

```bash
git log -15 --format='%s%n%n%b%n---'
```

This repo uses Conventional Commits with a scope — `docs(deployment):`, `feat(parent):`,
`fix(ci):` — and **British English** in the subject and body (`CLAUDE.md`, global instructions).

- Stage deliberately. Review `git status --short` and `git diff` before `git add`; never
  `git add -A` without looking at what it sweeps up.
- Never stage `.env`, `*.pem`, `*.key`, or anything the repo ignores.
- Subject line in the imperative, no trailing full stop, under ~72 characters.
- Body explains **why**, not what — the diff already says what.
- End every commit message with:

  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  ```

If the branch already has well-formed commits and the tree is clean, skip straight to Step 3.
Do not manufacture an empty commit.

---

## Step 3 — Push

```bash
git push -u origin <branch>
```

If the remote rejects the push as behind, **stop and report it**. Do not force-push, and do not
rebase or merge without the user saying so — the branch may be shared.

---

## Step 4 — Open the pull request

```bash
gh pr create --base dev --title "<title>" --body "$(cat <<'EOF'
<body>
EOF
)"
```

Title: the same shape as the commit subject — `feat(parent): add a top bar with sign-out`.

Body — fill every section, no placeholders left behind:

````markdown
## Summary

<!-- 2–4 bullets. The user-visible or system-level outcome, not a file list. A reviewer who has
     not read the spec should understand what shipped. -->

- …

## Implementation file

<!-- `document/implementation/<name>.md` when the branch name matches one. Omit the whole
     section for work that has no spec — an ad-hoc fix, a docs pass. Do not invent a path. -->

## Changes

<!-- One bullet per logical change, grouped by the packages actually touched:
     apps/web, apps/server, packages/ui, packages/db, packages/types, document/, .claude/ -->

**`<package>`**
- …

## Testing

<!-- What was actually run, and what it actually said. Numbers, not adjectives. -->

- `pnpm lint` — …
- `pnpm build` — …
- `pnpm typecheck` — …
- `pnpm test` — … (N passed / M failed)
- Manual: … <!-- or "not run in a browser", and why -->

## Standards

<!-- Only the lines that apply to what this branch touched. Delete the rest — a wall of N/A
     tells a reviewer nothing. -->

- Semantic tokens, no raw hex — ✅ / ❌
- Strings through i18next (en **and** bn) — ✅ / ❌
- `status: "published"` filter on student-facing reads — ✅ / ❌
- Zod validation + OpenAPI registration on new routes — ✅ / ❌
- Kid surface: ≥64px targets, no text below 20px — ✅ / ❌

## Notes for reviewer

<!-- Non-obvious decisions, deferred scope, known gaps, anything you could not verify.
     Delete the section if there is genuinely nothing. -->

🤖 Generated with [Claude Code](https://claude.com/claude-code)
````

---

## Step 5 — Report back

Give the user the PR URL, the base branch (`dev`), and a one-line gate summary.

Then run `gh pr checks` once. If CI has not started yet, say so rather than implying it passed.

---

## What this skill will not do

- **Target `main`.** See the top of this file.
- **Force-push, rebase, amend a pushed commit, or delete a branch** without being asked.
- **Claim a gate passed that it did not run**, or summarise a failure as a success. A partial
  result reported honestly is worth more than a green PR description that is wrong.
- **Merge the PR.** Opening it is where this ends.
