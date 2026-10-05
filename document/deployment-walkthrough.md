# First Deployment — a step-by-step walkthrough

> **What this is.** The part of file 38 that a person has to do by hand, written
> for someone who has not used AWS before. **Almost everything is done on the AWS
> website**, not the command line. Anything in `<angle brackets>` is a value you
> fill in.
>
> **How this differs from `document/runbook.md`.** The runbook is what you open
> when production is down and you are in a hurry. This is what you follow *once*,
> in order, to bring production into existence.
>
> **Design rationale lives in `document/implementation/38-deployment-aws-docker.md`.**
> When this file says "do X", the reason is there.

**Time:** about 6–8 hours, and it does not have to be one sitting. There is a
deliberate checkpoint after Part A where production is live and you can stop.

**Cost:** ≈ $13.73/month once running (the table is in file 38). The budget alarm
in step A1 exists so a mistake cannot quietly become a large bill. Do that step
first.

---

## Before you start

### What runs where

Most of this is clicking through the AWS website. Three things cannot be, and it
is worth knowing which before you start so they do not feel like a mistake:

| Where | What |
|---|---|
| 🌐 **AWS website** | Every piece of AWS setup — budget, S3, secrets, ECR, IAM, EC2, and even the shell on the server |
| 💻 **Your Mac** | Applying database migrations, seeding, and building/pushing the two Docker images. These need the repository and Docker, which only exist on your machine. |
| 🖥️ **The server** | Running the deploy script and starting the containers. You will do this from a **terminal inside the AWS website**, so there is nothing to install. |

Each step below is labelled with one of those three icons.

### Accounts you need

| Account | Cost | Used for |
|---|---|---|
| AWS | ~$13.73/mo | The API server, secrets, container images, backups |
| Cloudflare | free | DNS for `kidlearn.net` |
| Vercel | free (Hobby) | The frontend |
| Supabase | free | The production database |
| Cloudinary | free | Images and audio (a **second**, separate cloud for dev) |
| Google Cloud | free tier | OAuth sign-in, Gemini, Text-to-Speech |
| A domain registrar | ~$10/yr | You must already own `kidlearn.net` |

### Tools on your Mac

You need **Docker** and **pnpm** throughout, and the **AWS CLI** for exactly one
step (A8, pushing the images — there is no way to do that from the website).

```bash
docker version     # Docker Desktop must be running
pnpm --version     # want: 9.x
aws --version      # want: aws-cli/2.x
```

Install what is missing:

- **Docker Desktop**: <https://docs.docker.com/desktop/>
- **AWS CLI**: `brew install awscli`

You do **not** need the Session Manager plugin for this guide — the browser gives
you a shell. Install it only if you would rather work from iTerm:

```bash
brew install --cask session-manager-plugin
```

That also unlocks **real SSH from your own terminal** — `ssh`, `scp`, `rsync`,
VS Code Remote — tunnelled over Session Manager, with no port 22 and no public
exposure. Setup is in `runbook.md` §2a, and it makes step A11 a one-line `rsync`.

Once your AWS account exists (before A1), connect the CLI once (used only in A8):

```bash
aws configure
# AWS Access Key ID:     <see below>
# AWS Secret Access Key: <see below>
# Default region name:   ap-south-1
# Default output format: json
```

To get those two keys: AWS console → click your name (top right) → **Security
credentials** → **Access keys** → **Create access key** → *Command Line Interface
(CLI)*. **The secret is shown once.** Save it in your password manager.

### 🌐 The one console setting that will bite you

**Set the region to `Asia Pacific (Mumbai) ap-south-1` in the dropdown at the top
right of the AWS console, and check it on every page.**

AWS shows you only the things in the currently-selected region. If you create the
server in Mumbai and later look at the console in Ohio, the server appears to
have vanished. When something you definitely made is missing, check the region
first — it is nearly always the region.

### AWS words you will meet

You do not need to understand these deeply, but knowing what they *are* stops
each step feeling arbitrary.

| Word | What it actually is |
|---|---|
| **EC2** | A rented computer. Ours is a `t4g.small`: 2 CPUs, 2 GB RAM, ARM chip. |
| **AMI** | The disk image the computer boots from. We use Amazon Linux 2023. |
| **Elastic IP** | A fixed public address. Without one the address changes whenever the machine restarts, and your DNS silently points at nothing. |
| **Security group** | A firewall. Ours has exactly three rules, all for ports 80 and 443. |
| **IAM role** | Permissions *the machine itself* has, so you never store AWS keys on it. |
| **User data** | A script AWS runs as root the first time the machine boots. Ours installs everything. |
| **Parameter Store** | Where secrets live, encrypted. Free. Part of "Systems Manager". |
| **Session Manager** | A shell on the machine, in your browser. No SSH, no open port 22. |
| **ECR** | AWS's private Docker registry. Your built images live here. |
| **S3** | File storage. Holds the nightly database backups. |

And two non-AWS ones:

