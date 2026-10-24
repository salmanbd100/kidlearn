# Part 5 — AWS: storage, secrets and images

[← Previous](04-database-and-services.md) · [Guide index](README.md) · [Next →](06-server.md)

> **Where you work:** 🌐 AWS console, 💻 terminal. Steps 12–16.  
> **You finish with:** the backup bucket, every production secret in Parameter Store, your admin account, and the API images in ECR.  
> **Before you start:** Steps 8–11.

Check the region menu says **Mumbai** before every step in this part.

Most AWS services are **regional**: S3 buckets, Parameter Store, ECR and EC2
each keep their own separate list per region. Something created in N. Virginia
or Frankfurt is invisible from Mumbai. The server and `deploy/*.sh` only ever
look in `ap-south-1`. Only IAM ([Step 17](06-server.md)) is **global** and ignores the menu.

| Step | Service | Where the region is chosen |
|---|---|---|
| 12 | S3 | the **AWS Region** field in the Create bucket form |
| 13 | Parameter Store | the region menu, top right |
| 15 | ECR | the region menu, top right |
| 17 | IAM | nowhere: global, shows "Global" in the menu |
| 18 | EC2 | the region menu, top right |

## Step 12 · 🌐 Backup bucket — S3

**Cost:** about $0.10/month, kept that low by the 30-day expiry rule below.

**Why:** Supabase's free plan has no "go back in time". If data is deleted by
mistake, these nightly backups are your only way to get it back.

1. Search **S3** → **Create bucket**.
2. **AWS Region:** **Asia Pacific (Mumbai) ap-south-1**. The form has its own
   region field, so check it even if the menu already says Mumbai.
3. Bucket name: `kidlearn-backups-<something unique>`, e.g.
   `kidlearn-backups-salman-2026`. (Names are unique across the whole world.)
4. **Block all public access:** leave it **ON** (all boxes ticked).
5. **Bucket Versioning:** **Enable**.
6. **Create bucket**.

Now make old backups delete themselves after 30 days, so the cost stays at a
few cents:

7. Open the bucket → **Management** tab → **Create lifecycle rule**.
8. **Lifecycle rule name:** `expire-30-days`.
9. **Choose a rule scope:** **Limit the scope of this rule using one or more
   filters**.
10. **Filter type → Prefix:** `prod/` (no bucket name, no leading `/`). Leave
    **Object tags** empty and both **Object size** boxes unticked — the prefix
    is the only filter needed, and the red "You must specify an object tag or
    another filter" message clears once the prefix is filled in.
11. **Lifecycle rule actions:** tick exactly these two, leave the other three
    unticked:
    - **Expire current versions of objects**
    - **Permanently delete noncurrent versions of objects**
12. **Expire current versions of objects → Days after object creation:** `30`.
13. **Permanently delete noncurrent versions of objects → Days after objects
    become noncurrent:** `30`. Leave **Number of newer versions to retain**
    empty.
14. Check the **Review transition and expiration actions** panel at the bottom:
    it should read **Day 30 · Objects expire** on the left and **Day 30 · All
    other noncurrent versions are permanently deleted** on the right, with no
    red text.
15. **Create rule**.

*Why let the bucket delete old backups instead of the script?* A script that
deletes its own old backups is a script that can, with one bug, delete all of
them. The server is deliberately not allowed to delete finished backups at all
(see the policy in [Step 17](06-server.md)).

✅ **Check:** the bucket is listed with "Objects can be public" **not** shown,
and its **AWS Region** column says **Asia Pacific (Mumbai) ap-south-1**.
Bucket name is in your sheet.

## Step 13 · 💻🌐 Secrets — Parameter Store

**Cost:** $0. Standard-tier parameters and the AWS-managed `alias/aws/ssm` key
are free. (Secrets Manager would be ~$0.40 per secret, ~$6.40/month for these
16.)

**Why:** the API needs about 16 secret values to start. We store them in AWS,
encrypted. The server reads them itself at deploy time (diagram [0.5](00-understand.md)), so no
secret ever sits in GitHub or on your laptop's disk.

**13a. Make two random secrets** — 💻 on your Mac:

