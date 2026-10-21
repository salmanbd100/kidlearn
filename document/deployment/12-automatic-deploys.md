# Part 12 — Automatic API deploys (file 38a)

[← Previous](11-dev-environment.md) · [Guide index](README.md) · [Next →](troubleshooting.md)

> **Where you work:** 🌐 AWS, GitHub, 💻 Mac. Steps 37–46.  
> **You finish with:** merges into `dev` and `main` deploying the API by themselves, with rollback one click away.  
> **Before you start:** Part 11 — dev is live and you have deployed by hand a few times.

Today, shipping the API is: build two images on your Mac, push them, open the
server terminal, run `deploy.sh`. Part 12 makes GitHub do those steps itself,
after `gates` passes, for both branches:

```
 feature/x ──PR──► dev ──gates ✅──► deploy job ──► api.dev.kidlearn.net
                    │
                    └──PR (dev only)──► main ──gates ✅──► deploy job ──► api.kidlearn.net
```

```
 TODAY (by hand)                                    AFTER PART 12
 ───────────────                                    ─────────────
 merge to main                                      merge to dev or main
   │                                                  │
   ▼                                                  ▼ GitHub Actions "gates" ✅
 💻 docker build ×2, docker push ×2                   │
   │   (your Mac, your AWS access key)                ▼ job "deploy" (needs: gates)
   ▼                                                  │ 1. log in to AWS with OIDC —
 🖥️ open Session Manager                              │    a token that expires in an
   │                                                  │    hour; NO key stored in GitHub
   ▼                                                  │ 2. build both images on an Arm
 deploy.sh prod <sha>                                 │    runner, push them to ECR
                                                      │ 3. aws ssm send-command →
                                                      │    "deploy.sh <env> <sha>" on the box
                                                      ▼ 4. job goes RED if deploy.sh fails
                                                    "rollback" = Run workflow with an old SHA
```

**The website is not part of this** — Vercel already deploys both sites on
every push. This job only ships the API.

**Who does what in Part 12:**

| | Steps |
|---|---|
| 🌐 You, in AWS IAM and GitHub settings | 37, 38, 40, 45 |
| 💻 You, from your Mac, to learn the mechanism | 39 |
| 💻 Code — a pull request for file 38a (`ci.yml` jobs, a hardened `deploy.sh`) | 41 |
| 🌐 You, proving it works — and proving it fails safely | 42, 43, 44, 46 |

**Before you start:** [Part 11](11-dev-environment.md) is done, and you have run `deploy.sh` by hand for
both environments, more than once. *An automated pipeline for a deploy nobody
has done by hand fails on something its author never saw.*

**Cost:** $0. The repository is public, so GitHub's Arm runners and Actions
minutes are free; IAM and OIDC are free.

## Step 37 · 🌐 Let AWS trust GitHub — the OIDC identity provider

**Why:** GitHub Actions needs to act in your AWS account. The old way is to
paste an access key into GitHub as a secret — a key that never expires and
works from anywhere if it leaks. OIDC replaces it:

```
 GitHub Actions job                         AWS
 ──────────────────                         ───
 1. "I am repo salmanbd100/kidlearn,
     running in environment development"
     — a signed token, made fresh by GitHub
                          ──────────────────► 2. IAM checks the signature against
                                                 token.actions.githubusercontent.com
                                                 and the role's trust policy
                          ◄────────────────── 3. temporary credentials, valid ~1 hour
 4. push images, send the deploy command
```

Nothing in GitHub can be stolen and reused later, because nothing is stored.

1. IAM (region says **Global** — correct) → **Identity providers** → **Add
   provider**.
2. Provider type **OpenID Connect**.
3. Provider URL `https://token.actions.githubusercontent.com`.
4. Audience `sts.amazonaws.com`.
5. **Add provider.** (No thumbprint step — AWS manages that itself now.)

✅ **Check:** **Identity providers** lists `token.actions.githubusercontent.com`.

