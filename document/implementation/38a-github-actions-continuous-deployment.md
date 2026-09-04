# 38a — GitHub Actions Continuous Deployment: `dev` and `main`

> **Estimated effort:** 4 hours
> **Depends on:** 38, 39
> **Requirement IDs:** spec §9 (deployment). No FR covers CD — this automates the manual procedure
> file 38 established, on the same footing as file 39.
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Turn file 38's two hand-run deploys into one job that fires on every push to `dev` or `main`, once
`gates` is green:

```
feature/x --PR--> dev  ──gates──> deploy ──> dev.kidlearn.net + api.dev.kidlearn.net
                   │
                   └──PR--> main ──gates──> deploy ──> kidlearn.net + api.kidlearn.net
```

Build the `linux/arm64` images natively, push them to ECR, roll them out over SSM — with **no AWS
credential, no SSH key and no database credential stored in GitHub**. Add a rollback that takes an
environment and an image tag.

Every production change has been live on `dev` first, because `main` accepts pull requests only from
`dev`, and that rule is enforced by a check rather than by memory.

## Context & Current State

File 38 left both environments working and a `deploy/deploy.sh` that already does the work — pull
images, run migrations, restart, poll health, revert on failure. It takes the environment as its
first argument. This file's job is to *invoke* it safely from CI, not to reimplement it.

`.github/workflows/ci.yml` (file 39) runs one job, `gates`, on pull requests to and pushes on `main`:
install → `pnpm lint` → `pnpm build` → `pnpm typecheck` → `pnpm test:coverage`, with pnpm and Turbo
caching and a coverage artefact. Its `concurrency` block sets `cancel-in-progress: false` for pushes
to `main`, so a superseded push still gets a verdict — the behaviour a deploy needs, and which now
has to extend to `dev`.

**`gates` is the status-check context file 39's branch ruleset requires.** Renaming that job silently
un-gates the branch. Nothing here renames it.

**There is no `dev` branch yet.** Every file so far has gone `NN-feature` → pull request → `main`
directly; step 1 below creates `dev` from `main` and that habit changes from this file onwards. The
`NN-feature` branch naming stays — only its target moves.

Three facts shape the design:

- **The repository is public** (`salmanbd100/kidlearn`), so GitHub's `ubuntu-24.04-arm` hosted runners
  are free. The instance is Graviton, so images must be `linux/arm64`; a native arm64 runner builds
  them in ordinary time, where QEMU emulation on an x86 runner would take several times longer for
  the Next.js build alone.
- **The box has no inbound SSH rule.** Deploys go through `ssm:SendCommand`, not `ssh`.
- **Both environments live on one instance.** `ssm:SendCommand` is scoped to an instance, not to a
  directory, so IAM cannot fully separate the dev pipeline from the production one. Requirement 4
  narrows it as far as IAM allows; requirement 8 handles the rest with a lock on the box. File 38's
  "The isolation this design does and does not give you" is the honest statement of where that ends.

## Detailed Requirements

1. **`ci.yml` triggers extend to `dev`.** `push: branches: [main, dev]` and
   `pull_request: branches: [main, dev]`. Extend the existing `cancel-in-progress` expression so a
   superseded push to *either* deployable branch still gets a verdict:

   ```yaml
   cancel-in-progress: ${{ github.event_name == 'pull_request' }}
   ```

   — which already reads correctly, since both `main` and `dev` arrive as `push`. Update the comment
   beside it to say "either deployable branch" rather than "`main`".

2. **A promotion guard, so the branch flow is real.** GitHub rulesets cannot restrict which *source*
   branch may merge into a target, so a small job does it:

   ```yaml
   promotion-guard:
     if: github.event_name == 'pull_request' && github.base_ref == 'main'
     runs-on: ubuntu-latest
     steps:
       - run: |
           test "${{ github.head_ref }}" = "dev" || {
             echo "::error::main accepts pull requests from dev only. Merge into dev first."
             exit 1
           }
   ```

   Make it a **required status check on `main`** alongside `gates`. Without that it is advisory, and
   an advisory rule about release process is a rule that stops being followed in a hurry. A genuine
   emergency is a hotfix branch merged to `dev` and promoted in two pull requests, or an admin
   override — both leave a trace, which is the point.