```bash
openssl rand -base64 32    # → BETTER_AUTH_SECRET (signs login cookies)
openssl rand -base64 32    # → CRON_SECRET (protects the weekly-report job)
```

Save both in your sheet.

**13b. Store all values** — 🌐 **first look at the region menu, top right: it
must say Asia Pacific (Mumbai) ap-south-1.** Parameter Store has no region field
of its own; every parameter goes into whatever region the menu shows. Then
search **Systems Manager** → left side **Parameter Store** → **Create
parameter**. For **each** row below:

- **Name:** copy exactly, including `/kidlearn/prod/`
- **Tier:** Standard
- **Type:** **SecureString**
- **KMS key source:** My current account → `alias/aws/ssm` (already selected)
- **Value:** the value
- **Create parameter**, then repeat

| Name | Value |
|---|---|
| `/kidlearn/prod/DATABASE_URL` | the `:6543` string from [Step 8](04-database-and-services.md) |
| `/kidlearn/prod/DIRECT_URL` | the `:5432` session pooler string from [Step 8](04-database-and-services.md) |
| `/kidlearn/prod/WEB_ORIGIN` | `https://kidlearn.net` |
| `/kidlearn/prod/BETTER_AUTH_URL` | `https://api.kidlearn.net` |
| `/kidlearn/prod/BETTER_AUTH_SECRET` | first `openssl` value |
| `/kidlearn/prod/CRON_SECRET` | second `openssl` value |
| `/kidlearn/prod/GOOGLE_CLIENT_ID` | `placeholder` (real value in [Step 22](06-server.md)) |
| `/kidlearn/prod/GOOGLE_CLIENT_SECRET` | `placeholder` (real value in [Step 22](06-server.md)) |
| `/kidlearn/prod/CLOUDINARY_CLOUD_NAME` | from [Step 9](04-database-and-services.md) |
| `/kidlearn/prod/CLOUDINARY_API_KEY` | from [Step 9](04-database-and-services.md) |
| `/kidlearn/prod/CLOUDINARY_API_SECRET` | from [Step 9](04-database-and-services.md) |
| `/kidlearn/prod/GEMINI_API_KEY` | from [Step 10](04-database-and-services.md) — optional since file 41; see below |
| `/kidlearn/prod/GOOGLE_TTS_API_KEY` | from [Step 10](04-database-and-services.md) |
| `/kidlearn/prod/BACKUP_S3_BUCKET` | bucket name only, **no** `s3://` |
| `/kidlearn/prod/BACKUP_HEARTBEAT_URL` | backup ping URL from [Step 11](04-database-and-services.md) |
| `/kidlearn/prod/WEEKLY_REPORTS_HEARTBEAT_URL` | weekly ping URL from [Step 11](04-database-and-services.md) |

*Skipping Gemini?* Since file 41 the server boots without `GEMINI_API_KEY`:
admins write content with their own AI assistant over MCP instead, and the CMS
hides the Gemini Generate buttons. SSM will not store an empty value, so to skip
Gemini leave the parameter out entirely and expect **15 names** in the check
below rather than 16. Turning MCP on is one more parameter,
`/kidlearn/prod/MCP_ENABLED` = `true`, which you can add later (`runbook.md`
"AI assistants over MCP"); it adds one name to the check.

*Why placeholders for Google?* The Google sign-in client needs the live
website address to exist first. You come back and replace them in [Step 22](06-server.md).

*What about `NODE_ENV`, `PORT`, `LOG_LEVEL`…?* Those are not secret and are the
same on every deploy, so they live in `deploy/app/compose.yml` instead. The full
list of every variable and its home is `runbook.md` §4.

✅ **Check:** 💻 on your Mac:

```bash
aws ssm get-parameters-by-path --path /kidlearn/prod/ --region ap-south-1 --query 'Parameters[].Name' --output text | tr '\t' '\n' | sort
```

You see **exactly 16 names** (15 if you skipped Gemini; one more for each
optional `MCP_*` parameter you added), spelled as in the table. A typo here shows up much
later as "the server will not start", so look carefully now.