## Step 38 · 🌐 Two deploy roles — one per environment

**Why two:** the dev pipeline should not be able to act as the production one.
Each role trusts tokens from **one GitHub Environment only**, so a workflow job
that is not running in the `production` environment cannot get production's
credentials at all.

**38a. Create `kidlearn-deploy-dev`**

1. IAM → **Roles → Create role** → Trusted entity **Web identity**.
2. Identity provider `token.actions.githubusercontent.com`, Audience
   `sts.amazonaws.com`.
3. GitHub organization `salmanbd100`, GitHub repository `kidlearn`, branch
   **empty** → Next.
4. Skip permissions → Next → Role name `kidlearn-deploy-dev` → **Create role**.
5. Open the role → **Trust relationships → Edit trust policy** → replace
   everything with this (your 12-digit account ID in `<ACCOUNT_ID>`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:salmanbd100/kidlearn:environment:development"
        }
      }
    }
  ]
}
```

*Reading the `sub` line:* "only a job in repository `salmanbd100/kidlearn`
**running in the GitHub Environment named `development`**". The wizard in step
3 would have scoped it to a branch instead; the environment is stricter,
because the job must declare `environment: development` to get a token that
matches.

6. **Permissions → Add permissions → Create inline policy → JSON** → paste the
   policy below, replacing `<ACCOUNT_ID>` and `<INSTANCE_ID>` (the `i-0…` from
   your sheet) → name `kidlearn-deploy` → **Create policy**.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "EcrLogin",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*" },
    { "Sid": "PushAndPullTheTwoImagesOnly",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer",
        "ecr:InitiateLayerUpload", "ecr:UploadLayerPart", "ecr:CompleteLayerUpload", "ecr:PutImage"
      ],
      "Resource": [
        "arn:aws:ecr:ap-south-1:<ACCOUNT_ID>:repository/kidlearn-api",
        "arn:aws:ecr:ap-south-1:<ACCOUNT_ID>:repository/kidlearn-migrate"
      ] },
    { "Sid": "RunDeployShOnTheOneBoxSharedBoxIsTheResidualGap",
      "Effect": "Allow",
      "Action": "ssm:SendCommand",
      "Resource": [
        "arn:aws:ec2:ap-south-1:<ACCOUNT_ID>:instance/<INSTANCE_ID>",
        "arn:aws:ssm:ap-south-1::document/AWS-RunShellScript"
      ] },
    { "Sid": "ReadTheDeployResult",
      "Effect": "Allow",
      "Action": ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"],
      "Resource": "*" }
  ]
}
```

In plain words:

| Statement | Lets the pipeline… | Does **not** let it… |
|---|---|---|
| `EcrLogin` + `PushAndPull…` | upload and download **our two** images | touch any other repository |
| `RunDeploySh…` | run a shell command on **this one** server | run anything on any other server |
| `ReadTheDeployResult` | read what that command printed | — |
| *(absent)* `ssm:StartSession` | — | open an interactive shell on the box |
| *(absent)* `ssm:GetParameter*` | — | read **any** secret. `deploy.sh` reads them on the box, under the **server's** role |

> **The honest gap — read this once.** `ssm:SendCommand` can only be limited to
> a *server*, not to a folder on it. Both environments share one server, so the
> dev role *could* send a command that touches production containers. IAM
> cannot close that while one box hosts both; only a second server would. The
> statement's `Sid` names the gap so nobody later mistakes it for an oversight.

**38b. Create `kidlearn-deploy-prod`** — repeat 38a exactly, with the name
`kidlearn-deploy-prod` and the trust policy's last part reading
`environment:production`.

✅ **Check:** two roles. In each, **Trust relationships** names its **own**
environment (`development` / `production`) — a swap here is the one mistake
that silently undoes the separation. Copy both **ARNs**
(`arn:aws:iam::<ACCOUNT_ID>:role/kidlearn-deploy-…`) into your sheet.

## Step 39 · 💻 Do by hand what the pipeline will do