3. **GitHub OIDC, two roles, not access keys.** Create an IAM OIDC identity provider for
   `token.actions.githubusercontent.com` with audience `sts.amazonaws.com` (AWS manages the thumbprint
   itself now), then **one role per environment**, each trust-scoped to its GitHub Environment:

   ```json
   "Condition": {
     "StringEquals": {
       "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
       "token.actions.githubusercontent.com:sub": "repo:salmanbd100/kidlearn:environment:production"
     }
   }
   ```

   …and the same with `environment:development` for the other. Scoping to the environment rather than
   to `ref:refs/heads/main` is what makes an approval gate meaningful: a workflow that skipped the
   environment could not assume the role at all.

   The workflow needs `permissions: { id-token: write, contents: read }` — **without `id-token: write`
   there is no token to exchange**, and the failure reads as a generic credentials error.

4. **Each role's permissions, kept as narrow as a shared box allows.**

   - ECR: push and pull, but the **dev role is restricted by tag** via a
     `ecr:ResourceTag`/`aws:RequestTag` condition where the API supports it, and at minimum is granted
     nothing on the `kidlearn-web` repository beyond what it needs. The production role alone may push
     `prod-*` tags.
   - `ssm:SendCommand` on the one instance ARN **and** the `AWS-RunShellScript` document ARN;
     `ssm:GetCommandInvocation` and `ssm:ListCommandInvocations` to read the result.
   - **No `ssm:StartSession`** in either role, so a compromised workflow cannot open an interactive
     shell on the box.
   - Neither role reads SSM parameters and neither holds a database credential. `prisma migrate deploy`
     runs **on the box** from the SSM-sourced env file, under the *instance* role. GitHub never sees
     `DIRECT_URL` or the dev `POSTGRES_PASSWORD`.

   Be explicit in the policy comment that `SendCommand` on a shared instance is the residual gap: the
   dev role can send a shell command, and a shell command can reach the production stack. IAM cannot
   close that while one box hosts both.

5. **One `deploy` job, environment selected by branch.** Appended to `ci.yml`, not a separate
   workflow:

   ```yaml
   deploy:
     name: deploy
     needs: gates
     if: >-
       github.event_name == 'push' &&
       (github.ref == 'refs/heads/main' || github.ref == 'refs/heads/dev')
     runs-on: ubuntu-24.04-arm
     environment: ${{ github.ref_name == 'main' && 'production' || 'development' }}
     permissions: { id-token: write, contents: read }
     concurrency:
       group: deploy-${{ github.ref_name }}
       cancel-in-progress: false
     env:
       ENV_NAME: ${{ github.ref_name == 'main' && 'prod' || 'dev' }}
   ```

   `needs: gates` is the whole point: nothing deploys that has not passed lint, build, typecheck and
   tests. Selecting the environment by expression means the environment-scoped `vars` in
   requirement 7 resolve to the right set with no branching inside the steps — one code path, two
   configurations, which is the same property file 38's Compose overlay gives the runtime.

   A separate workflow triggered by `workflow_run` would also work but has to check out
   `github.event.workflow_run.head_sha` explicitly — the default checkout is the branch tip, which
   quietly deploys a *different commit* than the one that passed. One job in one file avoids that
   class of bug entirely.

   **`cancel-in-progress` must be `false`.** Cancelling a deploy midway between `docker compose pull`
   and the health check leaves the box in an indeterminate state. The concurrency group is per branch
   so a dev deploy never queues behind a production one — the box-level serialisation is
   requirement 8's job, not GitHub's.

   **Do not make `deploy` a required status check.** `gates` and `promotion-guard` are the merge
   gates; making deployment one means an AWS outage blocks every unrelated pull request.