> **Created them in the wrong region?** The check above prints nothing, or
> fewer names than the count above. You do not have to type them again. 💻 on your Mac:
>
> 1. Find the region you used:
>
>    ```bash
>    for r in $(aws ec2 describe-regions --query 'Regions[].RegionName' --output text); do
>      n=$(aws ssm describe-parameters --region "$r" \
>        --parameter-filters Key=Name,Option=BeginsWith,Values=/kidlearn/ \
>        --query 'length(Parameters)' --output text 2>/dev/null)
>      [ -n "$n" ] && [ "$n" != "0" ] && echo "$r: $n parameters"
>    done
>    ```
>
> 2. Copy them into Mumbai. First type `bash` on its own and press Enter. Then
>    paste the block below, with `us-east-1` replaced by the region step 1
>    printed. The values go straight from one region to the other; only the
>    names are printed:
>
>    ```bash
>    FROM=us-east-1
>    aws ssm get-parameters-by-path --path /kidlearn/prod/ --with-decryption \
>      --region "$FROM" --query 'Parameters[].[Name,Value]' --output text \
>      | while IFS=$'\t' read -r n v; do
>          aws ssm put-parameter --region ap-south-1 --name "$n" --value "$v" \
>            --type SecureString --overwrite </dev/null >/dev/null && echo "copied $n"
>        done
>    exit
>    ```
>
> 3. Run the ✅ check again. Once it shows all 16, delete the copies in the
>    wrong region, so you never edit the wrong ones by mistake later. (AWS
>    deletes at most 10 names per call, hence `xargs -n 10`.)
>
>    ```bash
>    FROM=us-east-1        # the same wrong region as in step 2
>    aws ssm get-parameters-by-path --path /kidlearn/prod/ --region "$FROM" \
>      --query 'Parameters[].Name' --output text | tr '\t' '\n' \
>      | xargs -n 10 aws ssm delete-parameters --region "$FROM" --names
>    ```

## Step 14 · 💻 Create your admin account

**Cost:** $0.

**Why:** admins (who approve AI content) cannot sign up on the website — on
purpose. This script is the only way to make one. It needs all the production
secrets, so it reads them from Parameter Store into this terminal only.

**Where to run it:** on your Mac, **inside the kidlearn repo** (any folder in
it works — `pnpm --filter server` finds the workspace root itself). Outside the
repo, `pnpm` fails with "No projects matched the filters". It also needs:

| Needs | Why |
|---|---|
| `pnpm install` already run in the repo | The script is `apps/server/src/scripts/seed-admin.ts`, run by `tsx` from `node_modules` |
| The AWS CLI signed in as `salman-admin` ([Step 3](02-accounts.md)) | The `eval` line reads `/kidlearn/prod/*` from Parameter Store |
| An internet connection | The script connects straight to Supabase |

Paste this into your normal Terminal prompt as **one block**. Keep the space
before `cd`: it keeps the block, password included, out of zsh history.

```bash
 cd ~/Documents/Me/kidlearn && bash <<'EOF'
set -a
eval "$(aws ssm get-parameters-by-path --path /kidlearn/prod/ --with-decryption \
  --recursive --region ap-south-1 --query 'Parameters[].[Name,Value]' --output text \
  | while IFS=$'\t' read -r n v; do printf '%s=%q\n' "${n##*/}" "$v"; done)"
set +a
[ -n "$DATABASE_URL" ] || { echo "No DATABASE_URL — is the AWS CLI signed in?"; exit 1; }
echo "Database: $(echo "$DATABASE_URL" | sed -E 's#(//[^:]*):[^@]*@#\1:***@#')"
ADMIN_EMAIL='you@example.com' \
ADMIN_PASSWORD='<at least 12 characters>' \
ADMIN_NAME='<your name>' \
  pnpm --filter server seed:admin
EOF
```

*Why a heredoc:* everything between `<<'EOF'` and `EOF` runs in a separate
bash process that ends when the block does, so the production secrets vanish
with it and your Terminal stays open. Do **not** paste `bash` and `exit` as
separate lines instead: in zsh, a stray `exit` closes the Terminal window and
the seed's output — including any error — goes with it.