**Why:** the pipeline's step 3 — "run `deploy.sh` on the box without logging in
to it" — is `aws ssm send-command`. Do it yourself once from your Mac (with your
own access key) and the job log will never be a mystery.

```bash
INSTANCE_ID=i-0...      # from your sheet
SHA=...                 # the SHA dev runs now: cat /opt/kidlearn/dev/last-good-tag on the box

CMD_ID=$(aws ssm send-command --region ap-south-1 \
  --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --comment "manual dev deploy $SHA" \
  --parameters "{\"commands\":[\"/opt/kidlearn/deploy/deploy.sh dev $SHA\"]}" \
  --query Command.CommandId --output text)
echo "$CMD_ID"

aws ssm wait command-executed --region ap-south-1 \
  --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" \
  || echo "wait reports a failure — read the output below before deciding anything"

aws ssm get-command-invocation --region ap-south-1 \
  --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" \
  --query '{Status:Status,Output:StandardOutputContent,Errors:StandardErrorContent}'
```

✅ **Check:** `Status` is `Success` and `Output` ends with `deploy complete at
<sha>`. The same run appears in 🌐 **Systems Manager → Run Command → Command
history**, with the full output.

Now watch it fail, safely (dev only):

```bash
CMD_ID=$(aws ssm send-command --region ap-south-1 --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript --comment "deliberate failure" \
  --parameters '{"commands":["/opt/kidlearn/deploy/deploy.sh dev doesnotexist"]}' \
  --query Command.CommandId --output text)
aws ssm wait command-executed --region ap-south-1 --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" \
  || echo "wait failed"
aws ssm get-command-invocation --region ap-south-1 --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" \
  --query '{Status:Status,Errors:StandardErrorContent}'
```

`Status: Failed`, and `Errors` says the image `…:doesnotexist` was not found. The
running `dev-api` is untouched — the pull failed before anything restarted.
Because `deploy.sh` had already rewritten `dev/compose.env` with the bad tag,
put it right by sending the good `$SHA` once more (the first block).

**The three lessons the pipeline is built on** (file 38a requirement 8):

1. `get-command-invocation` straight after `send-command` can say
   `InvocationDoesNotExist` — the command has not reached the box yet. That is
   why you `wait` first.
2. `aws ssm wait` **exits non-zero** when the command failed. In a script with
   `set -e`, that ends the step *before* the output is printed — a red job with
   no explanation. So: tolerate the wait's failure, **always** print the output,
   *then* fail.
3. Target the instance **ID**, never its IP.

## Step 40 · 🌐 GitHub Environments and their variables

**Why:** a GitHub Environment is a named set of settings a job can opt into.
The `deploy` job says `environment: development` or `environment: production`,
and gets that environment's variables — and, through Step 38's trust policy,
only that environment's AWS role.

GitHub → repo → **Settings → Environments → New environment** → `development` →
**Configure environment**:

- **Required reviewers:** none. **Deployment branches:** no restriction.
- **Environment variables → Add variable**, six times:

| Variable | `development` | `production` |
|---|---|---|
| `AWS_REGION` | `ap-south-1` | `ap-south-1` |
| `AWS_ROLE_ARN` | ARN of `kidlearn-deploy-dev` | ARN of `kidlearn-deploy-prod` |
| `ECR_REGISTRY` | `<ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com` | same |
| `EC2_INSTANCE_ID` | `i-0…` | **same** server |
| `WEB_ORIGIN` | `https://dev.kidlearn.net` | `https://kidlearn.net` |
| `API_ORIGIN` | `https://api.dev.kidlearn.net` | `https://api.kidlearn.net` |

Then **New environment** → `production` → the right-hand column.

*Why variables, not secrets?* None of these is a credential — an ARN or an
instance ID is useless without the OIDC trust. Variables show in the job log;
secrets are masked as `***`, which makes a failed deploy harder to read. **The
deploy job uses no GitHub secret at all.** If one ever appears in it, something
has gone wrong with the design.

