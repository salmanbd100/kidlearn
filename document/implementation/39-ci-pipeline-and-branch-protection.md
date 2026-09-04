# 39 — CI Pipeline and Branch Protection

> **Estimated effort:** 2–3 hours
> **Depends on:** nothing. Every gate this file wires up already exists — this file adds no new
> checks, it only makes the existing ones non-optional. It does *not* find them all green: running
> the suite repeatedly turned up a pre-existing non-determinism the standards' own working
> agreement could never have caught, because that agreement runs each gate once. See
> "The suite is not deterministic under load" below; it changes what this file can honestly claim
> to deliver.
> **Requirement IDs:** none directly — this is a process/infrastructure decision, on the same
> footing as files 37a and 38a. It makes `general.md §6`'s `[CI]` enforcement tier real, which
> every `[CI]`-tagged rule in the standards depends on.
> **Source:** `document/improvement-plan.md` P0-1, plus the harness updates in its §5.1–§5.5 that
> are gated on this file landing.
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

`document/standards/general.md §6` defines four enforcement tiers, and one of them is a lie.
**[BIOME]** is real (`pnpm lint` runs Biome). **[TS]** is real (`pnpm typecheck` runs `tsc`).
**[REVIEW]** is honest about being a human's job. **[CI]** — "the pipeline blocks the merge" — has
no pipeline behind it: there is no `.github/` directory in this repository. `backend.md §7` says
the OpenAPI registration rule "is enforced, not requested"; today it is enforced only by the
engineer remembering to run `pnpm --filter server test` before pushing.

That has worked for 118 commits and one contributor. It works because the same person writes the
code, reads the standards, and runs the four commands. It does not survive a tired Friday, and it
will not survive `apps/mobile` (see `document/mobile-app-plan.md`) roughly doubling the number of
workspaces that have to stay green.

This file wires the four gates that already pass into a GitHub Actions workflow, makes that
workflow a required status check on `main`, adds coverage *reporting* (not a coverage threshold),
and then goes back through the standards and the harness to delete every "once Vitest is
configured" hedge that this file makes false.

**Nothing about what is checked changes.** The commands are the same four the working agreement in
`00-progress-tracker.md` already names. The only change is who runs them.

## Context & Current State

Everything in this section was measured on this branch's base commit, not estimated.

### The gates, and what they cost

| Gate | Command | Turbo tasks | Cold wall time | Result |
| --- | --- | --- | --- | --- |
| Lint | `pnpm lint` | — (Biome runs repo-wide, not through Turbo) | 0.3s / 591 files | clean |
| Build | `pnpm build` | 4 (`@kidlearn/db`, `@kidlearn/types`, `server`, `web`) | 10.3s | clean |
| Types | `pnpm typecheck` | 7 (5 `typecheck` + the 2 `^build` deps it pulls in) | 5.6s | clean |
| Tests | `pnpm test` | 7 (5 `test` + the same 2 builds) | 20.6s | 162 files, **2,577 tests** — green on any given run, but see below |

Per-package test counts: `server` 1,354 · `web` 991 · `@kidlearn/types` 163 · `@kidlearn/db` 51 ·
`@kidlearn/ui` 18. (`improvement-plan.md` §1 says 2,526 — it omitted `@kidlearn/db`'s 51 schema
assertions. 2,577 is the real figure.)

Cold, uncached, sequential, that is **under 40 seconds of actual work**. A CI run will be dominated
by `pnpm install` and the Node/pnpm setup, not by the checks. There is no performance argument for
splitting this into parallel jobs, and a single job keeps the required-status-check configuration
to one context name.

`packages/config` declares no scripts at all, so it appears in none of these task counts — that is
correct, it ships three tsconfig files and nothing to check.

### What CI does *not* need — verified, not assumed

- **No database.** Not one of the 162 test files opens a connection. `apps/server`'s 30
  Prisma-stubbing suites are the documented exception in `general.md §5`; `@kidlearn/db`'s suite
  reads `schema.prisma` as text. Standing up a Postgres service container in this workflow would
  be pure cost. **File 42 is where that changes** — it adds the real harness, and it will add the
  service container to this workflow as part of its own scope.
