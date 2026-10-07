# Go-Live Guide — from zero to `https://kidlearn.net`

> **Who this is for.** You own `kidlearn.net` (bought from Namecheap) and nothing
> else exists yet: no AWS, no Vercel, no database. You are new to AWS and Vercel.
> Follow this file **top to bottom, in order**. Every step says **what** you do,
> **why** you do it, and **how to check** it worked.
>
> **Related files.** `document/deployment-walkthrough.md` is the shorter,
> expert version of the same work. `document/runbook.md` is what you open
> *after* you are live, when something breaks. You do not need either to follow
> this guide.
>
> This guide covers **production only** (`kidlearn.net`). The dev environment
> (`dev.kidlearn.net`) is Part B of the walkthrough. Do it later, once
> production works.

**Time:** about one full day. You can stop between any two steps.
**Cost:** about **$14 per month** (AWS), plus your domain. Everything else is free.

---

## Part 0 — Understand what you are building

Read this once. It makes every later step make sense.

### The big picture

KidLearn has two halves, and they live in two different places:

```
                         kidlearn.net  (your domain, DNS at Cloudflare)
                                 │
            ┌────────────────────┴─────────────────────┐
            │                                          │
   kidlearn.net, www.kidlearn.net               api.kidlearn.net
            │                                          │
     ┌──────▼──────┐                       ┌───────────▼───────────┐
     │   VERCEL    │   the browser calls   │   AWS EC2 server      │
     │  (apps/web) │ ────────────────────► │   Caddy (HTTPS)       │
     │  the website│                       │     └► API container  │
     └─────────────┘                       │        (apps/server)  │
                                           └───────────┬───────────┘
                                                       │
                          ┌────────────────────────────┼──────────────┐
                          ▼                            ▼              ▼
                   SUPABASE database            CLOUDINARY      GOOGLE (sign-in,
                   (all the data)               (images, audio)  Gemini, voice)
```

- **Vercel** runs the website (the Next.js app in `apps/web`). Vercel is made
  for Next.js and its free plan is enough.
- **An AWS EC2 server** runs the API (the Express app in `apps/server`). The API
  runs for a long time and keeps database connections open, so it needs a real
  computer that is always on. EC2 is a rented computer.
- **Supabase** holds the database. Free plan.
- **Cloudflare** answers the question "where is `api.kidlearn.net`?" (DNS).
  Free plan.

### Words you will meet

| Word | Simple meaning |
|---|---|
| **DNS** | The internet's phone book. It turns `api.kidlearn.net` into an address like `13.200.1.2`. |
| **Nameservers** | Which company runs the phone book for your domain. You will move this from Namecheap to Cloudflare. |
| **A record** | A phone-book line: "this name → this IP address". |
| **CNAME record** | A phone-book line: "this name → look up that other name". |
| **Region** | Which city AWS runs your things in. We use **Mumbai (`ap-south-1`)**, close to Bangladesh. |
| **EC2** | A rented computer in AWS. |
| **Elastic IP** | A fixed IP address for that computer, so DNS never points at the wrong place. |
| **Security group** | A firewall: which doors (ports) on the computer are open. |
| **IAM** | AWS's users and permissions system. |
| **IAM role** | Permissions given to a *machine* instead of a person, so no password sits on the server. |
| **Parameter Store** | A safe place in AWS for secrets (passwords, API keys). Free. |
| **Session Manager** | A terminal on your server, opened in your web browser. No SSH needed. |
| **ECR** | A private place in AWS to store Docker images. |
| **Docker image** | Your app packed in a box with everything it needs to run. |
| **S3** | File storage in AWS. We use it for database backups. |
| **Caddy** | A small web server on EC2. It gets the free HTTPS certificate for `api.kidlearn.net` by itself. |
| **Let's Encrypt** | The free service that gives HTTPS certificates. |

### Three places you will work

| Icon | Place | What you do there |
|---|---|---|
| 🌐 | A website (AWS, Vercel, Cloudflare…) | Click buttons, fill forms |
| 💻 | Terminal on **your Mac**, inside the `kidlearn` folder | Database setup, building images |
| 🖥️ | Terminal **on the server** (opened in the browser) | Start Caddy and the API |

### Golden rules — read these twice

1. **AWS region is always Mumbai.** At the top right of every AWS page there
   is a region menu. It must say **Asia Pacific (Mumbai) ap-south-1**. If
   something you made has "disappeared", the region is wrong 99% of the time.
2. **Never put a secret in the repository.** Passwords and keys go in your
   password manager and in AWS Parameter Store. Nowhere else.
3. **Cloudflare cloud icon must be GREY, never orange,** on every record you
   make. Orange breaks HTTPS for this project.
4. **Never open port 22 (SSH)** on the server. You do not need it.
5. **Write things down as you go.** Use the "Values sheet" below.

### Your values sheet

Make a new **secure note** in your password manager (1Password, Bitwarden,
Apple Passwords…) called `kidlearn production`. You will fill it during the
guide. **Not** a file in the project folder.

```
AWS account ID:          ____________
AWS IAM user + password: ____________
Supabase DB password:    ____________
DATABASE_URL:            ____________
DIRECT_URL:              ____________
Cloudinary cloud/key/secret: ________
BETTER_AUTH_SECRET:      ____________
CRON_SECRET:             ____________
GEMINI_API_KEY:          ____________
GOOGLE_TTS_API_KEY:      ____________
Google OAuth ID/secret:  ____________
S3 bucket name:          ____________
Healthcheck URLs (2):    ____________
EC2 instance ID:         ____________
Elastic IP:              ____________
Image tag (SHA):         ____________
Admin email/password:    ____________
```

---

## Part 1 — Prepare your Mac and your code

### Step 1 · 💻 Check your tools