| Word | What it actually is |
|---|---|
| **Caddy** | The web server in front of the API. Gets HTTPS certificates automatically. |
| **Let's Encrypt** | The free service Caddy gets certificates from. Strict rate limits — hence the staging step in A13. |

---

# Part A — Production

Production first, completely. A half-finished dev environment must never be the
reason production is not up.

## A1 · 🌐 Budget alarm — do this before anything else

`t4g` machines bill surplus CPU rather than slowing down (file 38 requirement 21).

1. In the search bar at the top, type **Billing** → open **Billing and Cost
   Management**.
2. Left sidebar → **Budgets** → **Create budget**.
3. Choose **Customize (advanced)**, then **Cost budget**.
4. Period **Monthly**, Budget renewal type **Recurring**.
5. Budgeted amount: **20** USD. Name it `kidlearn`.
6. **Add an alert threshold:** 80% of **Actual** cost → your email.
7. **Add a second one:** 100% of **Forecasted** cost → your email.
8. Create.

AWS sends a subscription confirmation email. **Click the link in it**, or the
alarm does nothing.

- [ ] Budget created, both alert emails confirmed

## A2 · 💻 Production database — Supabase

<https://supabase.com/dashboard> → **New project**.

- Organisation: your own
- Name: `kidlearn-production`
- Region: **South Asia (Mumbai)** — beside the API server
- Database password: generate a strong one, save it in your password manager

Then **Project Settings → Database → Connection string**, and take two:

| You need | Which tab | Ends with |
|---|---|---|
| `DATABASE_URL` | **Transaction pooler**, port **6543** | `?pgbouncer=true&connection_limit=5` |
| `DIRECT_URL` | **Direct connection**, port **5432** | nothing extra |

Make sure `DATABASE_URL` really ends with `?pgbouncer=true&connection_limit=5`.
Supabase's copy button sometimes leaves it off. **Not `connection_limit=1`**,
which most guides show — `runbook.md` §4 explains why, and why there are two URLs.

### Create the tables

From the repository root on your Mac, values inline so nothing lands on disk:

```bash
DATABASE_URL="<your DATABASE_URL>" \
DIRECT_URL="<your DIRECT_URL>" \
pnpm --filter @kidlearn/db exec prisma migrate deploy
```

Expect a list ending in the newest directory under `packages/db/prisma/migrations/`
(`ls packages/db/prisma/migrations | tail -2` shows it, above `migration_lock.toml`) and
`All migrations have been successfully applied.`

> `migrate deploy` only applies what is already committed. Never `migrate dev`
> against a deployed database (`runbook.md` §3).

### Seed the content

```bash
DATABASE_URL="<your DATABASE_URL>" \
DIRECT_URL="<your DIRECT_URL>" \
pnpm --filter @kidlearn/db db:seed
```

The admin user comes later, in **A6** — it needs secrets that do not exist yet.

- [ ] Supabase project in Mumbai
- [ ] Migrations applied
- [ ] Seed run
- [ ] Both connection strings saved

> **Free Supabase projects pause when idle** (`runbook.md` §12). If the API cannot
> reach the database weeks from now, check whether the project is paused before
> debugging anything else.

## A3 · 🌐 Production Cloudinary

<https://cloudinary.com> → sign up (free) → **Dashboard**.

Copy **Cloud name**, **API Key**, **API Secret**.

Dev gets a **second, separate** cloud in Part B (file 38 requirement 15).

- [ ] Production cloud created, three values saved

## A4 · 🌐 Backup bucket — S3

1. Search **S3** → **Create bucket**.
2. **Bucket name:** `kidlearn-backups-<something-unique>`. Bucket names are
   globally unique across all of AWS, so add something nobody else would use.
3. **Region:** Asia Pacific (Mumbai) ap-south-1.
4. **Block Public Access:** leave **all four boxes ticked** (the default).
5. **Bucket Versioning:** **Enable**.
6. Create bucket.

Then add the expiry rule so this stays about $0.10/month:

7. Open the bucket → **Management** tab → **Create lifecycle rule**.
8. Name `expire-30-days`. Scope: **Limit the scope using prefix** → `prod/`.
9. Tick **Expire current versions of objects** → **30** days.
10. Tick **Permanently delete noncurrent versions** → **30** days.
11. Create.

**Write the bucket name down.** It goes into Parameter Store in A5.

- [ ] Bucket created: private, versioned, 30-day expiry

## A5 · 🌐 Production secrets — Parameter Store

First, generate the two secrets you invent yourself. On your Mac:

```bash
openssl rand -base64 32   # → BETTER_AUTH_SECRET
openssl rand -base64 32   # → CRON_SECRET
```

You also need two Google keys:

- **`GEMINI_API_KEY`** — <https://aistudio.google.com/apikey>. Free, no billing
  account, one minute.
- **`GOOGLE_TTS_API_KEY`** — Google Cloud Console → **APIs & Services** →
  **Credentials** → **Create credentials** → **API key**. Then **Restrict key** →
  *Cloud Text-to-Speech API*. This one needs a billing account attached.

### Writing them

In the AWS console, search **Systems Manager** → left sidebar → **Parameter
Store** → **Create parameter**. For each row below:

- **Name:** exactly as in the table, including the `/kidlearn/prod/` prefix
- **Tier:** Standard
- **Type:** **SecureString**
- **KMS key source:** My current account, key `alias/aws/ssm` (the default)
- **Value:** the value
- **Create parameter**, then repeat

It is sixteen forms. Tedious, but it is once. The variable-by-variable inventory
is `runbook.md` §4; this table is the production half of its SSM rows.

| Name | Value |
|---|---|
| `/kidlearn/prod/DATABASE_URL` | the pooled `:6543` string from A2 |
| `/kidlearn/prod/DIRECT_URL` | the direct `:5432` string from A2 |
| `/kidlearn/prod/WEB_ORIGIN` | `https://kidlearn.net` |
| `/kidlearn/prod/BETTER_AUTH_URL` | `https://api.kidlearn.net` |
| `/kidlearn/prod/BETTER_AUTH_SECRET` | first `openssl` output |
| `/kidlearn/prod/CRON_SECRET` | second `openssl` output |
| `/kidlearn/prod/GOOGLE_CLIENT_ID` | `placeholder-replaced-in-A15` |
| `/kidlearn/prod/GOOGLE_CLIENT_SECRET` | `placeholder-replaced-in-A15` |
| `/kidlearn/prod/CLOUDINARY_CLOUD_NAME` | from A3 |
| `/kidlearn/prod/CLOUDINARY_API_KEY` | from A3 |
| `/kidlearn/prod/CLOUDINARY_API_SECRET` | from A3 |
| `/kidlearn/prod/GEMINI_API_KEY` | AI Studio key |
| `/kidlearn/prod/GOOGLE_TTS_API_KEY` | Cloud TTS key |
| `/kidlearn/prod/BACKUP_S3_BUCKET` | the bucket name from A4, **no** `s3://` |
| `/kidlearn/prod/BACKUP_HEARTBEAT_URL` | the ping URL of a healthchecks.io check — set up as in `runbook.md` §8 |
| `/kidlearn/prod/WEEKLY_REPORTS_HEARTBEAT_URL` | a second check's ping URL — `runbook.md` §9 (optional, like the one above) |

The two Google OAuth values are placeholders on purpose — you create that client
in A15 and come back to overwrite them.

**Check:** the Parameter Store list should show **16** parameters beginning
`/kidlearn/prod/`. A typo in a name is the most likely mistake here, and it
surfaces much later as "the server will not start".

> **SecureString encrypts with a free AWS-managed key.** You do not need to create
> anything in KMS.

- [ ] All sixteen production parameters written and spelled correctly

## A6 · 💻 The first admin user

The server validates its *entire* environment before doing anything, so this
needs all the values you just stored. This block reads them straight out of
Parameter Store into the current terminal — nothing is written to disk.

```bash
set -a
eval "$(aws ssm get-parameters-by-path --path /kidlearn/prod/ --with-decryption \
  --recursive --region ap-south-1 --query 'Parameters[].[Name,Value]' --output text \
  | while IFS=$'\t' read -r n v; do printf '%s=%q\n' "${n##*/}" "$v"; done)"
set +a

ADMIN_EMAIL="you@example.com" \
ADMIN_PASSWORD="<at least 12 characters>" \
ADMIN_NAME="<your name>" \
pnpm --filter server seed:admin
```

> **That first block puts production secrets into this terminal's environment.**
> They disappear when you close the window. Do not run it in a shared terminal,
> and close the window afterwards.

Admins never self-register — this script is the only way one comes into
existence, and re-running it with a new `ADMIN_PASSWORD` is also the password
reset. **Save the password in your password manager now.**

- [ ] Admin created, password saved

## A7 · 🌐 Image repositories — ECR

Search **ECR** → **Repositories** → make sure you are on **Private** →
**Create repository**. Do this twice:

| Repository name |
|---|
| `kidlearn-api` |
| `kidlearn-migrate` |

Leave the defaults; optionally turn on **Scan on push**.

Then give each one a cleanup rule, so old images do not accumulate:

1. Open the repository → **Lifecycle Policy** tab → **Create rule**.
2. Priority `1`, description `keep the last 10 tagged images`.
3. Image status: **Any**. Match criteria: **Image count more than** → **10**.
4. Save.

Ten is deliberate: a rollback needs the previous image to still be there.

- [ ] Both repositories created, both with a lifecycle rule

## A8 · 💻 Build and push the images

**This is the one step that needs the command line.** There is no way to push a
Docker image from the website.

Your Mac is ARM and so is the server, so these are native builds — fast, no
emulation.

```bash
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

echo "pushed $SHA — write this down, you need it in A14"
```

> If you get lost, the ECR console has a **View push commands** button on each
> repository that shows the same thing filled in with your account number.

Confirm in the console: each repository should now list one image, tagged with
your short commit SHA.

- [ ] Both images visible in ECR
- [ ] SHA written down: `________`

## A9 · 🌐 Permissions for the machine — IAM role