- **No environment variables.** Three separate things could have needed them, and none does:
  - `apps/server/vitest.setup.ts` assigns every variable `lib/env.ts` requires with `??=`, so the
    suite is self-sufficient by design.
  - `prisma generate` (inside `@kidlearn/db`'s `build`) was run against a copy of `schema.prisma`
    with `DATABASE_URL` and `DIRECT_URL` unset: it succeeded. Prisma resolves datasource
    environment variables when the client is *instantiated*, not when it is generated.
  - `next build` reads only `MEDIA_ASSET_HOSTS` (`next.config.ts` returns `[]` when unset) and
    `NEXT_PUBLIC_API_URL` (`lib/api-client.ts` falls back to `DEFAULT_API_URL`).

  So the workflow declares **no secrets and no `env:` block**. If a future file makes a gate
  env-dependent, that file adds the variable — do not pre-emptively seed dummies here, because a
  dummy that is never needed is indistinguishable from one that is load-bearing.

### The repository, as it actually is

Two things here contradict what the harness currently claims, and both matter to this file:

- **`salmanbd100/kidlearn` is a public repository.** `.claude/settings.json`'s
  `autoMode.environment` says "private GitHub repo" — that is false (`gh repo view` reports
  `PUBLIC`). It matters three times: GitHub Actions minutes are unmetered on public repositories,
  so this pipeline is genuinely free and needs no budget note in file 38; the free
  `ubuntu-24.04-arm` runners file 38a builds its Graviton images on are public-repo-only; and the
  classic branch-protection API is available, which it would not be on a private repo on GitHub
  Free.
  Correct the line while updating that file per requirement 8.
- **A ruleset already protects `main` — partially.** Repository ruleset **17802318**, "Protect Main
  Branch", is `active` on `~DEFAULT_BRANCH` with two rules: `deletion` and `non_fast_forward`. It
  has **no** `required_status_checks` rule and **no** `pull_request` rule, and it carries one
  bypass actor (`RepositoryRole` 5 — repository admin — `bypass_mode: always`).

  So "add branch protection" is not a from-scratch job: it is **adding one rule to an existing
  ruleset**, and requirement 6 says exactly which. The bypass actor is discussed there too,
  because it changes what the gate actually is.

### Coverage

No `vitest.config` in the repo configures `coverage`, and `@vitest/coverage-v8` is **not
installed** — it appears in `pnpm-lock.yaml` only as an optional peer of `vitest` itself. So
coverage reporting is genuinely new work here, not a flag flip.

`improvement-plan.md` §6 is explicit that this file must **not** set a coverage threshold: "A
percentage target in a repo with this many hand-written behavioural tests optimises for the wrong
thing." The purpose is visibility — a PR that deletes `content.test.ts`'s status-filter assertions
should show up as a number moving, in the PR's own checks, without anyone downloading anything.

### One gotcha worth writing down

`pnpm test --force` **fails**: pnpm treats `test` as a built-in command and parses `--force`
itself (`ERROR Unknown option: 'force'`). `pnpm build --force` works because `build` is not a
built-in. Bare `pnpm test` is fine — it runs the root script, which is `turbo run test`. To pass
Turbo flags through, use `pnpm turbo run test --force`. This bites anyone trying to reproduce a CI
run locally with a cold cache.

### The suite is not deterministic under load

This is the finding that matters most in this file, and it was not in the improvement plan —
`improvement-plan.md` §1 records "2,526 passing, 0 failing", which is what one run says. The suite
was run **27 times** end to end while building this pipeline. It is green most of the time and
red often enough that a required status check built on it would be untrustworthy on day one.

Measured on a 12-core machine, `--force` every run:

| Configuration | Failed runs | Where | Wall time (median) |
| --- | --- | --- | --- |
| Coverage, Turbo default concurrency | **3 / 8** | `apps/server`, three *different* files | ~24s |
| Coverage, `TURBO_CONCURRENCY=1` | **2 / 8** | `apps/web`, the *same* test both times | ~29s |
| Plain `test`, default concurrency | 2 / 10 | `apps/server` | ~21s |
| Plain `test`, `TURBO_CONCURRENCY=1` | **3 / 6** | `apps/server`, three more files | ~30s |

That last row was measured **after** the first three, and it is the one that matters most: read
the first three alone and serialisation looks like a cure. It is not. See the correction below.

Every failure was in a different place, and they fall into exactly two families.

**Family 1 — `apps/server` Supertest transport failures under load.** **Eleven** distinct files
have failed this way across roughly 40 runs — `admin/ai.test.ts`, `progress.test.ts`,
`events.test.ts`, `admin/content-editors.test.ts`, `admin/ai-review.test.ts`, `parent.test.ts`,
`children.test.ts`, `stories.test.ts`, `dashboard.test.ts`, `middleware/validate.test.ts`,
`middleware/require-parent.test.ts` — with four signatures:

- `Error: socket hang up`
- `Error: Parse Error: Expected HTTP/, RTSP/ or ICE/`
- `Error: Test timed out in 5000ms`
- an assertion on a body that never arrived (`expected 404 to be 400`;
  `TypeError: Cannot read properties of undefined (reading 'stories')`)

None of those is a logic failure. The second is a client reading a corrupted response off the
socket. The cause is structural: `request(app)` binds a fresh ephemeral listener per call, so a
suite of this size churns ports faster than the OS retires them. Every one of the failing files
passes 8/8 in isolation.

**Correction — `TURBO_CONCURRENCY=1` is not a fix, and an earlier draft of this file said it was.**
On the strength of 8 clean serialised coverage runs this file originally claimed the family was
"eliminated entirely". Re-measured on the `14-parent-onboarding-profile-ui-fix` branch, serialised,
it failed **3 runs in 6** with the same signatures. That 0/8 was a small sample, not a cure, and
the four rows above do not support a claim that serialisation helps at all — the two serialised
configurations bracket the two unserialised ones.

The step keeps `TURBO_CONCURRENCY: 1` anyway, on a narrower argument that does not depend on those
numbers: a GitHub runner has 4 cores, five concurrent Vitest instances each forking a
core-count-sized pool oversubscribe it badly, and serialising costs ~5s. That is a reasonable
default for a small runner. It is **not** a mitigation for this flake, and the workflow comment
must not imply otherwise.

The real fix is one Supertest listener per file instead of one per request — 64 files of churn,
and files 42–43 rewrite much of that suite against a real database anyway. It belongs there.
Until then the pipeline is genuinely unreliable on `apps/server`, which is the whole reason
requirement 6 defers the ruleset change.

**Family 2 — a real bug in `apps/web`, found by the repetition.**
`app/(parent)/context/parent-session.test.tsx > keeps 'guard' stable when the gate unlocks again`
fails ~25% of the time under load and 0/8 in isolation. The flake is a symptom; the bug is in
`parent-session.tsx`'s grant-expiry effect:

```ts
const msRemaining = new Date(grantExpiresAt).getTime() - Date.now();
if (msRemaining <= 0) { /* relock */ }
const timer = setTimeout(() => { setIsLocked(true); ... }, msRemaining);
```

`setTimeout` silently clamps any delay above `2**31 - 1` ms (~24.8 days) **to 1 ms** —
`TimeoutOverflowWarning`, verified directly in Node 22. The test's fixture unlocks until
`2099-01-01`, i.e. ~2.28e12 ms out, so the timer that is supposed to relock the gate in the far
future instead fires a millisecond later and relocks it immediately. Whether that lands before or
after the assertion is a race, which is exactly the shape of the flake.

In production a grant is 15 minutes, so this never fires today — but the code is wrong, the guard
against a lapsed grant is the security-relevant half of the PIN gate, and a `pinVerifiedUntil`
further out than 24.8 days would currently lock a parent out instantly rather than never. The fix
is a one-line clamp.

**It is not fixed here.** `general.md §7` is explicit: "If work on file `07` reveals a bug in file
`05`'s output, fix it in a separate branch named `05-<filename>-fix` and open a separate PR."
`git log --diff-filter=A` puts `parent-session.tsx` in **file 14**, so the fix went to
`14-parent-onboarding-profile-ui-fix` — a `setTimeout` armed in ceiling-sized chunks that re-reads
the clock, plus an explicit fail-closed branch for an unparseable expiry, with the `apps/web`
suite then clean across 8 consecutive runs. That closes family 2. Family 1 remains open, so
requirement 6's ordering now waits on the Supertest work rather than on file 14.

## Detailed Requirements

1. **One workflow, one job: `.github/workflows/ci.yml`.**

   - **Name:** `CI`. **Job id and name:** `gates` — this string becomes the required status check
     context in requirement 6, so it is a decision, not a label. Keep it stable.
   - **Triggers:** `push` on `main` and `pull_request` targeting `main`. Nothing else. Feature
     branches are checked through their PR; a push trigger on every branch would double every run
     for no added signal.
   - **Concurrency:** group on workflow + ref, `cancel-in-progress` **only for pull requests**.
     A superseded PR run is noise; a superseded push to `main` is a commit that then has no
     verdict at all, which is worse than a wasted minute.
   - **Permissions:** `contents: read` at the workflow level. This job reads code and writes
     nothing back.
   - **`timeout-minutes: 20`.** The measured work is under a minute; 20 minutes is a hang detector,
     not a budget.
   - **Steps, in this order:**
     1. `actions/checkout`
     2. `pnpm/action-setup` with **no `version` input** — it reads `packageManager: pnpm@9.15.0`
        from the root `package.json`, so the pinned pnpm version has exactly one home. This must
        come *before* `setup-node`, or `setup-node`'s pnpm cache cannot resolve `pnpm store path`.
     3. `actions/setup-node` with `node-version: 22` and `cache: pnpm`
     4. `actions/cache` for the Turbo cache — see requirement 3
     5. `pnpm install --frozen-lockfile`
     6. `pnpm lint`
     7. `pnpm build`
     8. `pnpm typecheck`
     9. `pnpm test:coverage` — see requirement 4
     10. upload the coverage artifact, `if: always()` — see requirement 5

   Keep the gates as four separate `run` steps rather than one chained command: a failed step names
   itself in the GitHub UI, which is the difference between "CI is red" and "types are broken".

   The order is not arbitrary. `lint` is 0.3s and fails on the largest class of trivial mistakes,
   so it goes first. `build` precedes `typecheck` and `test` because both declare
   `dependsOn: ["^build"]` in `turbo.json` — running it explicitly satisfies the standards' own
   `[CI]` list ("`pnpm build` succeeds across all packages") and means the later steps hit a warm
   Turbo cache for their dependencies rather than rebuilding them.

2. **Pin Node to 22 inline, and say why it is inline.** Local development runs Node 22.22.0; the
   repository declares no `engines` field and has no `.nvmrc`. Both belong to **file 46**
   (`improvement-plan.md` P2-3), which will replace this workflow's `node-version: 22` with
   `node-version-file: .nvmrc`. Add a comment on the line saying so, so the pin does not quietly
   become a second, drifting source of truth in the meantime.

3. **Cache the Turbo cache.** `actions/cache` on `.turbo/cache` (Turbo 2's local cache directory —
   already gitignored), `key: turbo-${{ runner.os }}-${{ github.sha }}` with
   `restore-keys: turbo-${{ runner.os }}-`. The commit-specific key never hits on the run that
   writes it and always saves; the prefix restore-key means each run starts from the most recent
   cache the runner saw.

   **Do not configure Vercel Remote Caching.** It needs `TURBO_TOKEN` and `TURBO_TEAM` secrets and
   an account relationship, for a build whose cold path is 10 seconds. `actions/cache` is the right
   size of solution here.

4. **Coverage reporting, with no threshold.**

   - Add `@vitest/coverage-v8` as a devDependency to the five packages that run Vitest:
     `apps/web`, `apps/server`, `packages/db`, `packages/types`, `packages/ui`. pnpm's isolated
     `node_modules` means the provider has to be resolvable from the package Vitest runs in — a
     single root devDependency will not work.
   - Add a `coverage` block to each of the five `vitest.config` files:
     `provider: "v8"`, `reporter: ["text-summary", "json-summary", "html"]`,
     `reportsDirectory: "coverage"`, and an `exclude` covering the package's own test files,
     `vitest.config.*`, `vitest.setup.ts`, and generated output. Leave `include`/`all` at their
     defaults — instrumenting only what the tests actually load is what makes a deleted test show
     up as a number moving.
   - Add `"test:coverage": "vitest run --coverage"` to each of the five package manifests, a
     `test:coverage` task to `turbo.json` (`dependsOn: ["^build"]`, `outputs: ["coverage/**"]`),
     and `"test:coverage": "turbo run test:coverage"` to the root manifest.
   - **Set no `thresholds` key anywhere.** If a future reader adds one, `improvement-plan.md` §6 is
     the argument against it.

   CI runs `pnpm test:coverage` **instead of** `pnpm test`, not in addition — running 2,577 tests
   twice to produce one number is not a trade worth making. Measured, the coverage run costs
   nothing meaningful: ~24s median against plain `test`'s ~21s. `@vitest/coverage-v8` reads V8's
   native coverage rather than transforming source, so it changes timing, not semantics.

   **Run the test step with `TURBO_CONCURRENCY: 1`**, set as an `env:` on that step only — `build`
   and `typecheck` keep their parallelism, which is free. The argument is runner size, **not** the
   flake: five concurrent Vitest instances each forking a core-count-sized pool oversubscribe a
   4-core runner badly, and serialising costs about five seconds. Do **not** describe it as a fix
   for flake family 1 — the measurements in Context do not support that, and an earlier draft of
   this file wrongly claimed they did. `TURBO_CONCURRENCY` is preferred over `--concurrency=1` on
   the command line so the CI step stays the same command a developer runs locally, tuned by
   environment rather than forked into a CI-only invocation. Comment the step with the real
   reasoning and point at this file — a bare `TURBO_CONCURRENCY: 1` reads as cargo cult and will be
   deleted by the next person optimising the pipeline.

5. **Upload coverage as an artifact, and surface a summary in the run.** `actions/upload-artifact`
   with `if: always()` (a failed test run's partial coverage is still the more interesting one),
   paths `apps/*/coverage` and `packages/*/coverage`, `retention-days: 14`.

   The `text-summary` reporter already prints per-package numbers into the step log. Add
   `.github/scripts/coverage-summary.mjs`, run in its own step before the upload, which reads each
   package's `coverage/coverage-summary.json` and appends one markdown table (package · statements
   · branches · functions · lines) to `$GITHUB_STEP_SUMMARY`. A number in the run summary is seen;
   a number inside a downloadable zip is not. The script must not fail the job when a
   `coverage-summary.json` is missing — it is a reporter, not a gate.

6. **Make `gates` a required status check on `main`, by amending ruleset 17802318.** Do not create
   a second ruleset and do not use the classic `branches/main/protection` API — that would leave
   two overlapping mechanisms on one branch, which is how a protection rule gets misread later.

   > **Forward note (file 38a).** File 38a makes `dev` a deployable branch, so the ruleset's target
   > has to widen from `~DEFAULT_BRANCH` to **both `main` and `dev`**, and `main` gains a second
   > required context, `promotion-guard`, which fails any pull request into `main` that did not come
   > from `dev`. That amendment belongs to file 38a — do not pre-empt it here — but write the
   > ruleset payload in a way that is easy to extend rather than one that assumes a single branch.

   Add to the existing ruleset's `rules` array, keeping `deletion` and `non_fast_forward`:

   - a `pull_request` rule (`required_approving_review_count: 0` — a solo maintainer approving
     their own PR is theatre; the point of the rule is that changes arrive as PRs, which is what
     makes a status check a *gate* rather than a post-hoc report), and
   - a `required_status_checks` rule listing one context, `gates`, with
     `strict_required_status_checks_policy: false`. Strict mode forces every PR to be rebased onto
     the tip of `main` before merging; on a single-contributor repo that buys nothing and costs a
     re-run per merge.

   **Be honest about what this achieves.** The ruleset's existing bypass actor is the repository
   admin role with `bypass_mode: always` — which is the account doing all the work. Leave it: a solo
   maintainer locking themselves out of their own `main` at 2am is a worse failure than an
   un-gated merge. But that means this is a **speed bump, not a wall** — it makes bypassing the
   gates a deliberate, visible act instead of the default one. Say so in the standards edit
   (requirement 7), rather than letting `general.md` imply a wall that does not exist.

   This is the one step in this file that changes settings outside the repository. Write the exact
   `gh api` call into the step-by-step plan, run it, and then **read the ruleset back** and confirm
   the three rules are present — a `PUT` that silently drops `deletion` and `non_fast_forward`
   because they were omitted from the payload is the specific failure mode to check for.

   **Ordering, and this is the one real judgement call in the file:** do not make `gates` required
   until flake family 2 is fixed on its own branch (`14-parent-onboarding-profile-ui-fix`, per the
   Context section). A required check that fails a quarter of the time does not gate anything — it
   teaches the one person with the bypass to use the bypass, and a gate everybody routes around is
   worth less than no gate, because it also costs the credibility of `general.md §6`'s whole
   enforcement table. Land the workflow first and let it run; add the ruleset rule once a green run
   is the normal outcome rather than the likely one. The pipeline is useful from the moment it
   exists; the ruleset only has to be later, not much later.

7. **Retire the four `[CI]` hedges in the standards.** Each of these is a promise this file keeps:

   | File | Current text | Change |
   | --- | --- | --- |
   | `general.md §5` "CI gate" | "**Once Vitest is configured**, `pnpm test` joins `pnpm typecheck` and `pnpm lint` as a required CI check." | State it in the present tense, and name the workflow file. |
   | `general.md §6` "Automatic — CI `[CI]`" | "Blocks merge (**once Vitest is configured**):" | "Blocks merge — `.github/workflows/ci.yml`, job `gates`, required on `main`:" |
   | `backend.md §4` (content-status guard) | `**[REVIEW] [CI once tests are configured]**` | `**[REVIEW] [CI]**` |
   | `backend.md §7` (OpenAPI registration) | `**[CI once tests are configured]**` | `**[CI]**` |

   Also add to `general.md §6`'s CI subsection the two facts a reader needs in order to trust the
   tier: the pipeline runs on pull requests and on pushes to `main`, and repository admins can
   bypass it (requirement 6) — so `[CI]` means "blocks merge unless someone deliberately overrides
   it", which is still categorically stronger than `[REVIEW]`.

   And extend `general.md §7` (GitHub Flow): under **Branch lifecycle**, a PR is not "ready for
   review" until `gates` is green, and under **Opening a pull request**, `gh pr checks` is how you
   find out. Leave the rest of §7 alone — the branch-per-file rule and the mandatory tracker
   update are unaffected by this file.

   **Do not touch** the recorded exception in `general.md §5` about mocking `@kidlearn/db`. Its
   exit condition is the test-database harness, which is files 42–43. Deleting it here would be
   claiming credit for work this file does not do.

8. **Update the harness for the pipeline's existence** — the four items `improvement-plan.md`
   §5.1–§5.5 explicitly gate on file 39, and no more than those:

   - **`CLAUDE.md`** — add a short **CI** section after Commands: what runs, on what triggers, that
     `gates` is required on `main`, and that a PR is not done until it is green. Leave
     `CLAUDE.md`'s other stale claims (the `packages/types` and `packages/config` placeholder
     entries, the `Parent ↔ Child[]` schema line, the `document/` file list) to **file 40** — that
     is its entire job, and splitting it across two branches means neither diff tells the whole
     story.

     **One deliberate exception:** the "**No test runner** is configured yet" line is replaced
     here, not in file 40. It sits four lines above the new CI section, which says `pnpm test` runs
     2,577 tests — leaving a file that contradicts itself on one screen is worse than a one-line
     overlap with the next branch. Note the overlap in file 40's spec so its author is not
     surprised to find the line already gone.
   - **`README.md`** — a CI badge under the title
     (`![CI](https://github.com/salmanbd100/kidlearn/actions/workflows/ci.yml/badge.svg)`), and a
     one-line description of the pipeline in the "Other commands" area next to `pnpm test`. The
     README is otherwise accurate; do not rewrite it.
   - **`.claude/skills/start-implementation/SKILL.md`** — add to Step 0's preconditions: confirm
     the latest CI run on `main` is green (`gh run list --branch main --limit 1`) before branching,
     so a red `main` is discovered before the work rather than after it.
   - **`.claude/settings.json`** — add one `autoMode.environment` line stating that CI runs on
     pushes to `main` and on PRs and that a PR is not done until `gates` is green; **correct the
     existing "private GitHub repo" claim to public** (see Context); and add
     `Bash(gh workflow view:*)`, `Bash(gh workflow list)` and `Bash(gh api repos/:*)` to
     `permissions.allow` — reading CI state is now a routine part of the loop. Do not add a write
     permission for `gh api`; changing repository settings should keep prompting.