**Why:** you build the server's Docker images and set up the database from your
Mac, so these tools must be there.

Open Terminal and run:

```bash
git --version      # any version
node --version     # must start with v22
pnpm --version     # must start with 9.
docker version     # must show "Server:" — Docker Desktop must be OPEN
aws --version      # aws-cli/2.something
```

If something is missing:

- **Docker Desktop:** download from <https://docs.docker.com/desktop/>, install,
  then open it once (whale icon in the menu bar).
- **AWS CLI:** `brew install awscli`
- **Node 22:** `brew install node@22` (or use `nvm install 22`).
- **pnpm:** `corepack enable` then `corepack prepare pnpm@9.15.0 --activate`

✅ **Check:** all five commands print a version, and `docker version` shows a
`Server:` section.

### Step 2 · 🌐 Bring `main` up to date with `dev`

**Why:** the live website and the live server are built from the **`main`**
branch. Right now all the deployment files (the `deploy/` folder) exist only on
`dev`, and `main` is far behind. If you skip this, Vercel builds an old website
and the server has no deploy scripts.

1. Go to <https://github.com/salmanbd100/kidlearn>.
2. **Pull requests → New pull request**. Set **base: `main`**, **compare: `dev`**.
3. Create the pull request. Wait for the **`gates`** check to turn green ✅.
4. Click **Merge pull request**.

Then on your Mac:

```bash
cd ~/Documents/Me/kidlearn
git checkout main
git pull
ls deploy          # must show: app  backup.sh  bootstrap.sh  deploy.sh  edge  weekly-reports.sh
pnpm install
pnpm db:generate
```

✅ **Check:** `ls deploy` shows the six items above.

> From now on, when this guide says "on your Mac, in the repo", be on the
> **`main`** branch.

---

## Part 2 — Create your accounts

**Why all of them now:** some take time to activate (AWS can take a few
minutes, DNS can take hours). Making them first means you do not wait later.

### Step 3 · 🌐 AWS account — and keep it safe

**Why:** AWS runs your API server. The first login ("root user") can do
*anything*, including deleting the whole account, so you protect it and then
make a normal everyday user.

**3a. Sign up**

1. Go to <https://aws.amazon.com> → **Create an AWS account**.
2. Use an email you check often. Give a strong password (save it).
3. Add a payment card. AWS charges a small amount (about $1) to check it, and
   gives it back.
4. If AWS asks you to pick a **Free plan** or **Paid plan**, choose **Paid
   plan**. The free plan expires after 6 months and limits some services; a
   live website should not stop because of that. You still get the
   welcome credits.
5. Support plan: **Basic (free)**.

**3b. Turn on MFA for the root user**

MFA means "a code from your phone is also needed to log in". If someone steals
your password, they still cannot get in.

1. Click your account name (top right) → **Security credentials**.
2. **Assign MFA device** → **Authenticator app** → scan the QR code with Google
   Authenticator, Authy or your password manager → type two codes.

**3c. Make an everyday admin user**

You should not use the root user every day. Make a normal user with admin
rights instead.

1. In the top search bar type **IAM** → open it.
2. Left side → **Users** → **Create user**.
3. User name: `salman-admin`. Tick **Provide user access to the AWS Management
   Console** → **I want to create an IAM user** → choose a password. Untick
   "must create a new password". **Next**.
4. **Attach policies directly** → search and tick **`AdministratorAccess`** →
   **Next** → **Create user**.
5. Copy the **Console sign-in URL** shown on the screen. Save it with the
   password in your values sheet.
6. Open the new user → **Security credentials** → **Assign MFA device** (same
   as 3b).

**3d. Make keys for the AWS CLI on your Mac**

The `aws` command on your Mac needs a key to act as `salman-admin`.

1. Still on the `salman-admin` user → **Security credentials** → **Create
   access key** → choose **Command Line Interface (CLI)** → tick the
   confirmation → **Create**.
2. You see **Access key** and **Secret access key**. **The secret is shown only
   once.** Keep the page open.
3. On your Mac:

   ```bash
   aws configure
   # AWS Access Key ID:     <paste access key>
   # AWS Secret Access Key: <paste secret key>
   # Default region name:   ap-south-1
   # Default output format: json
   ```

4. **Log out** of root. From now on, log in with the **console sign-in URL** as
   `salman-admin`.

✅ **Check:**

```bash
aws sts get-caller-identity
# shows "Arn": "arn:aws:iam::<12 digits>:user/salman-admin"
```

Write the 12-digit number in your values sheet as **AWS account ID**.

### Step 4 · 🌐 Budget alarm — before you create anything that costs money

**Why:** if you make a mistake (for example a bigger server than planned), AWS
keeps charging silently. This alarm emails you before the bill grows.

1. Search **Billing and Cost Management** → left side **Budgets** → **Create
   budget**.
2. **Customize (advanced)** → **Cost budget** → Next.
3. Name `kidlearn`. Period **Monthly**. Renewal **Recurring**. Amount **20** USD.
4. **Add an alert threshold:** `80` % of **Actual** cost → your email.
5. **Add alert threshold** again: `100` % of **Forecasted** cost → your email.
6. Create.

✅ **Check:** budget `kidlearn` is in the list. If AWS sends a confirmation
email, click the link in it.

### Step 5 · 🌐 Other free accounts

Make these now (sign in with Google or GitHub where offered — fewer passwords):

| Service | Link | Why |
|---|---|---|
| Cloudflare | <https://dash.cloudflare.com/sign-up> | DNS for your domain |
| Vercel | <https://vercel.com/signup> → **Continue with GitHub** | Runs the website. Choose the **Hobby** (free) plan |
| Supabase | <https://supabase.com/dashboard> → sign in with GitHub | The database |
| Cloudinary | <https://cloudinary.com/users/register_free> | Stores images and audio |
| healthchecks.io | <https://healthchecks.io> | Emails you if the nightly backup stops working |