6. **Build: four images, one commit SHA, environment-aware tags.**
   `docker/setup-buildx-action@v3` plus `docker/build-push-action@v6`.

   | Image | Tag | Built per environment? |
   |---|---|---|
   | `kidlearn-web` | `${ENV_NAME}-${{ github.sha }}` | **Yes** — `NEXT_PUBLIC_*` is inlined at build time (file 38 requirement 4) |
   | `kidlearn-api` | `${{ github.sha }}` | No — configured entirely at runtime |
   | `kidlearn-migrate` | `${{ github.sha }}` | No |

   The web build takes `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL` and `MEDIA_ASSET_HOSTS` as
   `build-args` from the environment's variables. **This is the single most dangerous step in the
   pipeline**: a web image built with production build args and deployed to dev is a dev site writing
   to the production database, and it looks entirely normal from the outside. Requirement 10's
   assertion exists for this.

   Do **not** tag `latest`. Every deploy names an explicit SHA, which is what makes rollback a
   one-line input rather than an archaeology exercise.

   Use `cache-from: type=gha` / `cache-to: type=gha,mode=max` for the pnpm install and Prisma
   generate layers, with a **`scope:` per image and per environment** (`web-dev`, `web-prod`, `api`).
   Watch the size: **GitHub's Actions cache is 10 GB per repository**, and now four builds across two
   branches can evict each other and the Turbo cache `gates` depends on. Drop to `mode=min` if the
   cache starts thrashing; a slower build beats a `gates` job that reinstalls from cold every run.

7. **Configuration on each GitHub Environment,** as *variables* rather than secrets — none is a
   credential, and variables are readable in logs where secrets are masked into uselessness for
   debugging.

   | Variable | `production` | `development` |
   |---|---|---|
   | `AWS_REGION` | `ap-south-1` | `ap-south-1` |
   | `AWS_ROLE_ARN` | the production role | the development role |
   | `ECR_REGISTRY` | `<account-id>.dkr.ecr.ap-south-1.amazonaws.com` | same |
   | `EC2_INSTANCE_ID` | `i-…` | same instance |
   | `NEXT_PUBLIC_API_URL` | `https://api.kidlearn.net` | `https://api.dev.kidlearn.net` |
   | `NEXT_PUBLIC_SITE_URL` | `https://kidlearn.net` | `https://dev.kidlearn.net` |
   | `MEDIA_ASSET_HOSTS` | `https://res.cloudinary.com` | `https://res.cloudinary.com` |

   **The repository holds no secrets for deployment at all.** If a `secrets.*` reference appears in
   the deploy job, something has gone wrong with the design — say why in the pull request.

   Leave the `production` environment without required reviewers for now; the promotion guard already
   means nothing reaches it that has not run on dev. Add a reviewer later if you want a hand on the
   lever, and note in the runbook that doing so makes a merge to `main` build and wait rather than
   ship.

8. **Deploy over SSM, serialised on the box.**

   ```bash
   CMD_ID=$(aws ssm send-command \
     --instance-ids "$EC2_INSTANCE_ID" \
     --document-name AWS-RunShellScript \
     --comment "deploy $ENV_NAME ${GITHUB_SHA::7}" \
     --parameters "commands=/opt/kidlearn/deploy.sh $ENV_NAME $GITHUB_SHA" \
     --query Command.CommandId --output text)
   ```

   **`deploy.sh` must take an exclusive `flock` on a single shared lockfile**, not one per
   environment. Both stacks share a Docker daemon, an image store and an EBS volume; a dev
   `docker image prune` interleaved with a production `docker compose pull` is a class of failure
   nobody wants to debug at speed. Serialising every deploy on the box costs a few seconds of waiting
   and removes the whole category.

   Two traps in reading the result, both of which produce a green job over a failed deploy:

   - `aws ssm get-command-invocation` immediately after `send-command` can return
     `InvocationDoesNotExist`. Sleep briefly, or start with `aws ssm wait command-executed`.
   - `aws ssm wait command-executed` **exits non-zero on a terminal failure**, which under `set -e`
     ends the step before anything prints. Wrap it (`|| true`), then always run
     `get-command-invocation` to echo `StandardOutputContent` and `StandardErrorContent` into the job
     log, and only then exit on `Status != Success`. A deploy failure you cannot read is barely better
     than no deploy at all.

   Point `send-command` at the instance **ID**, never a public IP.