The server needs to read secrets and pull images **without any AWS keys stored on
it**. That is what a role is.

1. Search **IAM** → **Roles** → **Create role**.
2. Trusted entity type: **AWS service**. Use case: **EC2**. Next.
3. Search for and tick **`AmazonSSMManagedInstanceCore`** — this is what gives
   you the browser shell. Next.
4. **Role name:** `kidlearn-instance`. Create role.

> Creating an EC2 role in the console also creates the matching *instance
> profile* automatically. You do not have to do anything about that.

Now add the project-specific permissions:

5. Open the `kidlearn-instance` role → **Add permissions** → **Create inline
   policy** → **JSON** tab.
6. Replace everything in the box with the JSON below, **substituting your account
   number and bucket name**.
7. Next → name it `kidlearn-runtime` → Create policy.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow",
      "Action": ["ecr:GetAuthorizationToken"],
      "Resource": "*" },
    { "Effect": "Allow",
      "Action": ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"],
      "Resource": [
        "arn:aws:ecr:ap-south-1:<ACCOUNT_ID>:repository/kidlearn-api",
        "arn:aws:ecr:ap-south-1:<ACCOUNT_ID>:repository/kidlearn-migrate"
      ] },
    { "Effect": "Allow",
      "Action": ["ssm:GetParametersByPath", "ssm:GetParameter", "ssm:GetParameters"],
      "Resource": [
        "arn:aws:ssm:ap-south-1:<ACCOUNT_ID>:parameter/kidlearn/prod/*",
        "arn:aws:ssm:ap-south-1:<ACCOUNT_ID>:parameter/kidlearn/dev/*"
      ] },
    { "Effect": "Allow",
      "Action": ["kms:Decrypt"],
      "Resource": "*",
      "Condition": { "StringEquals": { "kms:ViaService": "ssm.ap-south-1.amazonaws.com" } } },
    { "Effect": "Allow",
      "Action": ["s3:PutObject"],
      "Resource": "arn:aws:s3:::<BUCKET_NAME>/*" },
    { "Effect": "Allow",
      "Action": ["s3:DeleteObject"],
      "Resource": "arn:aws:s3:::<BUCKET_NAME>/prod/.partial/*" },
    { "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::<BUCKET_NAME>",
        "arn:aws:s3:::<BUCKET_NAME>/*"
      ] }
  ]
}
```

`deploy/backup.sh` promotes a finished dump with `aws s3 mv` (copy, then delete the
`.partial/` source) and cleans up a failed one with `aws s3 rm`, so the role needs
`s3:DeleteObject` — scoped to `prod/.partial/*`, never the whole bucket. Without it
the final copy is written, the delete is denied, and the script pings `/fail` every
night for a backup that exists.

Your account number is on the console's top-right menu, or in the output of
`aws sts get-caller-identity` from A8.

- [ ] Role `kidlearn-instance` exists with both the managed policy and the inline one

## A10 · 🌐 The server — EC2

### Get the startup script ready

Before you start the wizard, open `deploy/bootstrap.sh` from the repository in
your editor and **copy the whole file**. You will paste it into the launch form.
That script installs Docker, Compose, cron, swap and the directory layout on
first boot.

### Launch

Search **EC2** → **Instances** → **Launch instances**.

| Field | What to choose |
|---|---|
| **Name** | `kidlearn` |
| **Application and OS Image** | **Amazon Linux 2023**. Then, in the **Architecture** dropdown just under it, choose **64-bit (Arm)** |
| **Instance type** | `t4g.small` |
| **Key pair** | **Proceed without a key pair (Not recommended)** |

> **Two things people get wrong here.**
> **Architecture must be Arm** — `t4g` is an ARM chip and the x86 image will not
> boot on it. **No key pair is correct** — that is for SSH, which we deliberately
> do not use. You get a shell through the browser instead.

**Network settings** → **Edit**:

- **Create security group**, name it `kidlearn-edge`
- Remove the SSH rule the wizard adds by default
- Add three inbound rules, all with source **Anywhere-IPv4 `0.0.0.0/0`**:

| Type | Protocol | Port | Why |
|---|---|---|---|
| Custom TCP | TCP | 80 | Certificate validation, and the redirect to HTTPS |
| HTTPS | TCP | 443 | The actual traffic |
| Custom UDP | UDP | 443 | HTTP/3 |

> **There must be no port 22 rule.** If the wizard added "SSH" by default, delete
> that row. A shell arrives through Session Manager instead — nothing to leak, no
> brute-force surface, and every session is logged.

**Configure storage:** change the volume to **20 GiB**, type **gp3**.

**Advanced details** (expand it — it is collapsed by default):

- **IAM instance profile:** `kidlearn-instance`
- **User data:** paste the entire contents of `deploy/bootstrap.sh`

Then **Launch instance**.

### Give it a fixed address

The address a new instance gets changes whenever it stops and starts, which would
silently break your DNS. An Elastic IP is a permanent one.

1. EC2 → left sidebar → **Elastic IPs** → **Allocate Elastic IP address** →
   Allocate.
2. Select it → **Actions** → **Associate Elastic IP address**.
3. Resource type **Instance**, choose `kidlearn`, Associate.

**Write down the Elastic IP and the Instance ID.** Both go into the runbook, and
the IP goes into DNS in A12.

> An Elastic IP is billed whether or not it is attached (file 38 cost table). Do
> not allocate spares "just in case".

- [ ] Instance running with the role and the user-data script
- [ ] Security group has 80/tcp, 443/tcp, 443/udp and **no** port 22
- [ ] Elastic IP attached
- [ ] Instance ID: `________` · Elastic IP: `________`

## A11 · 🌐 Open a shell, and put `deploy/` on the box

Wait two or three minutes after launch so `bootstrap.sh` can finish.

**EC2 → Instances → tick `kidlearn` → Connect (button at the top) → Session
Manager tab → Connect.**

A black terminal opens in a browser tab. That is a real shell on the server.

> **If the Session Manager tab says it cannot connect,** the instance is still
> booting, or the IAM role is not attached. Wait two minutes and retry; if it
> persists, check that A9's role really is on the instance
> (**Actions → Security → Modify IAM role**).

You land as `ssm-user`. Become root and check the startup script worked:

```bash
sudo su -
docker --version && docker compose version
systemctl is-active crond      # active
ls /opt/kidlearn               # deploy  dev  prod
free -m                        # a Swap row with about 2 GB
```

If any of those is wrong, read `/var/log/cloud-init-output.log` — that is the
startup script's own output, and it will say where it stopped.

### Copy the deploy scripts over

The startup script creates `/opt/kidlearn/deploy` but deliberately leaves it
empty. Fill it with one of the three methods in `runbook.md` §3, "Putting
`deploy/` on the box" — `git clone` on the box is the simplest first time. Redo it
whenever anything in `deploy/` changes.

- [ ] Browser shell works
- [ ] Docker, Compose, cron and swap all present
- [ ] `deploy/` copied and executable

## A12 · 🌐 DNS — Cloudflare

Add `kidlearn.net` to Cloudflare, then change the nameservers at your registrar
to the two Cloudflare gives you. Propagation is usually minutes, occasionally
hours.

For now add only the `api` and `api.dev` A records from `runbook.md` §5, pointing
at your Elastic IP. The Vercel ones come in A16, once Vercel has told you its
targets.

> **Grey cloud, not orange, on every record in this project** (`runbook.md` §5
> says why). This is the single most common way this step goes wrong. Click the
> orange cloud icon to turn it grey.

Check from your Mac before moving on:

```bash
dig +short api.kidlearn.net       # your Elastic IP, and nothing else
dig +short api.dev.kidlearn.net   # the same
```

If either returns something starting `104.` or `172.67.`, that is Cloudflare's
proxy — the cloud is still orange. Fix it and wait a minute.

- [ ] Nameservers delegated to Cloudflare
- [ ] Both `api` records resolve to your Elastic IP, grey cloud

## A13 · 🖥️ HTTPS — Caddy, carefully

Caddy asks Let's Encrypt for a real certificate the instant it starts, with no
practice mode, so the Caddyfile ships pointing at the **staging** service
(`runbook.md` §6 has the rate-limit reasoning). You verify there, then switch.

### 1. Start on staging

In the browser terminal:

```bash
sudo su -
cd /opt/kidlearn/deploy/edge
docker compose -p kidlearn-edge -f compose.yml up -d
docker compose -p kidlearn-edge logs --tail 40 caddy
```

### 2. Confirm it worked

From your Mac:

```bash
curl -sI https://api.kidlearn.net/health
# A CERTIFICATE ERROR HERE IS SUCCESS. Staging certificates are untrusted
# on purpose — seeing the error proves Caddy completed the process.

curl -skI https://api.kidlearn.net/health | head -1
# HTTP/2 502   ← also correct: Caddy is up, the API is not deployed yet
```

A **502** means HTTPS worked and Caddy could not find the API behind it. That is
exactly right at this point in the guide.

A **timeout** instead means DNS or the security group is wrong. **Do not go to
step 3 until the two commands above behave as described.**

### 3. Switch to real certificates

```bash
sudo su -
cd /opt/kidlearn/deploy/edge
nano Caddyfile
```

Find the line starting `acme_ca https://acme-staging-v02...` and put a `#` at the
start of it. Save with `Ctrl-O`, `Enter`, then exit with `Ctrl-X`.

```bash
docker compose -p kidlearn-edge -f compose.yml up -d --force-recreate
```

Then from your Mac, with no `-k` this time:

```bash
curl -sI https://api.kidlearn.net/health | head -1
# HTTP/2 502, and NO certificate warning
```

> **Write in `runbook.md` §6 that the box is now on the production endpoint.**
> Future you will need to know which one it is on.

> ⚠️ **Never delete the `caddy_data` Docker volume** — see `runbook.md` §6.

- [ ] Staging certificate confirmed (certificate error + 502)
- [ ] Switched to real certificates, no warning
- [ ] Recorded which endpoint in the runbook

## A14 · 🖥️ Deploy the API

In the browser terminal:

```bash
sudo su -
/opt/kidlearn/deploy/deploy.sh prod <the SHA from A8>
```

You will watch it fetch the parameters, write its two env files, log in to ECR,
pull the image, start the container and poll for health. Success ends with:

```
[deploy:prod] healthy — deploy complete at <sha>
```

Now prove the migration path works. There is nothing pending — you applied the
migrations from your Mac in A2 — but you will need this exact command for every
future schema change, so run the migrate command from `runbook.md` §3 once now
while nothing depends on it. Expect `No pending migrations to apply.`

Verify from your Mac:

```bash
curl -s https://api.kidlearn.net/health
# {"data":{"status":"ok","uptime":...}}

curl -s -o /dev/null -w '%{http_code}\n' https://api.kidlearn.net/docs
# 404 — API docs are deliberately off in production
```

- [ ] `deploy.sh prod` reported healthy
- [ ] `/health` returns the envelope over real HTTPS
- [ ] `/docs` returns 404
- [ ] The migrate container runs cleanly

## A15 · 🌐 Google OAuth — the production client

Google Cloud Console → **APIs & Services** → **Credentials** → **Create
credentials** → **OAuth client ID** → Application type **Web application**.

- Name: `kidlearn production`
- Origins and redirect URI: the "new (production)" row of `runbook.md` §13

This is a **brand new** client, separate from the one you already use locally
(file 38 requirement 14).

Now replace the two placeholders. In **Systems Manager → Parameter Store**, open
each one → **Edit** → paste the real value → Save:

- `/kidlearn/prod/GOOGLE_CLIENT_ID`
- `/kidlearn/prod/GOOGLE_CLIENT_SECRET`

The running container still has the old values, so redeploy to pick them up — in
the browser terminal:

```bash
sudo su -
/opt/kidlearn/deploy/deploy.sh prod <same SHA>
```

- [ ] Production OAuth client created
- [ ] Both parameters overwritten, API redeployed

## A16 · 🌐 The frontend — Vercel production project

<https://vercel.com/new> → import the `kidlearn` repository.

**Settings → General:** the settings table in `runbook.md` §10 (root directory with
*Include source files outside of the Root Directory* ticked, the Turbo build
command, the install command, region `bom1`).

**Settings → Git:** Production Branch = **`main`**.

**Settings → Environment Variables**, Production scope: the three build-time
Vercel rows of `runbook.md` §4 (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`,
`MEDIA_ASSET_HOSTS`), production column. Leave `SITE_NOINDEX` and
`DEV_SITE_BASIC_AUTH` **unset** — they are dev-only. They are baked in at build
time, so editing one later needs a **redeploy**.

**Settings → Domains:** add `kidlearn.net` and `www.kidlearn.net`. Vercel shows
you what to put in DNS; add the apex and `www` records from `runbook.md` §5 in
Cloudflare, **grey cloud**, taking the values from Vercel on the day.

Deploy, and then **read the first build log**. Confirm `@kidlearn/types` builds
before `web` (`runbook.md` §10).

Finally, **Settings → Notifications:** turn on usage notifications and record the
ceilings in `runbook.md` §10 (Hobby pauses rather than charges).

- [ ] Project configured, production branch `main`
- [ ] Three variables set
- [ ] Both domains live, grey cloud
- [ ] First build log confirms `@kidlearn/types` built first
- [ ] Usage notifications on

## A17 · 🖥️ Scheduled jobs

In the browser terminal:

```bash
sudo su -
systemctl is-active crond     # must say: active
crontab -e
```

That opens an editor. Add the backup entry (`runbook.md` §8) and the
weekly-reports entry (`runbook.md` §9), including the `CRON_TZ=Asia/Dhaka` line.
Save and exit (`Ctrl-O`, `Enter`, `Ctrl-X` if it is nano).

**Now run the backup once by hand** — an unrehearsed backup is a guess:

```bash
/opt/kidlearn/deploy/backup.sh
# [backup] dumping production → s3://<bucket>/prod/<timestamp>.sql.gz
# [backup] wrote ... (NNNNNN bytes)
```

Check the object really appeared in the S3 console, under `prod/` and not
`prod/.partial/` — the script moves it there only once the dump has finished. If
the script reports a size under 1 KB it fails on purpose — that is a compressed
*empty* dump, not a backup. The healthchecks.io check should show a green ping;
if it does not, the `BACKUP_HEARTBEAT_URL` parameter is wrong or unset.

- [ ] `crond` active, both entries added
- [ ] `backup.sh` ran by hand and produced a real object in S3

## A18 · Production smoke test — **checkpoint**

Run the smoke test in `runbook.md` §14 against production: the curl checks from
your Mac, then the seven steps on a real phone against `https://kidlearn.net`.
Step 7 — reload and stay signed in — is the one that proves the proxy and cookie
settings are right.

- [ ] The curl checks pass
- [ ] All seven phone steps pass

> ## 🎉 Production is live. This is a good place to stop.
> Part B can wait for another day.

---

# Part B — Development

Same server, same Caddy, separate everything else: its own database container,
its own keys, its own secrets.

## B1 · 🌐 Separate free accounts

- **Gemini:** a second key at <https://aistudio.google.com/apikey>. One minute,
  no billing account.
- **Cloudinary:** a second free cloud.
- **Google Cloud TTS:** **reuse the production key.** Why, and the lower dev job
  caps that bound its spend: file 38 requirement 15.

- [ ] Dev Gemini key and dev Cloudinary cloud created

## B2 · 🌐 Dev secrets — Parameter Store

On your Mac, generate three new values:

```bash
openssl rand -base64 32   # → a DIFFERENT BETTER_AUTH_SECRET
openssl rand -base64 32   # → a DIFFERENT CRON_SECRET
openssl rand -base64 24   # → POSTGRES_PASSWORD
```

> **Every one of these must differ from production.** A shared
> `BETTER_AUTH_SECRET` would let a login cookie from one environment be accepted
> by the other, which defeats the point of having two.

Same **Systems Manager → Parameter Store → Create parameter** form as A5,
fourteen more times. Everything is **SecureString**.

Build the dev database URL first, because three rows use it. With your
`POSTGRES_PASSWORD` substituted in, it is:

```
postgresql://kidlearn:<POSTGRES_PASSWORD>@dev-postgres:5432/kidlearn
```

| Name | Value |
|---|---|
| `/kidlearn/dev/DATABASE_URL` | the URL above |
| `/kidlearn/dev/DIRECT_URL` | **the same URL again** |
| `/kidlearn/dev/POSTGRES_PASSWORD` | the `base64 -24` output on its own |
| `/kidlearn/dev/WEB_ORIGIN` | `https://dev.kidlearn.net` |
| `/kidlearn/dev/BETTER_AUTH_URL` | `https://api.dev.kidlearn.net` |
| `/kidlearn/dev/BETTER_AUTH_SECRET` | different from production |
| `/kidlearn/dev/CRON_SECRET` | different from production |
| `/kidlearn/dev/GOOGLE_CLIENT_ID` | your **existing** local/dev client id |
| `/kidlearn/dev/GOOGLE_CLIENT_SECRET` | your **existing** local/dev client secret |
| `/kidlearn/dev/CLOUDINARY_CLOUD_NAME` | dev cloud |
| `/kidlearn/dev/CLOUDINARY_API_KEY` | dev cloud |
| `/kidlearn/dev/CLOUDINARY_API_SECRET` | dev cloud |
| `/kidlearn/dev/GEMINI_API_KEY` | dev AI Studio key |
| `/kidlearn/dev/GOOGLE_TTS_API_KEY` | **the same key as production** |

> **The dev database URL carries no `?pgbouncer=true` and no `connection_limit`**
> — `runbook.md` §4 says why. Copying production's URL shape here is the obvious
> mistake.

**Check:** fourteen parameters beginning `/kidlearn/dev/`.

- [ ] All fourteen dev parameters, with genuinely different secrets

## B3 · 🖥️ Add the dev hostname to Caddy

The Caddyfile already contains the `api.dev.kidlearn.net` block, so there is
nothing to edit — just make sure the copy on the box is current (A11), then
restart Caddy so it picks up the second hostname and gets its certificate:

```bash
sudo su -
cd /opt/kidlearn/deploy/edge
docker compose -p kidlearn-edge -f compose.yml up -d --force-recreate
docker compose -p kidlearn-edge logs --tail 30 caddy
```

- [ ] `api.dev.kidlearn.net` has a certificate

## B4 · 🖥️ Deploy the dev API and its database

```bash
sudo su -
/opt/kidlearn/deploy/deploy.sh dev <the same SHA as production>
```

One image serves both environments — everything that differs is configuration.

Create the schema in the new Postgres container with the migrate command from
`runbook.md` §3, using its dev flags (`dev/compose.env` and `compose.dev.yml`).

Now **restore the production backup into it** — `runbook.md` §8, "Restore". Find
the newest object with `aws s3 ls s3://<your bucket>/prod/` first. It gives dev
realistic data *and* rehearses the restore you will one day need for real, which
is the only way to know the backup works. Read the strict-mode and
children's-data notes there before running it.

Verify:

```bash
curl -s  https://api.dev.kidlearn.net/health          # the envelope
curl -si https://api.dev.kidlearn.net/docs | head -1  # 200 — docs are ON in dev
ss -tlnp                                              # ONLY Caddy, on 80 and 443
free -m                                               # about 700 MB available
docker stats --no-stream                              # dev containers capped at 400 MiB
```

If `ss -tlnp` shows anything besides Caddy listening, the Postgres container has
published a port it should not have (the commands are `runbook.md` §2).

- [ ] Dev API healthy, `/docs` loads
- [ ] Production backup restored into dev — **the restore is now rehearsed**
- [ ] No unexpected listening ports

## B5 · 🌐 Dev Vercel project

A **second** Vercel project from the same repository. All the settings from A16,
with three differences:

- **Settings → Git:** Production Branch = **`dev`**
- **Domains:** `dev.kidlearn.net` only, with the `dev` CNAME from `runbook.md` §5
  for **this** project's `*.vercel-dns.com` target, **grey cloud**
- **Environment Variables:** all five Vercel rows of `runbook.md` §4, development
  column. `DEV_SITE_BASIC_AUTH` is `dev:<a password you choose>`; save it in your
  password manager (its only home is this project — `runbook.md` §13).

- [ ] Dev project tracks `dev`, five variables set, domain live

## B6 · 🌐 Extend the existing OAuth client

Edit your **existing** (local/dev) Google OAuth client so it carries every entry
in the "existing (local + dev)" row of `runbook.md` §13 — add the `dev` ones and
keep the localhost ones. Do not touch the production one you made in A15.

- [ ] Dev entries added to the existing client

## B7 · Dev smoke test

Run the dev lines of `runbook.md` §14 (`401` on the web host, `200` and noindex
on the API host).

Then in a browser:

1. `https://dev.kidlearn.net` asks for a username and password.
2. Your `DEV_SITE_BASIC_AUTH` credentials get you in.
3. Sign in with Google — **and it does not ask again part-way through.** The
   callback lands on the API host, which deliberately has no password gate.
4. Reload — still signed in.

Then prove the two environments really are separate with the bundle check in
`runbook.md` §4: the dev site must show nothing for the production API host. If
it matches, the dev Vercel project was built with production's
`NEXT_PUBLIC_API_URL` — that is a dev build writing to the **production
database**, and it looks like a CORS error rather than what it is.

- [ ] All dev checks pass
- [ ] The dev site calls its own API host

---

# Part C — Finish

- [ ] Fill in every `<placeholder>` in `document/runbook.md`: registrar,
      Cloudflare account, Elastic IP, instance ID, bucket name, which ACME
      endpoint, Vercel's ceilings and the date you checked them, and the date of
      the restore rehearsal
- [ ] Delete the **⬜ not yet done** markers from the runbook sections you have
      now actually done
- [ ] Set the file 38 row in `document/implementation/00-progress-tracker.md` to
      **✅ Done** and remove its status note
- [ ] Check the AWS Budgets figure after a full day — it should be within ~10% of
      $13.73/month

---

# When it goes wrong

Ordered by how likely you are to hit it.

**Something you definitely created is missing from the console.**
Check the region dropdown at the top right. It needs to say **Asia Pacific
(Mumbai) ap-south-1**. This is the most common AWS confusion there is.

**The Vercel build fails saying `@kidlearn/types` has no `dist`.**
The build command is not going through Turbo — see the settings table in
`runbook.md` §10.

**`dev.kidlearn.net` behaves like production, or you see CORS errors.**
Almost never actually CORS. `NEXT_PUBLIC_*` values are baked in at build time, so
the dev project was built with a production value. Fix it and **redeploy**.
Confirm with the bundle check in `runbook.md` §4.

**Caddy never gets a certificate.**
In order: is the Cloudflare cloud **grey**? Does `dig +short` return your Elastic
IP? Is port **80** open in the security group? Certificate validation happens over
port 80 even though the result is an HTTPS certificate.

**`deploy.sh` says "no parameters found".**
The role cannot read Parameter Store, or the parameters are in a different
region. Check both: the parameter names in the console (a typo in the path is
common), and that A9's inline policy has your real account number in it.

**The container starts but every database query fails.**
Almost certainly the connection string. Check it went into Parameter Store
intact, and read values from Parameter Store rather than `app.env` on the box
(`runbook.md` §4 explains the doubled `$`).

**The browser Session Manager tab will not connect.**
The instance is still booting, or the IAM role is not attached
(**Actions → Security → Modify IAM role**). The fix is never to open port 22.

**`ssh kidlearn` hangs or says "Connection closed".**
In order: is `session-manager-plugin` installed (`session-manager-plugin` should
print a version)? Is `HostName` the **instance ID** and not the Elastic IP? Does
plain `aws ssm start-session --target <instance-id>` work? If that works and SSH
does not, the public key is not in `ec2-user`'s `authorized_keys` — redo that
part of `runbook.md` §2a.

**A deploy fails and you need to go back.**
Roll back **both halves**, API and frontend — `runbook.md` §3, "Rollback".

**A migration was wrong.**
Migrations are forward-only (`runbook.md` §3). On **dev only** you can start over
— `runbook.md` §7 has the wipe-and-reseed command.

---

# Things that cost money or lock you out

Each is explained where it lives: deleting `caddy_data` or switching to real
certificates before staging works (`runbook.md` §6); orange-cloud DNS records
(`runbook.md` §5); reusing a secret between production and dev (B2), or putting
the production OAuth client into dev (`runbook.md` §13); unattached Elastic IPs
(A10); `prisma migrate dev` against a deployed database (`runbook.md` §3); skipping
the budget alarm (A1); and adding a port 22 rule (`runbook.md` §2 — real `ssh`,
`scp` and `rsync` already work over Session Manager).