You already have **Google Cloud** from local development (sign-in with Google).

---

## Part 3 — Move your domain's DNS to Cloudflare

**Why:** right now Namecheap answers "where is kidlearn.net?". We move that job
to Cloudflare because it is fast, free, and the whole project's setup assumes
it. **Do this early** — the switch can take from 10 minutes to a few hours, and
you can do other steps while you wait.

### Step 6 · 🌐 Add the domain to Cloudflare

1. Cloudflare dashboard → **Add a domain** (or "Add a site").
2. Type `kidlearn.net`. Choose **Quick scan for DNS records** → Continue.
3. Choose the **Free** plan.
4. Cloudflare shows the records it found. **Delete all of them** (Namecheap
   adds "parking page" records you do not want). You will add the right ones
   later.
5. Continue. Cloudflare now shows **two nameservers**, for example:

   ```
   ada.ns.cloudflare.com
   bob.ns.cloudflare.com
   ```

   Keep this page open.

### Step 7 · 🌐 Point Namecheap at Cloudflare

1. Log in to <https://www.namecheap.com> → **Domain List** → next to
   `kidlearn.net` click **Manage**.
2. Find the **NAMESERVERS** section. Change the dropdown from *Namecheap BasicDNS*
   to **Custom DNS**.
3. Paste the two Cloudflare nameservers, one per line.
4. Click the **green tick ✓** to save. (Easy to miss — nothing is saved
   without it.)
5. On the same page, check **Advanced DNS → DNSSEC** is **off**. If it is on,
   turn it off — otherwise the switch fails.
6. Back on Cloudflare, click **Check nameservers now**.

✅ **Check:** Cloudflare emails you "**kidlearn.net is now active**", and the
domain shows **Active** on the Cloudflare dashboard. Until then, carry on with
Parts 4–5; you need DNS only in Step 18.

---

## Part 4 — Database and outside services

### Step 8 · 🌐💻 Production database — Supabase

**Why:** all KidLearn data (parents, children, lessons, progress) lives here.

**8a. Create the project**

1. Supabase → **New project**.
2. Name: `kidlearn-production`.
3. **Database password:** click **Generate a password**. Then check it has
   **only letters and numbers**; if it has symbols, generate again.
   *Why:* symbols like `@ # $ /` break connection strings in confusing ways.
   Save it in your values sheet.
4. Region: **South Asia (Mumbai)** — same city as the server, so it is fast.
5. Create, and wait ~2 minutes.

**8b. Copy two connection strings**

Click **Connect** (top of the project page). You need two strings. In each,
replace `[YOUR-PASSWORD]` with your database password.

| Name in your sheet | Which one in Supabase | Port | Add to the end |
|---|---|---|---|
| `DATABASE_URL` | **Transaction pooler** | `6543` | `?pgbouncer=true&connection_limit=5` |
| `DIRECT_URL` | **Session pooler** | `5432` | nothing |

They look like this:

```
DATABASE_URL = postgresql://postgres.abcd1234:PASSWORD@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5
DIRECT_URL   = postgresql://postgres.abcd1234:PASSWORD@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
```

*Why two?* The app makes many short connections — the **transaction pooler**
is built for that. Migrations and backups need one long, stable connection —
the **session pooler** gives that.

> ⚠️ **Do not use "Direct connection"** (`db.xxxx.supabase.co`) for
> `DIRECT_URL`. It works only over IPv6. Your AWS server has only IPv4, so
> backups would fail every night.
>
> ⚠️ It must be `connection_limit=5`, **not** `=1` like many online guides say.

**8c. Create the tables** — 💻 on your Mac, in the repo:

```bash
DATABASE_URL='<your DATABASE_URL>' \
DIRECT_URL='<your DIRECT_URL>' \
pnpm --filter @kidlearn/db exec prisma migrate deploy
```

*Why:* the empty database has no tables. `migrate deploy` creates them from the
migration files in `packages/db/prisma/migrations/`. The values are typed in the
command, so no secret is saved in a file.

✅ **Check:** the last line says `All migrations have been successfully applied.`

> **Never run `prisma migrate dev` against this database.** It can delete data.
> `migrate deploy` is the only safe one.

**8d. Add the starting structure** (worlds, subjects, characters, badges):

```bash
DATABASE_URL='<your DATABASE_URL>' \
DIRECT_URL='<your DIRECT_URL>' \
pnpm --filter @kidlearn/db db:seed:reference
```

*Why:* this adds only the shapes the app needs before any lesson exists.
Lessons and stories come later, through the admin CMS.

> **Never run plain `db:seed` here.** It also adds the developer sample lessons,
> whose pictures and sounds exist only on a developer's Mac. Children would see
> broken images and hear nothing.

✅ **Check:** it finishes with no red error. In Supabase → **Table Editor**,
`World` has 2 rows, `Badge` has 6, and `Lesson` is empty.

> **Free Supabase projects pause after 7 days with no use.** Until you launch,
> open the Supabase dashboard once a week. If the site breaks later, check
> "is the project paused?" first.

### Step 9 · 🌐 Cloudinary — images and audio

**Why:** uploaded pictures and generated audio are stored here, not on your
server, so the server's disk stays small.

Cloudinary → **Dashboard** (or Settings → API Keys). Copy **Cloud name**,
**API Key**, **API Secret** into your sheet.

### Step 10 · 🌐 Google keys — Gemini and Text-to-Speech

**Why:** Gemini writes AI content for admins to review; Text-to-Speech makes
the lesson audio.