9. **Delete the stray root `package-lock.json`.** An 8.6KB npm lockfile sits at the repository root
   in a pnpm repo. It is not gitignored, it is not referenced by anything, and its only function is
   to make `npm ci` look like a supported way to install this monorepo — which, in a file whose
   whole subject is "the machine enforces the toolchain", is exactly the wrong artefact to leave
   lying around. `improvement-plan.md` §P3 does not list it; add it to this file's scope because it
   is one line and it is a lockfile in a file about lockfile-frozen installs.

## Technical Approach & Suggestions

Files to create:

```
.github/workflows/ci.yml                     # the pipeline (requirements 1–5)
.github/scripts/coverage-summary.mjs         # $GITHUB_STEP_SUMMARY table (requirement 5)
```

Files to delete:

```
package-lock.json                            # requirement 9
```

Files to edit:

```
package.json                                 # root: test:coverage script
turbo.json                                   # test:coverage task
apps/web/package.json                        # @vitest/coverage-v8 + test:coverage
apps/web/vitest.config.mts                   # coverage block
apps/server/package.json                     # @vitest/coverage-v8 + test:coverage
apps/server/vitest.config.ts                 # coverage block
packages/db/package.json                     # @vitest/coverage-v8 + test:coverage
packages/db/vitest.config.ts                 # coverage block
packages/types/package.json                  # @vitest/coverage-v8 + test:coverage
packages/types/vitest.config.ts              # coverage block
packages/ui/package.json                     # @vitest/coverage-v8 + test:coverage
packages/ui/vitest.config.ts                 # coverage block
document/standards/general.md                # §5 CI gate, §6 CI tier, §7 GitHub Flow
document/standards/backend.md                # §4 and §7 [CI] tags
CLAUDE.md                                    # CI section only
README.md                                    # badge + one line
.claude/skills/start-implementation/SKILL.md  # Step 0 precondition
.claude/settings.json                        # autoMode line, public-repo fix, gh read permissions
document/implementation/00-progress-tracker.md # row + Shared Technical Decisions
```