9. **`deploy.sh <env> <sha>` — idempotent, health-gated, self-reverting.** File 38 wrote it; this is
   where its failure path gets proved. In order:

   1. **Validate `$1` against exactly `prod|dev`** and exit non-zero on anything else. It selects a
      filesystem path, a Compose project and an SSM prefix; an unvalidated value is the difference
      between a typo and a production incident.
   2. Take the `flock`.
   3. Refresh `/opt/kidlearn/$ENV/app.env` from `/kidlearn/$ENV/` via
      `get-parameters-by-path --recursive --with-decryption`, written `root:root 0600`. Doing it every
      deploy means a rotated secret needs no separate step.
   4. `docker login` to ECR; `docker compose -p kidlearn-$ENV … pull`.
   5. `docker compose -p kidlearn-$ENV … --profile migrate run --rm migrate`. **Non-zero exits before
      anything restarts** — a failed migration must not take the site down with it. On dev this runs
      against the Postgres container and is gated on its healthcheck.
   6. `docker compose -p kidlearn-$ENV … up -d`.
   7. Poll that environment's **own** two public URLs, up to ~60 s. Going through Caddy rather than the
      container ports tests the proxy and the certificate too. Dev's web host is behind basic auth, so
      poll it with credentials or poll `api.dev.kidlearn.net/health` plus the dev web container's port
      directly — pick one and say which in a comment.
   8. On success, write the tag to `/opt/kidlearn/$ENV/.last-good-tag`. On failure, redeploy the tag in
      that file, restart, and `exit 1`.
   9. `docker image prune -f`, so a 30 GB volume shared by two environments does not silently fill.

   Migrations being forward-only means the automatic revert restores the *images*, not the schema.
   That is correct, and it is a constraint worth writing in the runbook: **any migration that reaches
   `main` must be backward-compatible with the image before it**, because for the seconds between
   step 5 and step 7 the old containers are running against the new schema. Dev is where you find out
   whether it is — which is the concrete reason the promotion guard exists.

10. **Assert the environment after deploying, not just before.** A step that fetches the deployed
    site and fails the job if it is wrong:

    - `curl -s https://dev.kidlearn.net` (with basic auth) must **not** contain `api.kidlearn.net`.
    - `curl -s https://kidlearn.net` must **not** contain `dev.kidlearn.net`.
    - `curl -sf https://api.$ENV_HOST/health` returns the envelope.

    Cross-wiring the build args is silent, survives every other check in this pipeline, and points a
    dev deployment at the production database. Ten lines of `grep` is cheap insurance.

11. **Rollback as a `workflow_dispatch`.** A `rollback` job — same roles, no build step — taking two
    inputs: `environment` (a `choice` of `dev`/`prod`) and a required `image_tag`, running the same
    `deploy.sh`. Rollback must not depend on a build succeeding; the reason you are rolling back may
    be that builds are broken.

    Remember the tag shapes differ: the web image wants `<env>-<sha>` and the api and migrate images
    want the bare `<sha>`. Take the bare SHA as the input and let the script compose both, so nobody
    has to remember which is which at 2am.

12. **Prove it before trusting it, on dev first.** Run the `deploy` job by hand against `dev` via
    `workflow_dispatch`. Then **force a failure** — deploy a nonexistent tag, then break the health
    endpoint — and confirm the box reverts to the last-good tag and the job goes red. Only then enable
    the `main` path. An untested rollback is the one that will be exercised first, at the worst
    moment, and dev is free to break.