1. **Gemini key:** <https://aistudio.google.com/apikey> → **Create API key**.
   Free. Save as `GEMINI_API_KEY`.
2. **Text-to-Speech key:** Google Cloud Console → pick your project →
   search **Cloud Text-to-Speech API** → **Enable** (needs a billing account
   on the project). Then **APIs & Services → Credentials → Create credentials →
   API key**. Click the new key → **API restrictions → Restrict key** → choose
   **Cloud Text-to-Speech API** → Save. Save as `GOOGLE_TTS_API_KEY`.
   *Why restrict:* if the key ever leaks, it can only make speech, nothing else.

### Step 11 · 🌐 Two backup monitors — healthchecks.io

**Why:** the server makes a database backup every night and sends a weekly
parent report. If one of them silently stops, nobody would notice.
healthchecks.io expects a "ping" every day/week and **emails you when it does
not come**.

1. healthchecks.io → **Add Check**. Name `kidlearn backup`. **Period: 1 day**,
   **Grace: 2 hours**. Copy its **ping URL** (`https://hc-ping.com/…`).
2. **Add Check** again. Name `kidlearn weekly reports`. **Period: 7 days**,
   **Grace: 6 hours**. Copy its ping URL.

Save both URLs in your sheet.

---

## Part 5 — AWS: storage, secrets and images

Check the region menu says **Mumbai** before every step in this part.

### Step 12 · 🌐 Backup bucket — S3

**Why:** Supabase's free plan has no "go back in time". If data is deleted by
mistake, these nightly backups are your only way to get it back.

1. Search **S3** → **Create bucket**.
2. Bucket name: `kidlearn-backups-<something unique>`, e.g.
   `kidlearn-backups-salman-2026`. (Names are unique across the whole world.)
3. **Block all public access:** leave it **ON** (all boxes ticked).
4. **Bucket Versioning:** **Enable**.
5. **Create bucket**.

Now make old backups delete themselves after 30 days, so the cost stays at a
few cents:

6. Open the bucket → **Management** tab → **Create lifecycle rule**.
7. Name `expire-30-days`. Choose **Limit the scope … using one or more
   filters** → Prefix: `prod/`.
8. Tick **Expire current versions of objects** → `30` days.
9. Tick **Permanently delete noncurrent versions of objects** → `30` days.
10. **Create rule**.

✅ **Check:** the bucket is listed with "Objects can be public" **not** shown.
Bucket name is in your sheet.

### Step 13 · 💻🌐 Secrets — Parameter Store

**Why:** the API needs about 16 secret values to start. We store them in AWS,
encrypted. The server reads them itself at deploy time, so no secret ever sits
in GitHub or on your laptop's disk.

**13a. Make two random secrets** — 💻 on your Mac:

```bash
openssl rand -base64 32    # → BETTER_AUTH_SECRET (signs login cookies)
openssl rand -base64 32    # → CRON_SECRET (protects the weekly-report job)
```

Save both in your sheet.

**13b. Store all values** — 🌐 search **Systems Manager** → left side
**Parameter Store** → **Create parameter**. For **each** row below:

- **Name:** copy exactly, including `/kidlearn/prod/`
- **Tier:** Standard
- **Type:** **SecureString**
- **KMS key source:** My current account → `alias/aws/ssm` (already selected)
- **Value:** the value
- **Create parameter**, then repeat

| Name | Value |
|---|---|
| `/kidlearn/prod/DATABASE_URL` | the `:6543` string from Step 8 |
| `/kidlearn/prod/DIRECT_URL` | the `:5432` session pooler string from Step 8 |
| `/kidlearn/prod/WEB_ORIGIN` | `https://kidlearn.net` |
| `/kidlearn/prod/BETTER_AUTH_URL` | `https://api.kidlearn.net` |
| `/kidlearn/prod/BETTER_AUTH_SECRET` | first `openssl` value |
| `/kidlearn/prod/CRON_SECRET` | second `openssl` value |
| `/kidlearn/prod/GOOGLE_CLIENT_ID` | `placeholder` (real value in Step 22) |
| `/kidlearn/prod/GOOGLE_CLIENT_SECRET` | `placeholder` (real value in Step 22) |
| `/kidlearn/prod/CLOUDINARY_CLOUD_NAME` | from Step 9 |
| `/kidlearn/prod/CLOUDINARY_API_KEY` | from Step 9 |
| `/kidlearn/prod/CLOUDINARY_API_SECRET` | from Step 9 |
| `/kidlearn/prod/GEMINI_API_KEY` | from Step 10 |
| `/kidlearn/prod/GOOGLE_TTS_API_KEY` | from Step 10 |
| `/kidlearn/prod/BACKUP_S3_BUCKET` | bucket name only, **no** `s3://` |
| `/kidlearn/prod/BACKUP_HEARTBEAT_URL` | backup ping URL from Step 11 |
| `/kidlearn/prod/WEEKLY_REPORTS_HEARTBEAT_URL` | weekly ping URL from Step 11 |

*Why placeholders for Google?* The Google sign-in client needs the live
website address to exist first. You come back and replace them in Step 22.

✅ **Check:** 💻 on your Mac:

```bash
aws ssm get-parameters-by-path --path /kidlearn/prod/ --query 'Parameters[].Name' --output text | tr '\t' '\n' | sort
```

You see **exactly 16 names**, spelled as in the table. A typo here shows up much
later as "the server will not start", so look carefully now.

### Step 14 · 💻 Create your admin account

**Why:** admins (who approve AI content) cannot sign up on the website — on
purpose. This script is the only way to make one. It needs all the production
secrets, so it reads them from Parameter Store into this terminal only.

On your Mac, in the repo. **Type `bash` first** — the commands below are
written for bash:

```bash
bash

set -a
eval "$(aws ssm get-parameters-by-path --path /kidlearn/prod/ --with-decryption \
  --recursive --region ap-south-1 --query 'Parameters[].[Name,Value]' --output text \
  | while IFS=$'\t' read -r n v; do printf '%s=%q\n' "${n##*/}" "$v"; done)"
set +a

ADMIN_EMAIL='you@example.com' \
ADMIN_PASSWORD='<at least 12 characters>' \
ADMIN_NAME='<your name>' \
pnpm --filter server seed:admin

exit
```

Then **close this Terminal window** — it held production secrets in memory.

✅ **Check:** the script says the admin was created. Save email and password in
your sheet. (Running it again with a new password is how you reset it.)

### Step 15 · 🌐 Image storage — ECR

**Why:** the server does not build code. You build a Docker image on your Mac,
put it in ECR, and the server downloads it from there.

1. Search **ECR** → **Private registry → Repositories** → **Create repository**.
2. Name `kidlearn-api` → **Create**.
3. Again: **Create repository** → name `kidlearn-migrate` → **Create**.
   (*Why two?* `kidlearn-api` is the app. `kidlearn-migrate` only updates the
   database tables, and runs only when you ask.)

Keep only the newest 10 images, so storage stays cheap but you can still roll
back. For **each** repository:

4. Open it → left side **Lifecycle Policy** → **Create rule**.
5. Priority `1`. Description `keep last 10`. Image status **Any**.
   **Image count more than** `10`. **Save**.

✅ **Check:** two repositories, each with one lifecycle rule.

### Step 16 · 💻 Build and upload the images

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

✅ **Check:** in the ECR console each repository shows one image, tagged with
your SHA. Write the SHA in your sheet as **Image tag** — you need it in Step 23.

---

## Part 6 — The server

### Step 17 · 🌐 Permissions for the server — IAM role

**Why:** the server must read secrets, download images and upload backups. A
**role** gives it these rights **without** storing any AWS key on it. If the
server were hacked, there is no key to steal.

**17a. Create the role**

1. Search **IAM** → **Roles** → **Create role**.
2. Trusted entity: **AWS service**. Use case: **EC2** → Next.
3. Search and tick **`AmazonSSMManagedInstanceCore`** → Next.
   (*This is what lets you open a terminal in the browser.*)
4. Role name `kidlearn-instance` → **Create role**.

**17b. Add the project permissions**

5. Open `kidlearn-instance` → **Add permissions → Create inline policy** →
   **JSON** tab.
6. Delete what is in the box. Paste the JSON below. Replace **every**
   `<ACCOUNT_ID>` (your 12 digits) and **every** `<BUCKET_NAME>` (from Step 12).
7. Next → policy name `kidlearn-runtime` → **Create policy**.

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

In plain words, this says: the server may **download our two images**, **read
our secrets**, **write backups** to our bucket, and **nothing else**.

✅ **Check:** the role shows two policies: `AmazonSSMManagedInstanceCore` and
`kidlearn-runtime`. Search the JSON once more for `<` — there must be none left.

### Step 18 · 🌐 Launch the server — EC2

**18a. Copy the setup script first**

Open `deploy/bootstrap.sh` in your editor and **copy the whole file**.
*Why:* AWS runs this script once when the server first starts. It installs
Docker, cron (for scheduled jobs) and extra memory (swap). You do not have to do
these by hand.

**18b. Launch**

Search **EC2** → **Instances** → **Launch instances**. Fill in:

| Field | Choose |
|---|---|
| Name | `kidlearn` |
| Application and OS Images | **Amazon Linux 2023** |
| Architecture (just below it) | **64-bit (Arm)** ← easy to miss |
| Instance type | **`t4g.small`** |
| Key pair | **Proceed without a key pair** |

*Why Arm?* `t4g` is an Arm computer — the cheapest good option — and your
images were built for Arm.
*Why no key pair?* A key pair is for SSH. We do not use SSH, so there is
nothing to steal.

**Network settings** → click **Edit**:

1. **Create security group**. Name: `kidlearn-edge`.
2. If there is an **SSH / port 22** rule, **remove it** (trash icon).
3. **Add security group rule** three times. Source for all: **Anywhere
   (0.0.0.0/0)**.

| Type | Protocol | Port | Why |
|---|---|---|---|
| Custom TCP | TCP | `80` | Let's Encrypt checks you own the domain here; also redirects to HTTPS |
| HTTPS | TCP | `443` | All real traffic |
| Custom UDP | UDP | `443` | HTTP/3 (faster on phones) |

**Configure storage:** `20` GiB, **gp3**.

**Advanced details** (click to open — it is closed by default):

- **IAM instance profile:** `kidlearn-instance`
- **User data:** paste the whole `bootstrap.sh` from 18a

Click **Launch instance**.

**18c. Give it a fixed address — Elastic IP**

*Why:* a normal server's public address changes when it restarts. Your DNS would
then point at nothing. An Elastic IP never changes.

1. EC2 left side → **Elastic IPs** → **Allocate Elastic IP address** →
   **Allocate**.
2. Tick the new IP → **Actions → Associate Elastic IP address**.
3. Resource type **Instance** → choose `kidlearn` → **Associate**.

> Do not make extra Elastic IPs "just in case". AWS charges for each one, used or
> not.

✅ **Check:** EC2 → Instances shows `kidlearn` as **Running**. Write the
**Instance ID** (`i-0…`) and the **Elastic IP** in your sheet.

### Step 19 · 🌐 DNS record for the API — Cloudflare

**Why:** now people's browsers can find your server by name.

Wait until Cloudflare says **Active** (Step 7). Then Cloudflare →
`kidlearn.net` → **DNS → Records → Add record**:

| Type | Name | IPv4 address | Proxy status |
|---|---|---|---|
| A | `api` | your Elastic IP | **DNS only (grey cloud)** |

Click the orange cloud until it turns **grey** before you save.

✅ **Check** from your Mac (wait a minute or two first):

```bash
dig +short api.kidlearn.net
```

It must print **exactly your Elastic IP**. If it prints something starting with
`104.` or `172.67.`, the cloud is orange — edit the record, make it grey.

### Step 20 · 🖥️ Open the server terminal and copy the deploy files

**20a. Open a terminal in the browser**

Wait 3 minutes after launch (the setup script needs time). Then:
**EC2 → Instances → tick `kidlearn` → Connect (top) → Session Manager tab →
Connect.**

A black terminal opens in your browser. You are now on the server.

> **Cannot connect?** Wait 2 more minutes and retry. Still no? Check the role:
> **Actions → Security → Modify IAM role** must show `kidlearn-instance`.
> Never "fix" this by opening port 22.

**20b. Check the setup script worked**

```bash
sudo su -
docker --version && docker compose version
systemctl is-active crond      # active
ls /opt/kidlearn               # deploy  dev  edge  prod
free -m                        # a "Swap" line of about 2000
```

*`sudo su -`* makes you the admin user (root). You need it for everything on the
server — **run it every time you open a new terminal**.

If something is wrong, read the setup log: `cat /var/log/cloud-init-output.log`.

**20c. Copy the `deploy/` folder onto the server**

*Why:* the setup script made an empty `/opt/kidlearn/deploy` folder. The scripts
that start the API live in the repository, so we copy them over. The repo is
public, so the server can download it straight from GitHub (`main` branch — this
is why Step 2 mattered).

```bash
dnf install -y git
git clone https://github.com/salmanbd100/kidlearn.git /tmp/kidlearn
cp -r /tmp/kidlearn/deploy/. /opt/kidlearn/deploy/
rm -rf /tmp/kidlearn
chmod +x /opt/kidlearn/deploy/*.sh
ls /opt/kidlearn/deploy
```

✅ **Check:** the last command shows `app  backup.sh  bootstrap.sh  deploy.sh
edge  weekly-reports.sh`.

> Whenever anything in `deploy/` changes in the future, repeat 20c.

### Step 21 · 🖥️ HTTPS for the API — Caddy, in two careful stages

**Why two stages?** Caddy asks Let's Encrypt for a certificate the moment it
starts. Let's Encrypt allows only a few tries per week. If DNS is wrong, you can
burn all your tries and have **no HTTPS for a week**. So first we test with
Let's Encrypt's **staging** (practice) service, which has no such limit. Only
when that works do we switch to the real one.

**21a. Set your email**

The Caddyfile in `deploy/` is overwritten every time you repeat 20c, so your
settings live in a separate file on the server that the copy never touches:

```bash
install -d -m 0700 /opt/kidlearn/edge
printf 'ACME_EMAIL=%s\n' 'you@example.com' > /opt/kidlearn/edge/caddy.env
chmod 600 /opt/kidlearn/edge/caddy.env
```

Put **your real email** in place of `you@example.com`. Do **not** add an
`ACME_CA` line yet — without one, Caddy uses the staging service.

**21b. Start Caddy on staging**

```bash
cd /opt/kidlearn/deploy/edge
docker compose -p kidlearn-edge -f compose.yml up -d
docker compose -p kidlearn-edge logs --tail 40 caddy
```

**21c. Test** — 💻 from your Mac:

```bash
curl -sI https://api.kidlearn.net/health
```

👉 **A certificate error here is GOOD.** Practice certificates are not trusted by
design. The error proves Caddy got one.

```bash
curl -skI https://api.kidlearn.net/health | head -1
```

👉 `HTTP/2 502` is also **GOOD**. It means "HTTPS works, but the API is not
running yet" — which is true; you start it in Step 23.

❌ If you get a **timeout** instead: DNS (Step 19) or the security group (Step
18b) is wrong. **Do not continue until 21c behaves as described.**

**21d. Switch to real certificates** — 🖥️ on the server:

```bash
echo 'ACME_CA=https://acme-v02.api.letsencrypt.org/directory' >> /opt/kidlearn/edge/caddy.env
cat /opt/kidlearn/edge/caddy.env     # ACME_EMAIL and ACME_CA, one line each
cd /opt/kidlearn/deploy/edge
docker compose -p kidlearn-edge -f compose.yml up -d --force-recreate
```

Do **not** edit `Caddyfile` itself for this — the next 20c would undo it and
put production back on practice certificates without telling you.

💻 From your Mac — no `-k` this time:

```bash
curl -sI https://api.kidlearn.net/health | head -1
# HTTP/2 502   and NO certificate error
```

> ⚠️ **Never delete the Docker volume called `caddy_data`**, and never run
> `docker volume prune` on this server. It holds your certificates; losing it
> can lock you out of HTTPS for a week.

### Step 22 · 🌐 Google sign-in for production

**Why:** parents sign in with Google. Google only sends people back to addresses
you list, so production needs its own client with `kidlearn.net` in it. It is a
**new** client — keep your local one separate.

1. Google Cloud Console → your project → search **Google Auth Platform** (or
   *APIs & Services → OAuth consent screen*).
2. **Audience:** user type **External**. If it says **Testing**, click
   **Publish app** → confirm. *Why:* in "Testing", only people you add by hand
   can sign in.
3. **Clients → Create client** → Application type **Web application**.
   - Name: `kidlearn production`
   - **Authorized JavaScript origins:** `https://kidlearn.net`
   - **Authorized redirect URIs:** `https://api.kidlearn.net/api/auth/callback/google`
