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

**Cost:** ~$13.75/month once running. The budget alarm in step A1 exists so a
mistake cannot quietly become a large bill. Do that step first.

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
| AWS | ~$13.75/mo | The API server, secrets, container images, backups |
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

After A2 creates your AWS account, connect the CLI once (used only in A8):

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
| **Security group** | A firewall. Ours lets in exactly three things: ports 80 and 443. |
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

`t4g` machines bill surplus CPU rather than slowing down, which is right for a
live site but only with an alarm behind it.

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
| `DATABASE_URL` | **Transaction pooler**, port **6543** | `?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | **Direct connection**, port **5432** | nothing extra |

Make sure `DATABASE_URL` really ends with `?pgbouncer=true&connection_limit=1`.
Supabase's copy button sometimes leaves it off.

**Why two:** the running app uses the pooled one (many short connections);
migrations use the direct one (one long connection, which the pooler would kill).

### Create the tables

From the repository root on your Mac, values inline so nothing lands on disk:

```bash
DATABASE_URL="<your DATABASE_URL>" \
DIRECT_URL="<your DIRECT_URL>" \
pnpm --filter @kidlearn/db exec prisma migrate deploy
```

Expect a list ending in `20260910000000_content_visibility_indexes_and_session_child_fk`
and `All migrations have been successfully applied.`

> **Never run `prisma migrate dev` against a deployed database.** It can wipe it.
> `migrate deploy` only applies what is already committed.

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

> **Free Supabase projects pause after 7 days with no activity.** That matters
> between today and launch, not after real traffic. If the API cannot reach the
> database weeks from now, check whether the project is paused before debugging
> anything else.

## A3 · 🌐 Production Cloudinary

<https://cloudinary.com> → sign up (free) → **Dashboard**.

Copy **Cloud name**, **API Key**, **API Secret**.

You will create a **second, separate** cloud for dev in Part B. Do not reuse this
one — test uploads would show up in the production media library as real assets.

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

It is fourteen forms. Tedious, but it is once.

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

The two Google OAuth values are placeholders on purpose — you create that client
in A15 and come back to overwrite them.

**Check:** the Parameter Store list should show **14** parameters beginning
`/kidlearn/prod/`. A typo in a name is the most likely mistake here, and it
surfaces much later as "the server will not start".

> **SecureString encrypts with a free AWS-managed key.** You do not need to create
> anything in KMS, and Parameter Store's Standard tier is free up to 10,000
> parameters. This whole project uses about 28.

- [ ] All fourteen production parameters written and spelled correctly

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
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::<BUCKET_NAME>",
        "arn:aws:s3:::<BUCKET_NAME>/*"
      ] }
  ]
}
```

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

> An Elastic IP costs $3.65/month whether or not it is attached — one of only two
> things here that cost real money. Do not allocate spares "just in case".

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
empty. Two ways to fill it — pick one.

**Option 1 — `git clone` on the box.** Nothing to set up; the repository is
public. Still as root, in the same browser terminal:

```bash
dnf install -y git
git clone https://github.com/salmanbd100/kidlearn.git /tmp/kidlearn
cp -r /tmp/kidlearn/deploy/. /opt/kidlearn/deploy/
chmod +x /opt/kidlearn/deploy/*.sh
rm -rf /tmp/kidlearn

ls /opt/kidlearn/deploy
# app  backup.sh  bootstrap.sh  deploy.sh  edge  weekly-reports.sh
```

This copies whatever is on `main`, so it will not include uncommitted local
changes.

**Option 2 — `rsync` from your Mac.** Needs the SSH setup in `runbook.md` §2a
first (fifteen minutes, once), and then copies *your working tree* — which is
what you want while `deploy/` is still changing:

```bash
rsync -az --delete deploy/ kidlearn:/tmp/deploy/
ssh kidlearn 'sudo cp -r /tmp/deploy/. /opt/kidlearn/deploy/ \
  && sudo chmod +x /opt/kidlearn/deploy/*.sh && rm -rf /tmp/deploy'
```

Re-running that one pair of commands is the whole update procedure, which is why
it is worth setting up if you expect to iterate.

> ⚠️ **Redo this whenever anything in `deploy/` changes in the repository.**
> Nothing synchronises it automatically until file 38a builds a pipeline. If a
> deploy behaves like an older version of the scripts, this is why.