13. **Documentation.** Extend `document/runbook.md` (file 38) with: the branch flow and what the
    promotion guard enforces; how to deploy either environment without merging; how to roll back and
    where to find the tag (the SHA in the Actions run title, or `docker compose -p kidlearn-<env> images`
    on the box); how to read an SSM command's output when the job log is not enough; and the
    backward-compatible-migration rule from requirement 9. Note in `.github/workflows/ci.yml`, beside
    the existing comment about the `gates` context, that `gates` and `promotion-guard` are the
    required checks and `deploy` is deliberately not.

14. **File 39's branch ruleset needs extending,** and this file is where it happens because it is
    where `dev` becomes deployable. Ruleset 17802318 currently targets `~DEFAULT_BRANCH` only. It must
    cover **both** `main` and `dev`: `gates` required on each, plus `promotion-guard` required on
    `main`. Record the change in file 39's requirement 6 as well, so the two files do not disagree
    about what protects what.

## Technical Approach & Suggestions

Files to modify:

```
.github/workflows/ci.yml        # + dev triggers, promotion-guard, deploy, rollback
deploy/deploy.sh                # env validation, flock, harden the failure path
document/runbook.md             # branch flow, per-environment deploy and rollback
```

Nothing is created. Resisting a second workflow file is the design decision: keeping deploy and
rollback beside each other means the two can never drift apart in how they call `deploy.sh`, and one
`gates` definition serves both branches.

Sketch of the build-and-deploy chain, after `actions/checkout@v5`:

```yaml
- uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ vars.AWS_ROLE_ARN }}
    aws-region: ${{ vars.AWS_REGION }}
- uses: aws-actions/amazon-ecr-login@v2
- uses: docker/setup-buildx-action@v3

- uses: docker/build-push-action@v6          # api
  with:
    context: .
    file: apps/server/Dockerfile
    target: runner
    push: true
    tags: ${{ vars.ECR_REGISTRY }}/kidlearn-api:${{ github.sha }}
    cache-from: type=gha,scope=api
    cache-to: type=gha,mode=max,scope=api

- uses: docker/build-push-action@v6          # web — environment-specific
  with:
    context: .
    file: apps/web/Dockerfile
    push: true
    tags: ${{ vars.ECR_REGISTRY }}/kidlearn-web:${{ env.ENV_NAME }}-${{ github.sha }}
    build-args: |
      NEXT_PUBLIC_API_URL=${{ vars.NEXT_PUBLIC_API_URL }}
      NEXT_PUBLIC_SITE_URL=${{ vars.NEXT_PUBLIC_SITE_URL }}
      MEDIA_ASSET_HOSTS=${{ vars.MEDIA_ASSET_HOSTS }}
    cache-from: type=gha,scope=web-${{ env.ENV_NAME }}
    cache-to: type=gha,mode=max,scope=web-${{ env.ENV_NAME }}
```

…and a third with `target: migrate` for `kidlearn-migrate`. No `platforms:` key is needed — the
runner is already arm64, and setting it would push builds through emulation for nothing.

The web image is the slow one, and there are now two of it across the two branches. If the job creeps
past a few minutes, the first thing to check is whether the pnpm install layer is being cached — an
over-broad `.dockerignore`, or copying the whole repo before the lockfile, invalidates it on every
commit.

## Step-by-Step Plan

1. Create `dev` from `main` and push it. Extend `ci.yml`'s triggers to `dev`; add
   `promotion-guard` and prove it by opening a throwaway pull request from a feature branch straight
   to `main` and watching it fail. (~30 min)
2. Create the OIDC provider and both roles with requirement 4's policies; verify each trust condition
   names its own environment. (~40 min)
3. Create the `development` and `production` GitHub Environments and their variables. (~20 min)
4. Harden `deploy.sh`: argument validation, `flock`, migration abort, health poll through Caddy,
   `.last-good-tag` revert, image prune. Run it on the box by hand for both environments, twice each,
   and confirm the second run is a no-op. (~50 min)
5. Add the `deploy` job with a `workflow_dispatch` path; run it manually against **dev** and watch a
   real image reach the box. (~40 min)
6. Add requirement 10's post-deploy assertions; deliberately cross-wire the build args once to
   confirm they catch it, then revert. (~25 min)