4. **Create**. Copy the **Client ID** and **Client secret**.
5. AWS → **Systems Manager → Parameter Store**. Open
   `/kidlearn/prod/GOOGLE_CLIENT_ID` → **Edit** → paste the real value → **Save
   changes**. Do the same for `/kidlearn/prod/GOOGLE_CLIENT_SECRET`.

### Step 23 · 🖥️ Start the API

**Why:** everything the API needs now exists: database, secrets, images, HTTPS.
`deploy.sh` reads the secrets, downloads the image, starts it, and checks it is
healthy *and* can reach the database.

On the server terminal (`sudo su -` first if it is a new window):

```bash
/opt/kidlearn/deploy/deploy.sh prod <IMAGE TAG from Step 16>
```

✅ **Check:** the last line is:

```
[deploy:prod] healthy and database reachable — deploy complete at <sha>
```

Now test the database-update path once, while nothing depends on it. You will
use this exact command for every future release with database changes:

```bash
/opt/kidlearn/deploy/deploy.sh prod <IMAGE TAG from Step 16> --migrate
```

✅ Expect `No pending migrations to apply.` (you already applied them in Step 8),
then the same "deploy complete" line as above.

💻 From your Mac:

```bash
curl -s https://api.kidlearn.net/health
# {"data":{"status":"ok", ...}}

curl -s -o /dev/null -w '%{http_code}\n' https://api.kidlearn.net/docs
# 404   ← correct: API docs are switched off in production on purpose
```

🎉 **Your API is live.**

> **If deploy fails:** it prints the reason. The usual ones are a typo in a
> Parameter Store name (Step 13), a wrong account number in the role (Step 17),
> or a paused Supabase project. See "When something goes wrong" at the end.

---

## Part 7 — The website on Vercel

### Step 24 · 🌐 Create the Vercel project

**Why:** Vercel builds `apps/web` from GitHub and serves it worldwide, with
HTTPS, for free.

1. <https://vercel.com/new> → **Import Git Repository**. If `kidlearn` is not
   listed, click **Adjust GitHub App Permissions** and allow the `kidlearn`
   repo.
2. Click **Import** next to `salmanbd100/kidlearn`.
3. On the configure page:
   - **Project name:** `kidlearn`
   - **Framework Preset:** Next.js
   - **Root Directory:** click **Edit** → choose `apps/web` → Continue
   - Open **Build and Output Settings** and turn on the overrides:
     - **Build Command:** `cd ../.. && pnpm turbo run build --filter=web`
     - **Install Command:** `pnpm install --frozen-lockfile`
   - Open **Environment Variables** and add these three:

| Key | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.kidlearn.net` |
| `NEXT_PUBLIC_SITE_URL` | `https://kidlearn.net` |
| `MEDIA_ASSET_HOSTS` | `https://res.cloudinary.com` |

4. Click **Deploy**.

*Why the special build command?* The website uses a shared package
(`@kidlearn/types`) that must be built first. Turbo builds things in the right
order. A plain `next build` would fail.

*Why these variables now?* `NEXT_PUBLIC_*` values are written **into** the
website when it is built. If you change one later, nothing happens until you
**redeploy**.

> **Do not add `SITE_NOINDEX` or `DEV_SITE_BASIC_AUTH`.** Those are only for the
> dev site. On production they would hide your site from Google or lock it with
> a password.

✅ **Check:** the deploy finishes. Open the build log and confirm you see
`@kidlearn/types` build **before** `web`.

### Step 25 · 🌐 Project settings

In the project → **Settings**:

1. **Build and Deployment → Root Directory:** make sure **Include files outside
   the root directory in the Build Step** is **on**. *Why:* the shared packages
   live outside `apps/web`.
2. **Build and Deployment → Node.js Version:** **22.x**.
3. **Git → Production Branch:** `main`. *Why:* only `main` goes live; pushes to
   `dev` make preview links only.
4. **Functions → Function Region:** **Mumbai, India (bom1)**. *Why:* close to
   the API and your users. The default is the USA.
5. **Billing / Usage → notifications:** turn on usage emails. *Why:* the free
   plan never charges extra — it **pauses** your site if you go over the limit.
   You want a warning first.

After changing settings, go to **Deployments** → the latest one → **⋯ →
Redeploy** so they take effect.

### Step 26 · 🌐 Connect `kidlearn.net` to Vercel

**26a. In Vercel:** project → **Settings → Domains** → **Add Domain**.

1. Type `kidlearn.net` → Add. If Vercel offers "add `www.kidlearn.net` and
   redirect to it", choose **redirect `www.kidlearn.net` → `kidlearn.net`**.
   *Why:* one main address is cleaner; both still work.
2. Vercel now shows "Invalid Configuration" and tells you exactly which records
   to add — usually an **A** record for `kidlearn.net` and a **CNAME** for
   `www`. **Copy the values Vercel shows you**; do not copy them from any guide,
   because Vercel changes them.

**26b. In Cloudflare:** **DNS → Records → Add record**, for each one Vercel gave:

| Type | Name | Value | Proxy |
|---|---|---|---|
| A | `@` | the IP Vercel shows | **grey cloud** |
| CNAME | `www` | the `…vercel-dns…` name Vercel shows | **grey cloud** |

✅ **Check:** back in Vercel, both domains turn to **Valid Configuration** with a
green tick (can take a few minutes). Open <https://kidlearn.net> — the site
loads with a padlock.

Your Cloudflare DNS should now have **exactly three records**: `@` (A),
`www` (CNAME), `api` (A) — all grey.

---

## Part 8 — Backups, scheduled jobs, final test

### Step 27 · 🖥️ Nightly backup and weekly reports

**Why:** cron is the server's alarm clock. Every night at 01:30 it backs up the
database to S3. Every Monday at 02:00 it builds the weekly parent reports.