- [ ] Browser shell works
- [ ] Docker, Compose, cron and swap all present
- [ ] `deploy/` copied and executable

## A12 · 🌐 DNS — Cloudflare

Add `kidlearn.net` to Cloudflare, then change the nameservers at your registrar
to the two Cloudflare gives you. Propagation is usually minutes, occasionally
hours.

For now add only the two API records. The Vercel ones come in A16, once Vercel
has told you its targets.

| Name | Type | Content | Proxy status |
|---|---|---|---|
| `api` | A | `<your Elastic IP>` | **DNS only (grey cloud)** |
| `api.dev` | A | `<your Elastic IP>` | **DNS only (grey cloud)** |

> **Grey cloud, not orange, on every record in this project.** Orange-cloud
> proxying puts a second HTTPS layer in front of Caddy and breaks the certificate
> process. This is the single most common way this step goes wrong. Click the
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

Caddy asks Let's Encrypt for a real certificate the instant it starts. There is
no practice mode, and **Let's Encrypt allows only 5 certificates per domain per
week**. A wrong DNS record burns them silently, and you then have no HTTPS until
the limit resets.

So the Caddyfile ships pointing at Let's Encrypt's **staging** service, where
mistakes are free. You verify there, then switch.

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

> ⚠️ **Never delete the `caddy_data` Docker volume**, and never run
> `docker volume prune` on this box without reading what it would remove. That
> volume holds your certificates. Losing it re-requests them and can hit the
> weekly limit.

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
future schema change, so run it once now while nothing depends on it:

```bash
cd /opt/kidlearn/deploy/app
docker compose --env-file /opt/kidlearn/prod/compose.env \
  -p kidlearn-prod -f compose.yml --profile migrate run --rm migrate
# "No pending migrations to apply."
```

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
- **Authorised JavaScript origins:** `https://kidlearn.net`
- **Authorised redirect URIs:** `https://api.kidlearn.net/api/auth/callback/google`

This is a **brand new** client, separate from the one you already use locally.
One client covering both would put the production secret inside a dev environment
that is deliberately less locked down.

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

**Settings → General:**

| Setting | Value |
|---|---|
| Root Directory | `apps/web` — and **tick** *Include source files outside of the Root Directory* |
| Build Command | `cd ../.. && pnpm turbo run build --filter=web` |
| Install Command | `pnpm install --frozen-lockfile` |
| Function Region | `bom1` (Mumbai) |

**Settings → Git:** Production Branch = **`main`**.

**Settings → Environment Variables**, Production scope:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.kidlearn.net` |
| `NEXT_PUBLIC_SITE_URL` | `https://kidlearn.net` |
| `MEDIA_ASSET_HOSTS` | `https://res.cloudinary.com` |

Leave `SITE_NOINDEX` and `DEV_SITE_BASIC_AUTH` **unset** here — they are dev-only.

**Settings → Domains:** add `kidlearn.net` and `www.kidlearn.net`. Vercel shows
you what to put in DNS. Add those in Cloudflare, **grey cloud**:

| Name | Type | Content |
|---|---|---|
| `kidlearn.net` | A | the apex address Vercel shows |
| `www` | CNAME | the `*.vercel-dns.com` target Vercel shows |

Take those values from Vercel on the day — they have changed before.

Deploy, and then **read the first build log**. Confirm `@kidlearn/types` builds
before `web`. That is the single most likely thing to fail here: `apps/web`
imports it, and a plain `next build` cannot produce it.

> **`NEXT_PUBLIC_*` values are baked into the browser bundle when the site is
> built.** Editing one in the Vercel dashboard changes nothing until you
> **redeploy**.

Finally, **Settings → Notifications:** turn on usage notifications. Hobby has no
overage billing — going over a limit *pauses the project* rather than charging
you, so production availability depends on a free tier with a hard stop.

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

That opens an editor. Add these five lines:

```cron
CRON_TZ=Asia/Dhaka
# Nightly production database dump → S3
30 1 * * *  /opt/kidlearn/deploy/backup.sh
# Weekly parent reports, Mondays 02:00
0 2 * * 1   /opt/kidlearn/deploy/weekly-reports.sh
```

Save and exit (`Ctrl-O`, `Enter`, `Ctrl-X` if it is nano).