Repository settings changed (outside the tree, requirement 6):

```
ruleset 17802318 "Protect Main Branch" — add pull_request + required_status_checks(gates)
```

### Sketch of the workflow

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  # A superseded PR run is noise. A superseded push to main leaves a commit with
  # no verdict, which is worse than a wasted minute.
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

permissions:
  contents: read

jobs:
  gates:
    name: gates # required status check context — see ruleset 17802318
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v5
      # Before setup-node: its pnpm cache needs `pnpm store path` to resolve.
      # No `version` input — pnpm/action-setup reads `packageManager` from package.json.
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v5
        with:
          node-version: 22 # file 46 replaces this with node-version-file: .nvmrc
          cache: pnpm
      - uses: actions/cache@v4
        with:
          path: .turbo/cache
          key: turbo-${{ runner.os }}-${{ github.sha }}
          restore-keys: turbo-${{ runner.os }}-
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      # Explicit, though `^build` would pull it in: the standards' [CI] list names it.
      - run: pnpm build
      - run: pnpm typecheck
      - run: pnpm test:coverage
      - if: always()
        run: node .github/scripts/coverage-summary.mjs
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: |
            apps/*/coverage
            packages/*/coverage
          retention-days: 14
```

Action major versions above are the current ones; the first CI run is the verification. If a
version does not resolve, GitHub fails the run with an unambiguous message — pin down from there
rather than guessing pre-emptively.

### The ruleset amendment

`PUT /repos/salmanbd100/kidlearn/rulesets/17802318` replaces the whole ruleset, so the payload must
restate `name`, `target`, `enforcement`, `conditions`, `bypass_actors`, **and the two rules that are
already there**. Read the current ruleset first, add to it, and read it back afterwards:

```bash
gh api repos/salmanbd100/kidlearn/rulesets/17802318 > /tmp/ruleset-before.json
# ...construct the updated payload from that file, then:
gh api -X PUT repos/salmanbd100/kidlearn/rulesets/17802318 --input /tmp/ruleset-after.json
gh api repos/salmanbd100/kidlearn/rulesets/17802318 --jq '[.rules[].type]'
# expect: ["deletion","non_fast_forward","pull_request","required_status_checks"]
```

The `required_status_checks` rule's parameters:

```json
{
  "type": "required_status_checks",
  "parameters": {
    "strict_required_status_checks_policy": false,
    "required_status_checks": [{ "context": "gates" }]
  }
}
```

A required context that no workflow ever reports leaves every PR permanently pending, so **the
workflow must have run at least once on a PR before this rule goes in** — the context has to exist
for GitHub to match it. Step 6 of the plan orders it that way deliberately.

## Step-by-Step Plan

1. **Branch and tracker.** `git checkout -b 39-ci-pipeline-and-branch-protection`; add the file 39
   row to `00-progress-tracker.md` as `🟨 In progress` (the row itself is new — see requirement 8's
   file list and §4 of `improvement-plan.md` for its contents). (~10 min)

2. **Coverage plumbing.** Add `@vitest/coverage-v8` to the five packages, the `coverage` block to
   the five configs, the five `test:coverage` scripts, the `turbo.json` task, and the root script.
   `pnpm install`. (~30 min)

3. **Measure it, and measure it more than once.** `pnpm turbo run test:coverage --force` a
   handful of times, not one. Compare wall time against the 20.6s plain baseline, confirm all
   2,577 tests pass under instrumentation, and confirm five `coverage/coverage-summary.json` files
   land. `coverage/` is already gitignored.

   Repeating the run is what surfaced the non-determinism in Context, and it is the step most
   likely to be skipped: a single green run is exactly the evidence that made
   `improvement-plan.md` §1 report "0 failing". If failures appear, classify before mitigating —
   a socket-level signature and an assertion signature want different answers, and the assertion
   one may be a real bug (it was). (~45 min, most of it waiting)

4. **The workflow and the summary script.** Write `.github/workflows/ci.yml` and
   `.github/scripts/coverage-summary.mjs`. Test the script locally against the
   `coverage-summary.json` files step 3 produced, with `GITHUB_STEP_SUMMARY` pointed at a temp
   file, and with one of them deleted to prove it degrades quietly. (~35 min)

5. **First real run.** Commit, push the branch, open the PR (`/pr-description`). Watch the run
   (`gh run watch`, `gh run view --log-failed`). Expect to iterate here — action versions, cache
   paths and the `pnpm`-before-`setup-node` ordering are the likely stumbles, and every one of them
   fails loudly. (~30 min)

6. **Amend the ruleset — but only after the file 14 flake fix has landed**, per requirement 6's
   ordering note, and once a `gates` context exists for GitHub to match. Read the ruleset back and
   confirm all four rule types, then confirm from a PR page that `gates` shows as a **required**
   check rather than an informational one. If file 14's fix is not ready, this step carries over;
   everything else in this file stands on its own. (~15 min)

7. **Standards and harness.** Requirements 7 and 8: the four `[CI]` edits plus the §7 GitHub Flow
   additions; the `CLAUDE.md` CI section; the README badge and line; the
   `start-implementation` precondition; the `.claude/settings.json` changes. Delete
   `package-lock.json` (requirement 9). Re-run `pnpm lint` — Biome checks the JSON and Markdown in
   this list. (~35 min)

8. **Close out.** Flip the tracker row to `✅ Done`, push, confirm `gates` is still green on the
   final commit, and leave the PR for manual review per `general.md §7`. (~10 min)

## Acceptance Criteria

- [ ] `.github/workflows/ci.yml` exists and its `gates` job has run green on this branch's PR —
      verified with `gh run list --branch 39-ci-pipeline-and-branch-protection`, not assumed.
- [ ] The run's log shows all four gates as separately-named steps, each passing: `pnpm lint`,
      `pnpm build`, `pnpm typecheck`, `pnpm test:coverage`.
- [ ] The workflow declares no secrets and no `env:` block, and the run passes anyway — proving the
      "CI needs no database and no environment variables" finding in Context.
- [ ] `gh api repos/salmanbd100/kidlearn/rulesets/17802318 --jq '[.rules[].type]'` returns all four
      of `deletion`, `non_fast_forward`, `pull_request`, `required_status_checks` — the two
      pre-existing rules survived the `PUT`.
- [ ] The PR page shows `gates` as a **required** check, and a PR cannot be merged while it is
      failing (confirm by observing the merge button's state, not by reading the ruleset back a
      second time). **Deferred until the file 14 fix lands** — see requirement 6's ordering note.
      Until then this file is complete without it, and the tracker row says so.
- [ ] All 2,577 tests pass under v8 instrumentation, and the coverage step's wall time is recorded
      in the PR description alongside the plain-`test` baseline.
- [ ] The test step sets `TURBO_CONCURRENCY: 1` with a comment giving the runner-size reasoning and
      **not** claiming it fixes the flake. The suite was run enough times, in enough
      configurations, to state the `apps/server` failure rate honestly rather than to conclude it
      had gone away — four configurations, ~40 runs, recorded in Context with the correction that
      the first three rows alone were misleading.
- [ ] The `apps/web` grant-expiry flake is written up in Context with its root cause and handed to
      `14-parent-onboarding-profile-ui-fix`. It is **not** fixed on this branch (`general.md §7`),
      and `git diff` touches nothing under `apps/web/app/`.
- [ ] The run summary page shows a per-package coverage table; the `coverage` artifact is
      downloadable and contains five packages' HTML reports.
- [ ] **No `thresholds` key exists in any `vitest.config`** —
      `grep -rn "thresholds" apps packages --include=vitest.config.*` returns nothing.
- [ ] `grep -rn "once Vitest is configured\|once tests are configured" document/standards CLAUDE.md README.md`
      returns nothing. (`improvement-plan.md` and this file both quote the old strings on purpose —
      one as a dated finding, one as a before/after table. Scoping the grep to `document/standards`
      is the check, not a loophole.)
- [ ] The recorded exception about mocking `@kidlearn/db` in `general.md §5` is **unchanged** —
      files 42–43 own it.
- [ ] `general.md §6`'s CI subsection states that repository admins can bypass the gate, so the
      tier's strength is described accurately rather than aspirationally.
- [ ] `CLAUDE.md` has a CI section, and its other stale claims are **untouched** — file 40 owns
      those, and `git diff CLAUDE.md` on this branch should be additive only.
- [ ] `.claude/settings.json` no longer describes the repository as private.
- [ ] `package-lock.json` is gone from the repository root.
- [ ] `pnpm lint && pnpm typecheck && pnpm build && pnpm test` all pass locally, and the same four
      pass in CI — the point of the file is that these two facts are no longer independent.

## Out of Scope

- **A Postgres service container.** No test needs one today. **File 42** adds the test-database
  harness and adds the service container to this workflow as part of its own change — that keeps
  the container and the code that uses it in one reviewable diff.
- **`engines.node` and `.nvmrc`.** **File 46** (`improvement-plan.md` P2-3), which will also
  replace this workflow's inline `node-version: 22` with `node-version-file: .nvmrc`.
- **The rest of `CLAUDE.md`'s stale claims, and `frontend.md §1`'s `packages/ui` layering
  fiction.** **File 40** — see `improvement-plan.md` P1-3 and P1-4.
- **Coverage thresholds or a coverage gate.** Deliberately excluded; `improvement-plan.md` §6 is
  the reasoning. Reporting only.
- **A deploy job, or anything touching AWS.** File 38a's territory — it appends a `deploy` job to
  this same workflow, gated `needs: gates`, once file 38 has deployed by hand at least once. As
  written here the workflow verifies; it does not ship. Note for whoever does that: `gates` is the
  required status-check context, so do not rename it, and do not make `deploy` required.
- **Dependabot, Renovate, CodeQL, or any other GitHub app.** Dependency upgrades are file 46's
  subject and `improvement-plan.md` §5.3 proposes an `/upgrade-dependency` skill for the mechanical
  part. Adding a bot that opens PRs before the pipeline has run a single week is how a new pipeline
  gets ignored.
- **Matrix builds across Node versions or operating systems.** One target — the one the deployment
  runs — is the correct amount of matrix for a project with one deployment target.
- **Splitting the gates into parallel jobs.** Measured cold cost is under 40 seconds; parallelism
  would add setup overhead per job and multiply the required-check contexts from one to four.
- **Removing the ruleset's admin bypass actor.** Requirement 6 argues for keeping it. A solo
  maintainer who cannot force a fix onto `main` during an incident is worse off, and pretending
  otherwise in the standards is the actual thing this file fixes.
- **Fixing the `setTimeout` overflow in `apps/web/app/(parent)/context/parent-session.tsx`.**
  Diagnosed here, fixed on `14-parent-onboarding-profile-ui-fix` — `general.md §7`'s one-branch
  rule, and the diff wants to sit next to the PIN-gate tests that own the behaviour.
- **Reusing one Supertest listener per test file instead of one per request.** The structural fix
  for flake family 1, across 64 files, and the thing that actually has to happen before `gates` can
  be a required check. Files 42–43 rewrite much of that suite against a real database anyway, so it
  belongs there. This file only measures the problem and says so out loud.