On the server terminal:

```bash
sudo su -
systemctl is-active crond     # must say: active
EDITOR=nano crontab -e
```

Paste these lines exactly, then save (`Ctrl+O`, `Enter`, `Ctrl+X`):

```cron
CRON_TZ=Asia/Dhaka
# Nightly production database dump → S3
30 1 * * *  /opt/kidlearn/deploy/backup.sh >>/var/log/kidlearn-backup.log 2>&1
# Weekly parent reports, Mondays 02:00 Asia/Dhaka
0 2 * * 1  /opt/kidlearn/deploy/weekly-reports.sh >>/var/log/kidlearn-weekly-reports.log 2>&1
```

**Run the backup once now, by hand.** *Why:* a backup you never tested is only
a hope.

```bash
/opt/kidlearn/deploy/backup.sh
```

✅ **Check all three:**

- The script prints `wrote … (NNNN bytes)` with no error.
- AWS **S3 → your bucket → `prod/`** has a new `.sql.gz` file (directly in
  `prod/`, **not** in `prod/.partial/`).
- healthchecks.io shows the `kidlearn backup` check **green**.

### Step 28 · 📱 The real test — on your phone

**Why:** the curl checks prove the parts work; this proves the whole product
works for a real parent.

💻 First, from your Mac:

```bash
curl -s https://api.kidlearn.net/health            # {"data":{"status":"ok",…}}
curl -si https://api.kidlearn.net/docs | head -1   # 404
curl -si https://kidlearn.net | grep -i x-robots   # prints NOTHING
```

📱 Then on your phone, at `https://kidlearn.net`:

1. Sign in as a parent with Google.
2. The parent area opens (there is **no PIN** step).
3. Create a child profile.
4. Play a lesson through all five steps — **with sound**.
5. The parent dashboard shows the time just spent learning.
6. On a computer, sign in with your **admin** account (Step 14) and open
   `https://kidlearn.net/admin/ai-queue` — it loads.
7. **Reload the page — you are still signed in.** If reload logs you out,
   something is wrong with the API address or cookies; fix that first.

> # 🎉 You are live!

---

## Part 9 — After you are live

### Finish the paperwork

- Fill the `<placeholders>` in `document/runbook.md` (registrar = Namecheap,
  Elastic IP, instance ID, bucket name, "ACME endpoint: production").
- Mark file 38 provisioning done in
  `document/implementation/00-progress-tracker.md`.
- After one full day, open **AWS Billing → Budgets**. The forecast should be
  around **$14/month**.
- Delete the AWS access key from Step 3d? **No** — you still need it to push
  images. But never share it, and make a new one if you think it leaked.

### How to ship a new version later

Automatic deploys (GitHub Actions) are not set up yet — that is file 38a. Until
then:

- **Website:** merge `dev` into `main` on GitHub. Vercel deploys by itself.
- **API:**
  1. 💻 On `main`, run Step 16 again → you get a new `SHA`.
  2. 🖥️ `/opt/kidlearn/deploy/deploy.sh prod <new SHA>` — add `--migrate` at
     the end if the release adds database changes. It applies them from the
     new release before restarting the API.
- **If `deploy/` files changed:** repeat Step 20c first.

### How to undo a bad release

Undo **both** halves:

- **API:** 🖥️ `/opt/kidlearn/deploy/deploy.sh prod <previous SHA>`
- **Website:** Vercel → project → **Deployments** → the last good one →
  **⋯ → Instant Rollback**.

---

## When something goes wrong

Most likely first.

| What you see | What to check |
|---|---|
| Something you made in AWS has "disappeared" | The **region** menu (top right) — must be **Mumbai** |
| Cloudflare never becomes Active | Namecheap: did you click the green ✓? Is DNSSEC off? |
| `dig` shows `104.…` or `172.67.…` | The Cloudflare cloud is **orange** — make it grey |
| `curl` to the API **times out** | DNS (Step 19) points at the wrong IP, or ports 80/443 missing in the security group |
| Caddy never gets a certificate | Grey cloud? `dig` shows your Elastic IP? Port **80** open? |
| Session Manager will not connect | Server still starting (wait), or role `kidlearn-instance` not attached. **Never** open port 22 |
| `deploy.sh`: "no parameters found" | Parameter name typo, wrong region, or wrong account number in the role JSON |
| API starts but database fails | Check `DATABASE_URL` in Parameter Store; is the Supabase project **paused**? |
| Backup fails every night | `DIRECT_URL` must be the **Session pooler** string (port 5432 on `pooler.supabase.com`), not "Direct connection" |
| Vercel build: `@kidlearn/types` has no `dist` | Build command must be `cd ../.. && pnpm turbo run build --filter=web` |
| Website loads but sign-in fails | Google client origins/redirect (Step 22); is the consent screen **published**? |
| You changed a Vercel variable and nothing changed | `NEXT_PUBLIC_*` are built in — **Redeploy** |
| Logged out on every reload | `WEB_ORIGIN` / `BETTER_AUTH_URL` in Parameter Store, then redeploy the API |

**Reading logs on the server:**

```bash
sudo su -
docker compose -p kidlearn-prod logs --tail 100 api     # the API
docker compose -p kidlearn-edge logs --tail 100 caddy   # HTTPS
cat /var/log/kidlearn-backup.log                        # backups
```

**Website logs:** Vercel → project → **Logs**.

## Things that cost money or lock you out

- Skipping the budget alarm (Step 4).
- Unused Elastic IPs — AWS bills them even when not attached.
- Orange-cloud DNS records.
- Switching Caddy to real certificates before staging worked, or deleting the
  `caddy_data` volume.
- `prisma migrate dev` against the production database.
- Opening port 22.
- Putting any secret in Git.