*Why no required reviewer on production?* Nothing reaches `main` without having
run on `dev` first (Step 45 enforces that). You can add yourself as a reviewer
later if you want a hand on the lever; a merge to `main` will then build and
wait for your click before shipping.

✅ **Check** — 💻:

```bash
gh api repos/salmanbd100/kidlearn/environments --jq '.environments[].name'   # development, production
gh variable list --env development
gh variable list --env production
```

Six variables in each, and `AWS_ROLE_ARN` names a different role in each.

## Step 41 · 💻 The code half — file 38a's pull request

The AWS and GitHub settings are in place; now the workflow needs the jobs that
use them. This is a **code change**, reviewed and merged like any other:
branch `38a-github-actions-continuous-deployment` from `dev`, implemented from
`document/implementation/38a-github-actions-continuous-deployment.md`
(`/start-implementation 38a-github-actions-continuous-deployment` sets it up).

**What the pull request changes, so you can review it:**

```
 .github/workflows/ci.yml
   on: workflow_dispatch  ── a "Run workflow" button with three inputs:
                             job (deploy | rollback), environment (dev | prod), image_tag
   gates            unchanged — still the required check
   promotion-guard  PRs into main: fail unless the source branch is dev
   deploy           needs: gates · runs-on: ubuntu-24.04-arm (free Arm runner)
                    environment: development | production  (picked from the branch)
                    permissions: id-token: write  ← without it, no OIDC token exists
                    concurrency: one deploy per environment, never cancelled midway
                    steps: OIDC login → ECR login → build api + migrate → push
                           → send-command deploy.sh → print output → check both sites
   rollback         workflow_dispatch only · NO needs: (works even when builds are broken)
                    → send-command deploy.sh <env> <old tag>

 deploy/deploy.sh
   flock            one deploy at a time on the box, across BOTH environments
   failure path     redeploys last-good-tag by itself, then exits 1
   migrations       every deploy; a failed migration stops BEFORE any restart
   image prune      after success, so the 20 GB disk does not fill
```

Two things to watch when merging it:

- **Merging into `dev` is a push to `dev`, which triggers `deploy`.** Ship the
  first version with only the `workflow_dispatch` path and the `dev` push path
  switched on; the `main` path is turned on in Step 46, after Steps 42–44 have
  proven it.
- **`deploy.sh` runs from the server's copy, not from GitHub.** After the PR is
  merged into `dev`, put the new `deploy.sh` on the box — [Step 20c](06-server.md), cloning the
  `dev` branch this one time:

  ```bash
  git clone --branch dev https://github.com/salmanbd100/kidlearn.git /tmp/kidlearn
  cp -r /tmp/kidlearn/deploy/. /opt/kidlearn/deploy/ && rm -rf /tmp/kidlearn
  chmod +x /opt/kidlearn/deploy/*.sh
  ```

  Production uses the same file from now on, so the new `deploy.sh` must still
  work for `prod` — that is part of reviewing the pull request.

## Step 42 · 🌐 The first automated deploy — started by hand, against dev

🖥️ First, note what production is running, so you can prove it was not touched:

```bash
docker compose -p kidlearn-prod images      # note the TAG column
```

🌐 GitHub → **Actions → CI → Run workflow** → branch `dev`, job `deploy`,
environment `dev` → **Run workflow**.

Watch it: `gates` first (~4 minutes), then `deploy`. Open the `deploy` job log
and find:

- `ENV_NAME=dev` printed **before** anything else happens;
- the AWS login step assuming `kidlearn-deploy-dev`;
- two images pushed, tagged with the **full 40-character commit SHA** (by hand
  you used the 7-character short one — both are valid tags; a rollback needs the
  exact one);
- the SSM output, ending `deploy complete at <sha>`;
- the post-deploy checks passing (the dev site references only
  `api.dev.kidlearn.net`).

✅ **Check:**