**Now run the backup once by hand** — an unrehearsed backup is a guess:

```bash
/opt/kidlearn/deploy/backup.sh
# [backup] dumping production → s3://<bucket>/prod/<timestamp>.sql.gz
# [backup] wrote ... (NNNNNN bytes)
```

Check the object really appeared in the S3 console. If the script reports a size
under 1 KB it fails on purpose — that is a compressed *empty* dump, not a backup.

- [ ] `crond` active, both entries added
- [ ] `backup.sh` ran by hand and produced a real object in S3

## A18 · Production smoke test — **checkpoint**

From your Mac:

```bash
curl -s  https://api.kidlearn.net/health            # {"data":{"status":"ok",…}}
curl -si https://api.kidlearn.net/docs | head -1    # 404
curl -si https://kidlearn.net | grep -i x-robots    # nothing at all
```

Then **on a real phone**, against `https://kidlearn.net`:

1. Sign in with Google.
2. The parent area opens on consent alone — **there is no PIN step.** If it asks
   for a PIN, you deployed an image older than 2026-09-09.
3. Create a child profile.
4. Play a seeded lesson through all five steps, with audio.
5. The parent dashboard shows the learning time you just spent.
6. `/admin/ai-queue` loads for your admin user and lists and filters jobs.
7. **Reload the page — you are still signed in.**

Step 7 is the one that proves the proxy and cookie settings are right. If you get
logged out on reload, that is the thing to investigate.

- [ ] All three curl checks pass
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
- **Cloudinary:** a second free cloud. Keeps test uploads out of the production
  media library.
- **Google Cloud TTS:** **reuse the production key.** It needs a billing account
  attached and a second one is friction for no isolation gain. Dev's audio limit
  is cut to 20/day instead, to bound what it can spend.

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

> **The dev database URL carries neither `?pgbouncer=true` nor
> `connection_limit=1`.** Those exist for Supabase's connection pooler. Against
> the plain Postgres container they actively hurt: one disables prepared
> statements, the other serialises the entire app through a single connection.
> Copying production's URL shape here is the obvious mistake and it costs an
> afternoon.

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

Create the schema in the new Postgres container:

```bash
cd /opt/kidlearn/deploy/app
docker compose --env-file /opt/kidlearn/dev/compose.env \
  -p kidlearn-dev -f compose.yml -f compose.dev.yml \
  --profile migrate run --rm migrate
```

Now **restore the production backup into it.** This gives dev realistic data
*and* rehearses the restore you will one day need for real — which is the only
way to know the backup works:

```bash
aws s3 ls s3://<your bucket>/prod/          # find the newest file
aws s3 cp s3://<your bucket>/prod/<filename> - | gunzip \
  | docker exec -i dev-postgres psql -U kidlearn -d kidlearn
```

Verify:

```bash
curl -s  https://api.dev.kidlearn.net/health          # the envelope
curl -si https://api.dev.kidlearn.net/docs | head -1  # 200 — docs are ON in dev
ss -tlnp                                              # ONLY Caddy, on 80 and 443
free -m                                               # about 700 MB available
docker stats --no-stream                              # dev containers capped at 400 MiB
```

If `ss -tlnp` shows anything besides Caddy listening, the Postgres container has
published a port it should not have.

- [ ] Dev API healthy, `/docs` loads
- [ ] Production backup restored into dev — **the restore is now rehearsed**
- [ ] No unexpected listening ports

## B5 · 🌐 Dev Vercel project

A **second** Vercel project from the same repository. All the settings from A16,
with three differences:

- **Settings → Git:** Production Branch = **`dev`**
- **Domains:** `dev.kidlearn.net` only
- **Environment Variables:**

| Name | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.dev.kidlearn.net` |
| `NEXT_PUBLIC_SITE_URL` | `https://dev.kidlearn.net` |
| `MEDIA_ASSET_HOSTS` | `https://res.cloudinary.com` |
| `SITE_NOINDEX` | `true` |
| `DEV_SITE_BASIC_AUTH` | `dev:<a password you choose>` |

`DEV_SITE_BASIC_AUTH` lives here and nowhere else — deliberately not in Parameter
Store, which would give two places to forget to rotate it. Save it in your
password manager.

Add the Cloudflare record Vercel asks for, **grey cloud**:

| Name | Type | Content |
|---|---|---|
| `dev` | CNAME | the `*.vercel-dns.com` target for **this** project |

- [ ] Dev project tracks `dev`, five variables set, domain live

## B6 · 🌐 Extend the existing OAuth client

Edit your **existing** (local/dev) Google OAuth client. Do not touch the
production one you made in A15.

- **Authorised JavaScript origins:** add `https://dev.kidlearn.net`
  (keep `http://localhost:3000`)
- **Authorised redirect URIs:** add
  `https://api.dev.kidlearn.net/api/auth/callback/google`
  (keep `http://localhost:4000/api/auth/callback/google`)

- [ ] Dev entries added to the existing client

## B7 · Dev smoke test

```bash
curl -si https://dev.kidlearn.net | head -1                     # 401
curl -si https://api.dev.kidlearn.net/health | head -1          # 200, no prompt
curl -si https://api.dev.kidlearn.net/health | grep -i x-robots # noindex
```

Then in a browser:

1. `https://dev.kidlearn.net` asks for a username and password.
2. Your `DEV_SITE_BASIC_AUTH` credentials get you in.
3. Sign in with Google — **and it does not ask again part-way through.** The
   callback lands on the API host, which deliberately has no password gate.
4. Reload — still signed in.

Then prove the two environments really are separate:

```bash
# The dev site must not be calling the production API.
curl -s --user 'dev:<password>' https://dev.kidlearn.net \
  | grep -o 'api\.kidlearn\.net'          # NOTHING
curl -s --user 'dev:<password>' https://dev.kidlearn.net \
  | grep -o 'api\.dev\.kidlearn\.net'     # matches
```

If the first one matches, the dev Vercel project was built with production's
`NEXT_PUBLIC_API_URL`. Fix the variable and **redeploy**. That situation is a dev
build writing to the **production database**, and it looks like a CORS error
rather than what it is.

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
      $13.75/month

---

# When it goes wrong

Ordered by how likely you are to hit it.

**Something you definitely created is missing from the console.**
Check the region dropdown at the top right. It needs to say **Asia Pacific
(Mumbai) ap-south-1**. This is the most common AWS confusion there is.

**The Vercel build fails saying `@kidlearn/types` has no `dist`.**
The build command is not going through Turbo. It must be
`cd ../.. && pnpm turbo run build --filter=web`.

**`dev.kidlearn.net` behaves like production, or you see CORS errors.**
Almost never actually CORS. `NEXT_PUBLIC_*` values are baked in at build time, so
the dev project was built with a production value. Fix it and **redeploy** —
saving the variable is not enough. Confirm with the `grep` in B7.

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
intact. Note that `app.env` **on the box** stores values with every `$` doubled —
that is correct for Docker Compose and wrong if you copy one out by hand. Read
the real value from Parameter Store instead.

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
```bash
/opt/kidlearn/deploy/deploy.sh prod <the previous SHA>
```
The frontend is separate: Vercel dashboard → **Deployments** → the last good one
→ **Instant Rollback**. **Both halves, every time** — under pressure nobody
remembers the second one.

**A migration was wrong.**
Migrations are **forward-only**. Write a new migration that corrects it; never
edit one that has already been applied. On **dev only** you can start over — see
runbook §7 for the wipe-and-reseed command.

---

# Things that cost money or lock you out

| Do not | Because |
|---|---|
| Delete the `caddy_data` volume, or run `docker volume prune` on this box | It holds your certificates. Re-requesting them can hit Let's Encrypt's 5-per-week limit — a week with no HTTPS. |
| Switch to real certificates before staging works | Same limit, spent on a broken DNS record. |
| Allocate Elastic IPs you do not attach | $3.65/month each, charged whether attached or not. |
| Run `prisma migrate dev` against a deployed database | It can wipe it. `migrate deploy` only. |
| Skip the budget alarm | `t4g` bills surplus CPU instead of slowing down. |
| Reuse a secret between production and dev | A login cookie from one would be accepted by the other. |
| Put the production OAuth client into dev | Dev is deliberately less locked down. |
| Leave any DNS record on the orange cloud | Breaks certificates on both halves. |
| Add a port 22 rule | You do not need one even for SSH — `runbook.md` §2a tunnels real `ssh`/`scp`/`rsync` over Session Manager, with an audit trail and nothing exposed to the internet. |