7. Add the `rollback` job; roll dev back to the previous SHA and confirm the older build serves.
   (~20 min)
8. Break a dev deploy on purpose — nonexistent tag, then a failing health check — and confirm the box
   self-reverts and the job goes red. (~20 min)
9. Enable the `main` path; extend the branch ruleset to cover both branches per requirement 14; merge
   a trivial change through `dev` to `main` and watch both deploys go out. Update the runbook, file
   39's requirement 6, and the tracker. (~40 min)

## Acceptance Criteria

- [ ] A push to `dev` builds `kidlearn-web:dev-<sha>` plus the shared api and migrate images and
      deploys only the dev stack; `kidlearn.net` is untouched — confirm with
      `docker compose -p kidlearn-prod images` before and after.
- [ ] A push to `main` does the same for production and leaves `dev.kidlearn.net` untouched.
- [ ] A pull request from a feature branch directly to `main` **fails** `promotion-guard`; the same
      branch merged to `dev` and promoted by a `dev` → `main` pull request passes.
- [ ] `deploy` does not run on pull requests, and does not run when `gates` fails.
- [ ] `gates` and `promotion-guard` are required status checks on `main`, `gates` is required on
      `dev`, and `deploy` is **not** required on either.
- [ ] The deployed dev bundle contains no `api.kidlearn.net` and the deployed production bundle no
      `dev.kidlearn.net` — asserted by the job itself (requirement 10), not only by hand.
- [ ] The repository has **no** AWS access key, SSH key or database credential in secrets, and neither
      deploy job references a `secrets.*` value. `git grep -n "secrets\." .github/workflows/` returns
      nothing from the deploy, rollback or guard jobs.
- [ ] Neither IAM role can open a session on the box: `aws ssm start-session` under those credentials
      is denied.
- [ ] `deploy.sh` rejects an environment argument that is not exactly `prod` or `dev`.
- [ ] Two deploys triggered at once — one to `dev`, one to `main` — **serialise on the box** via the
      `flock`; both succeed, neither interleaves. Confirm from the timestamps in the two SSM outputs.
- [ ] A failed migration aborts the deploy **before** any container restarts, and that environment
      stays on its previous version — demonstrated on dev, not asserted.
- [ ] A deploy whose health check fails self-reverts to that environment's `.last-good-tag` and the
      job goes **red**; the SSM command's stdout and stderr are readable in the job log.
- [ ] `workflow_dispatch` rollback restores an arbitrary earlier SHA for the chosen environment, with
      no image rebuild, and composes the `<env>-<sha>` and bare `<sha>` tags itself.
- [ ] End-to-end after an automated deploy to each environment: a parent signs in and the session
      survives a reload.
- [ ] `document/runbook.md` covers the branch flow, per-environment manual deploy, rollback, reading
      SSM output, and the backward-compatible-migration rule. File 39's requirement 6 names both
      branches.

## Out of Scope

- **Blue/green or zero-downtime rollout.** `docker compose up -d` restarts containers in place, so a
  deploy is a few seconds of 502 from Caddy. At this traffic that is the right trade; a second box and
  a load balancer to avoid it costs more per month than the entire deployment.
- **Automatic schema rollback.** Migrations are forward-only. The revert restores images only, which
  is why requirement 9 makes backward compatibility the author's obligation and dev the place it gets
  tested.
- **Closing the shared-instance `SendCommand` gap.** Requirement 4 narrows it; only a second instance
  removes it. File 38 states the trade.
- **Preview environments per pull request.** `dev` is the shared preview. A per-PR environment needs a
  database and a hostname each, which is a different design.
- **Deploy notifications** — Slack, email, or a GitHub deployment status beyond what the Environments
  already record. Post-MVP.
- **Turbo remote caching** (`npx turbo link`). Worth doing when build minutes start to hurt; they do
  not yet, and the repository is public so they are free.
- **Signing or scanning images** — Sigstore, ECR enhanced scanning, an SBOM. Real hardening, and a
  separate piece of work.