*What that block does, line by line:* `set -a` means "every variable I set from
now on is exported". The long `eval` line asks Parameter Store for every
`/kidlearn/prod/*` value, turns `/kidlearn/prod/DATABASE_URL` into
`DATABASE_URL=…`, and sets it in that bash process only. `set +a` stops
exporting. The `Database:` line prints the host and project ref with the
password hidden — check it is the production Supabase project before trusting
the result. Then the seed script runs with those values.

*Use a password with no `'` in it.* A single quote ends the quoted value early.

> **Behind the scenes — how this works before any server exists**
>
> The script never touches EC2 or a deployed API. It runs the code in your repo,
> on your Mac, and writes straight into the production database, which is
> already there since [Step 8](04-database-and-services.md).
>
> ```
>  your Mac                                           Supabase (Mumbai)
>  pnpm --filter server seed:admin
>    └─ tsx runs apps/server/src/scripts/seed-admin.ts
>         ├─ loads config/env.ts  ◄── the 16 values from Parameter Store
>         ├─ hashes the password the way better-auth does
>         └─ prisma ── DATABASE_URL, over the internet ──────►  admin row saved
>                                                                (tables exist since [Step 8c](04-database-and-services.md))
>
>  later, [Step 23](06-server.md):  EC2 → prod-api ── same DATABASE_URL ─────►  finds the admin row
> ```
>
> - **Supabase is reachable from anywhere,** including your Mac, so the
>   database does not need the server.
> - **No build, no Docker.** `seed:admin` is `tsx src/scripts/seed-admin.ts`.
>   It creates the admin through better-auth's own functions, so the password
>   is stored in the exact format the deployed API checks at sign-in.
> - **Why all 16 secrets:** the script imports `config/auth.ts`, which loads
>   `config/env.ts`, and that refuses to start unless every required variable
>   is set — even Cloudinary or Gemini, which the script never uses. The Google
>   `placeholder` values are fine here: only their presence is checked.
> - **Order matters:** database ([Step 8](04-database-and-services.md)) → secrets (Step 13) → admin (this step)
>   → server (Steps 17–23). Each step needs only what came before it.

✅ **Check:** the script prints `Created admin …` (or `Updated admin …` on a
re-run). It only prints that after re-reading the account and verifying the
password exactly the way sign-in will, so success here means the password works.
Save email and password in your sheet. (Running it again with a new password is
how you reset it.)

Once the server is up ([Step 23](06-server.md)), you can confirm sign-in from
the API itself, without the browser's saved passwords getting in the way (keep
the leading space):

```bash
 curl -s -o /dev/null -w '%{http_code}\n' -X POST https://api.kidlearn.net/api/auth/sign-in/email \
  -H 'Origin: https://kidlearn.net' -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"<the password>"}'
```

`200` means the account works. `401` — see [Troubleshooting](troubleshooting.md).

## Step 15 · 🌐 Image storage — ECR

**Cost:** $0.10 per GB stored per month. One release is about 0.42 GB
compressed (`kidlearn-api` ~167 MB + `kidlearn-migrate` ~251 MB, measured from
local arm64 builds on 2026-10-06), so:

| Releases kept | Stored | $/month |
|---|---|---|
| 1 (first push) | ~0.42 GB | ~0.04 |
| 10 (the cap set below) | at most ~4.2 GB | at most ~0.42 |

The 10-release figure is the ceiling. Releases share unchanged layers (the
Node base image, and the dependencies when the lockfile has not changed), and
ECR stores a shared layer once, so the real bill sits below it. The server
pulling images from ECR in the same region is free.

**Why:** the server does not build code. You build a Docker image on your Mac,
put it in ECR, and the server downloads it from there.

```
 your Mac                         ECR (Mumbai, private)                 EC2 server
 docker build ──docker push──►    kidlearn-api:a1b2c3d     ◄──docker pull── deploy.sh
                                  kidlearn-migrate:a1b2c3d
```