```bash
# 🖥️
docker compose -p kidlearn-dev images       # the new SHA
docker compose -p kidlearn-prod images      # UNCHANGED from before
# 💻
curl -s https://api.dev.kidlearn.net/health
```

## Step 43 · 🌐 Break it on purpose — dev only

**Why:** the rollback you never tested is the one you will need first, at the
worst moment. Dev is free to break.

**43a. A tag that does not exist.** **Run workflow** → job `rollback`,
environment `dev`, image_tag `0000000`. ✅ The job goes **red**, its log shows
the SSM error output, and 🖥️ `cat /opt/kidlearn/dev/last-good-tag` still names
the good SHA, which `dev-api` is still running.

Then once more with image_tag **empty**: ✅ it fails in its **first** step, before
touching AWS.

**43b. An image that will not start.** You need a broken image that still
passes `gates` — otherwise `deploy` never runs. The trick: break the container's
start command, which no test executes.

1. 💻 `git checkout -b 38a-rehearse-broken-start dev`
2. In `apps/server/Dockerfile`, change the last line's
   `CMD ["node", "dist/server.js"]` to `CMD ["node", "dist/does-not-exist.js"]`.
3. Commit and push the branch. **Do not open a pull request.**
4. 🌐 **Run workflow** → branch `38a-rehearse-broken-start`, job `deploy`,
   environment `dev`.

✅ `gates` passes (the image builds fine), `deploy` goes **red**, its log shows
`Cannot find module …/dist/does-not-exist.js` from the SSM output, and
`deploy.sh` has put `last-good-tag` back by itself: 🖥️
`docker compose -p kidlearn-dev images` shows the good SHA again, and 💻
`curl -s https://api.dev.kidlearn.net/health` is ok.

**43c. A migration that fails.** A failed migration must stop the deploy
**before** any container restarts. The failure has to happen on dev's data but
not on CI's empty test database, or `gates` would stop it first:

1. 💻 On another throwaway branch from `dev`, add
   `packages/db/prisma/migrations/29990101000000_rehearse_failure/migration.sql`:

   ```sql
   -- Deliberate failure for the file 38a rehearsal. NEVER MERGE.
   DO $$ BEGIN
     IF EXISTS (SELECT 1 FROM "World") THEN
       RAISE EXCEPTION 'deliberate migration failure (38a rehearsal)';
     END IF;
   END $$;
   ```

2. Push it, **Run workflow** from that branch → `deploy`, `dev`.

✅ `deploy` goes red with `deliberate migration failure`, and `dev-api` was
**never restarted** — 🖥️ `docker ps` shows its "Up" time from before the run.

Clean up: dev's database now records a failed migration, which blocks every
later dev deploy. Re-run **[Step 33](11-dev-environment.md)** (wipe, then restore) — exactly the
procedure dev exists for. Then delete both throwaway branches:

```bash
git push origin --delete 38a-rehearse-broken-start <the migration branch>
```

## Step 44 · 🌐 Roll back from GitHub

1. Find the previous SHA: the title of an older green `deploy` run in
   **Actions**, or 🖥️ `docker images | grep kidlearn-api`.
2. **Run workflow** → job `rollback`, environment `dev`, image_tag `<that SHA>`.

✅ The job is green and 🖥️ `docker compose -p kidlearn-dev images` shows that
SHA. Roll forward again the same way with the newest SHA.

> **Rolling back the API does not roll back the website.** That is Vercel's
> **Instant Rollback**, in a different dashboard ([Step 28c](08-backups-and-smoke-test.md)). Under stress nobody
> remembers the second half — that is why it is written here twice.

## Step 45 · 🌐 Make `promotion-guard` a required check on `main`

**Why:** the rule "only `dev` merges into `main`" is what guarantees every
production change ran on dev first. GitHub rulesets cannot restrict the
*source* branch of a pull request, so the `promotion-guard` job does it — and
it only blocks anything once it is **required**.

**45a. Prove it works first** — 💻:

```bash
git checkout -b 38a-guard-test dev
git commit --allow-empty -m "test: promotion-guard (do not merge)"
git push -u origin 38a-guard-test
gh pr create --base main --head 38a-guard-test --title "promotion-guard test — do not merge" --body "Closes immediately."
gh pr checks          # promotion-guard: fail — "main accepts pull requests from dev only"
gh pr close --delete-branch
```

The next real `dev → main` pull request shows `promotion-guard` **passing**.

**45b. Require it.** GitHub → **Settings → Rules → Rulesets → Protect Main
Branch** (17802318) → **Require status checks to pass** → **Add checks** →
type `promotion-guard` → select it → **Save changes**. Leave everything else in
the ruleset exactly as it is.

*The same ruleset protects `dev` — will `dev` pull requests now be stuck?* No.
On a pull request into `dev`, `promotion-guard` is **skipped** by its `if:`, and
GitHub reports a job skipped by a condition as **Success**. Confirm it on the
next pull request into `dev`: `promotion-guard` must not sit at "Expected —
Waiting for status to be reported".

✅ **Check** — 💻, read it back:

```bash
gh api repos/salmanbd100/kidlearn/rulesets/17802318 --jq '[.rules[].type]'
# ["deletion","non_fast_forward","pull_request","required_status_checks"]  — all four still there
gh api repos/salmanbd100/kidlearn/rulesets/17802318 \
  --jq '.rules[] | select(.type=="required_status_checks") | [.parameters.required_status_checks[].context]'
# ["gates","promotion-guard"]
```

**`deploy` is deliberately not a required check.** If it were, an AWS outage
would block every unrelated pull request.

## Step 46 · 🌐 Turn on `main` — the first fully automatic release

1. A small pull request into `dev` that switches on the `main` push path in
   `deploy` (file 38a step 9). Merge it — that push deploys dev by itself.
2. 🖥️ Note `docker compose -p kidlearn-dev images` and
   `docker compose -p kidlearn-prod images`.
3. Open the `dev → main` pull request. `gates` ✅ and `promotion-guard` ✅ →
   **Merge**.
4. Watch Actions: `gates`, then `deploy` with `ENV_NAME=prod`, assuming
   `kidlearn-deploy-prod`.

✅ **Check:**

- 🖥️ production runs the new SHA; dev's tag is **unchanged** by this run.
- 💻 `curl -s https://api.kidlearn.net/health` is ok.
- 📱 sign in on `kidlearn.net` and reload — still signed in. Same on
  `dev.kidlearn.net`.
- **Two deploys at once wait for each other.** Start a dev deploy and a prod
  deploy within a few seconds of each other (Run workflow twice). Both go green;
  in **Systems Manager → Run Command → Command history**, the second one's
  output starts only after the first one's ended — that is `deploy.sh`'s lock.

**What changes in your weekly routine ([Part 10.1](10-release-life-cycle.md)):** steps 2's `docker build`,
`docker push` and `deploy.sh` disappear. Merging the `dev → main` pull request
**is** the release — Vercel ships the website, the `deploy` job ships the API.
You still repeat [Step 20c](06-server.md) by hand when anything under `deploy/` changes.

**Your AWS access key from [Step 3d](02-accounts.md)** is no longer needed for deploys. Keep it
([Step 14](05-aws-storage-secrets-images.md)'s admin script and your own `aws` checks use it), or **deactivate** it
in IAM and re-activate it when you need it — a deactivated key cannot leak
anything.

**Paperwork:** the runbook sections file 38a adds (branch flow, manual deploy,
rollback, reading SSM output, the backward-compatible-migration rule) are part
of its pull request. Tick file 38a's **Acceptance Criteria**, update file 39's
requirement 6 to name both required checks on `main`, and set the 38a row in the
progress tracker to ✅ Done.

---

[← Previous](11-dev-environment.md) · [Guide index](README.md) · [Next →](troubleshooting.md)