1. **Region first.** Region menu (top right) → **Asia Pacific (Mumbai)
   ap-south-1**. This is required: ECR repositories exist in one region only,
   and Step 16 pushes to `…dkr.ecr.ap-south-1.amazonaws.com`. A repository
   created in any other region is never found.
2. Search **ECR** → **Private registry → Repositories** → **Create repository**.
3. Name `kidlearn-api` → **Create**. Leave every other setting at its default
   (**Mutable**, **AES-256**, scanning untouched).
4. Again: **Create repository** → name `kidlearn-migrate` → **Create**.
   (*Why two?* `kidlearn-api` is the app. `kidlearn-migrate` only updates the
   database tables, and runs only when you ask.)

Keep only the newest 10 images, so storage stays cheap but you can still roll
back. For **each** repository:

5. **Repositories** → click the repository **name** (e.g. `kidlearn-api`) →
   the **Lifecycle policy** tab (between **Images** and **Permissions**) →
   **Create rule** (orange, top right).
6. Fill in the form, top to bottom:
   - **Rule priority** `1`
   - **Rule description** `keep last 10`
   - **Image tag status** **Any**
   - **Image tag filters** leave empty
   - **Match criteria** **Image count** → the number box below it → `10`
   - **Rule action** **Expire** (not Archive — archived images still cost money)
   - **Save**. Ignore the "Destructive action warning": the repository is empty.

   Images past the newest 10 are removed within 24 hours, not at once.

✅ **Check:** two repositories, each showing one rule on its **Lifecycle
policy** tab.

## Step 16 · 💻 Build and upload the images

**Cost:** $0. Uploading into AWS is free; storing the images is counted in
Step 15.

**Why:** this packs the API into images and uploads them to ECR. Your Mac is
ARM (Apple chip) and the server is ARM too, so the build is fast.

On your Mac, in the repo, on `main`, with Docker Desktop open:

```bash
git checkout main && git pull
git status            # must say "nothing to commit, working tree clean"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGISTRY="$ACCOUNT_ID.dkr.ecr.ap-south-1.amazonaws.com"
SHA=$(git rev-parse --short HEAD)

aws ecr get-login-password --region ap-south-1 \
  | docker login --username AWS --password-stdin "$REGISTRY"

docker build --platform linux/arm64 -f apps/server/Dockerfile --target runner \
  -t "$REGISTRY/kidlearn-api:$SHA" .
docker build --platform linux/arm64 -f apps/server/Dockerfile --target migrate \
  -t "$REGISTRY/kidlearn-migrate:$SHA" .

docker push "$REGISTRY/kidlearn-api:$SHA"
docker push "$REGISTRY/kidlearn-migrate:$SHA"

echo "IMAGE TAG = $SHA"
```

*Why the clean tree check?* The image is named after the commit (`SHA`). If you
had unsaved changes, the image would not match the commit, and rolling back to
it later would give you something different.

> **Behind the scenes — what `docker build` does with `apps/server/Dockerfile`**
>
> One Dockerfile, built in stages. Each stage starts from the one before and
> adds a step; `--target` says which stage is the finished image.
>
> ```
>  base           Node 22 (Debian slim) + openssl + pnpm
>   ├─ prune      turbo prune server → only server + the packages it uses
>   └─ deps       pnpm install (cached until a package.json changes)
>       └─ build  pnpm turbo run build --filter=server → dist/
>           ├─ migrate-prune → migrate   ◄── --target migrate
>           │    just packages/db + the Prisma CLI
>           │    runs: prisma migrate deploy
>           └─ prune-runtime → runner    ◄── --target runner
>                production deps only + generated Prisma client
>                runs: node dist/server.js   (as user "node", not root)
> ```
>
> Both images contain **no secrets and no environment name**. The same image
> runs in production and in dev; everything that differs arrives at runtime from
> Parameter Store. That is why one tag (`a1b2c3d`) is enough to describe a
> release, and why rollback is just "run the older tag".

✅ **Check:** in the ECR console each repository shows one image, tagged with
your SHA. Write the SHA in your sheet as **Image tag** — you need it in [Step 23](06-server.md).

---

[← Previous](04-database-and-services.md) · [Guide index](README.md) · [Next →](06-server.md)
