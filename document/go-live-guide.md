# Go-Live Guide — from zero to `https://kidlearn.net`

> **Who this is for.** You own `kidlearn.net` (bought from Namecheap) and nothing
> else exists yet: no AWS, no Vercel, no database. You are new to AWS, Vercel and
> deployment in general. Follow this file **top to bottom, in order**. Every step
> says **what** you do, **why** you do it, and **how to check** it worked. Where a
> script does work for you, a **"Behind the scenes"** box says what it did, so
> nothing is magic.
>
> **Related files.** `document/deployment-walkthrough.md` is the shorter, expert
> version of the same work. `document/runbook.md` is what you open *after* you are
> live, when something breaks. `document/implementation/38-deployment-aws-docker.md`
> holds the design decisions (why EC2 and not Fargate, why Mumbai, the cost
> table), and `38a-github-actions-continuous-deployment.md` the planned automation.
> You do not need any of them to follow this guide.
>
> This guide covers **production only** (`kidlearn.net`). The dev environment
> (`dev.kidlearn.net`) is Part B of the walkthrough. Do it later, once production
> works — Part 11 below explains how it fits on the same server.

**Time:** about one full day. You can stop between any two steps.
**Cost:** about **$14 per month** (AWS), plus your domain. Everything else is free.

---

## Part 0 — Understand what you are building

Read this once. It makes every later step make sense. Nothing here asks you to
click or type anything.

### 0.1 The big picture

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

**One important fact about the website:** `apps/web` never talks to the API from
Vercel's side. Every API call is made **by the parent's browser**, straight to
`api.kidlearn.net`. That is why Vercel needs no secret at all — only the public
address of the API.

### 0.2 What happens when a parent opens the site

```
 Parent's phone                Cloudflare DNS          Vercel              EC2 (Mumbai)              Supabase
 ──────────────                ──────────────          ──────              ────────────              ────────
 1. "where is kidlearn.net?" ─────►  "76.76.21.21"
 2. GET https://kidlearn.net ───────────────────────► page + JavaScript
 3. "where is api.kidlearn.net?" ►  "13.x.x.x"
                                    (your Elastic IP)
 4. fetch https://api.kidlearn.net/api/... ─────────────────────────────► Caddy :443
                                                                          │ decrypts HTTPS
                                                                          ▼
                                                                         prod-api :4000 ───SQL──► Postgres
                                                                          │               ◄──rows──
 5. JSON comes back  ◄──────────────────────────────────────────────────── ┘
```

Step 1 and 3 are DNS (Part 3 of this guide). Step 2 is Vercel (Part 7). Step 4
is Caddy plus the API container (Part 6). The database is Part 4.

### 0.3 Why the domain has to exist before the first deploy

Three configuration values tie the two halves together, and all three are
hostnames under `kidlearn.net`:

| Value | Lives in | Says |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Vercel | "the website calls `https://api.kidlearn.net`" |
| `WEB_ORIGIN` | Parameter Store | "the API accepts browser requests only from `https://kidlearn.net`" (CORS) |
| Google OAuth redirect URI | Google Cloud | "after sign-in, send people to `https://api.kidlearn.net/...`" |

Because both hostnames share one domain, the browser treats them as the same
site and the API's login cookie works without special settings. On two
unrelated addresses (say `kidlearn.vercel.app` and a raw AWS address) Safari
would block that cookie — so the domain and DNS come first, the deploys after.

### 0.4 Inside the server

One small computer runs everything server-side. You will build this up piece by
piece in Part 6; here is the finished picture.

```
┌──────────────── EC2 t4g.small · Amazon Linux 2023 (Arm) · Elastic IP 13.x.x.x ───────────────┐
│ Firewall (security group):  80/tcp  443/tcp  443/udp  open    ·    22 (SSH) CLOSED            │
│                                                                                              │
│  Docker                                                                                      │
│  ┌───────────── project kidlearn-edge ─────────────┐                                        │
│  │  kidlearn-caddy   ports 80, 443  (the ONLY one  │                                        │
│  │                   that listens to the internet) │                                        │
│  │  volume caddy_data = the HTTPS certificates     │                                        │
│  └───────────────┬─────────────────────────────────┘                                        │
│                  │ shared Docker network "kidlearn-edge"                                     │
│                  │ reverse_proxy prod-api:4000                                               │
│  ┌───────────────▼──────── project kidlearn-prod ──┐  ┌──── project kidlearn-dev (Part B) ─┐  │
│  │  prod-api       image kidlearn-api:<sha>        │  │  dev-api                          │  │
│  │                 env from /opt/kidlearn/prod/... │  │  dev-postgres  (throw-away DB)    │  │
│  │  prod-migrate   image kidlearn-migrate:<sha>    │  │  dev-migrate                      │  │
│  │                 runs ONLY with --migrate        │  └───────────────────────────────────┘  │
│  └─────────────────────────────────────────────────┘                                        │
│                                                                                              │
│  /opt/kidlearn/                         cron (the server's alarm clock)                      │
│    deploy/   scripts, copied from Git     01:30 daily   backup.sh       → S3                 │
│    prod/     app.env, compose.env,        02:00 Monday  weekly-reports.sh → API              │
│              last-good-tag                weekly        docker image prune (keeps 4)          │
│    edge/     caddy.env (your ACME email)                                                     │
│    dev/      (Part B)                                                                        │
│                                                                                              │
│  SSM agent ◄──── Session Manager: your terminal in the browser, no SSH                       │
│  IAM role kidlearn-instance: may read secrets, pull images, write backups — nothing else      │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

Three separate Docker Compose **projects** live on one box. They are separate so
that redeploying the API never restarts Caddy (which holds the certificates), and
redeploying dev never restarts production.

### 0.5 Where secrets travel

```
  YOU, once, in the AWS console
        │ type each value
        ▼
  ┌──────────────────────────────────┐
  │ SSM Parameter Store              │   encrypted at rest (KMS)
  │   /kidlearn/prod/DATABASE_URL    │   free (Standard tier)
  │   /kidlearn/prod/BETTER_AUTH_... │
  │   … 16 values                    │
  └───────────────┬──────────────────┘
                  │ deploy.sh reads them, using the SERVER's IAM role
                  │ (no password stored anywhere on the server)
                  ▼
  /opt/kidlearn/prod/app.env      owner root, mode 0600 (only root can read)
                  │ Docker Compose "env_file:"
                  ▼
  prod-api container ── apps/server/src/config/env.ts checks every value
                        and REFUSES TO START if one is missing or malformed
```

What is **not** in this picture: GitHub, your laptop's disk, the Docker image.
No secret ever goes there. Vercel holds only three public, non-secret values.

### 0.6 The whole life cycle of a change

This is the journey of every line of code from your editor to a child's phone.
Part 1 to 8 set it up once; Part 10 is how you live with it.

```
 ① WRITE            ② CHECK                ③ INTEGRATE        ④ PROMOTE            ⑤ SHIP
 ───────            ───────                ───────────        ─────────            ──────
 your Mac           GitHub Actions         branch dev         branch main
 feature/x ──PR──►  "gates" job:   green ─► merge ──PR dev→main──► merge ─┬─► AUTOMATIC: Vercel builds
                    lint, build,   ✅                    (gates again)    │   apps/web → kidlearn.net
                    typecheck,                                            │
                    tests, docker                                         └─► MANUAL (for now): you
                    builds                                                    build the 2 images on
                    red ❌ = cannot                                            your Mac → push to ECR →
                    merge                                                     deploy.sh on the server
                                                                              → api.kidlearn.net
 ⑥ RUN                                ⑦ PROTECT                        ⑧ UNDO
 ─────                                ─────────                        ──────
 Caddy renews HTTPS by itself         01:30 every night: database      API:  deploy.sh prod <old sha>
 Docker restarts a crashed API        → S3 (kept 30 days)               Web:  Vercel "Instant Rollback"
 Supabase stores the data             healthchecks.io emails you if
                                      a backup does not arrive
```

Today step ⑤ is half automatic (Vercel) and half by hand (the API). File 38a
will make the API half automatic too — Part 10.5 shows how. **Doing it by hand
first is deliberate**: an automated pipeline for a deploy nobody has ever done
manually fails on something its author never saw.

### 0.7 What you click, what you type, what a script does

| Job | Who does it | Where in this guide |
|---|---|---|
| Create accounts, buckets, repositories, the server | 🌐 **You**, in web consoles | Parts 2–6 |
| Point the domain at Cloudflare, add DNS records | 🌐 **You** | Steps 6–7, 19, 26 |
| Store secrets | 🌐 **You**, in Parameter Store | Step 13 |
| Create database tables | 💻 **You** run one Prisma command | Step 8c |
| Build and upload the API images | 💻 **You** run `docker build` / `docker push` | Step 16 |
| Install Docker, cron, swap, folders on the server | ⚙️ **`bootstrap.sh`**, automatically on first boot | Step 18 |
| Get and renew HTTPS certificates | ⚙️ **Caddy**, forever, by itself | Step 21 |
| Fetch secrets, pull images, migrate, start, health-check | ⚙️ **`deploy.sh`**, when you run it | Step 23 |
| Build and host the website | ⚙️ **Vercel**, on every push to `main` | Steps 24–26 |
| Nightly backup, weekly reports | ⚙️ **`backup.sh`, `weekly-reports.sh`** via cron | Step 27 |
| Delete old images so the disk never fills | ⚙️ a weekly cron job `bootstrap.sh` installed | Step 18 |
| Check every pull request | ⚙️ **GitHub Actions** (`gates`) | Part 1.5 |

### 0.8 Words you will meet

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
| **Port** | A numbered door on a computer. 443 is HTTPS, 80 is HTTP, 22 is SSH. |
| **IAM** | AWS's users and permissions system. |
| **IAM role** | Permissions given to a *machine* instead of a person, so no password sits on the server. |
| **Parameter Store** | A safe place in AWS for secrets (passwords, API keys). Free. Part of "Systems Manager" (SSM). |
| **Session Manager** | A terminal on your server, opened in your web browser. No SSH needed. |
| **User data** | A script AWS runs **once**, as root, the first time a new server boots. Ours is `deploy/bootstrap.sh`. |
| **Docker image** | Your app packed in a box with everything it needs to run. Built once, run anywhere. |
| **Container** | A running copy of an image. |
| **Docker Compose** | A YAML file that says "run these containers, with these settings, on this network". |
| **ECR** | A private place in AWS to store Docker images. |
| **Image tag / SHA** | The label on an image. We use the Git commit ID (`a1b2c3d`), so every image says exactly which code is inside. |
| **Migration** | A file that changes the database's shape (add a table, add a column). Lives in `packages/db/prisma/migrations/`. |
| **S3** | File storage in AWS. We use it for database backups. |
| **Caddy** | A small web server on EC2. It gets the free HTTPS certificate for `api.kidlearn.net` by itself. |
| **Reverse proxy** | A server that receives requests and passes them on to another one. Caddy does this for the API. |
| **Let's Encrypt / ACME** | The free service that gives HTTPS certificates; ACME is the protocol Caddy speaks to it. |
| **cron** | The server's alarm clock: runs a command at a set time. |
| **CI** | "Continuous integration" — GitHub running checks on every pull request. Ours is the `gates` job. |
| **CD** | "Continuous deployment" — the checks passing *also* ships the code. Vercel does this for the website; file 38a will for the API. |

### 0.9 Three places you will work

| Icon | Place | What you do there |
|---|---|---|
| 🌐 | A website (AWS, Vercel, Cloudflare, GitHub…) | Click buttons, fill forms |
| 💻 | Terminal on **your Mac**, inside the `kidlearn` folder | Database setup, building images |
| 🖥️ | Terminal **on the server** (opened in the browser) | Start Caddy and the API, set up cron |

### 0.10 Golden rules — read these twice

1. **AWS region is always Mumbai.** At the top right of every AWS page there
   is a region menu. It must say **Asia Pacific (Mumbai) ap-south-1**. If
   something you made has "disappeared", the region is wrong 99% of the time.
2. **Never put a secret in the repository.** Passwords and keys go in your
   password manager and in AWS Parameter Store. Nowhere else.
3. **Cloudflare cloud icon must be GREY, never orange,** on every record you
   make. Orange breaks HTTPS for this project.
4. **Never open port 22 (SSH)** on the server. You do not need it.
5. **Write things down as you go.** Use the "Values sheet" below.

### 0.11 Your values sheet

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

## Part 1 — Prepare your Mac, your code and GitHub

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

### 1.5 · How GitHub fits in (read, nothing to do yet)

GitHub is not only where the code is stored. It is the **gatekeeper** that
decides what code is allowed to reach `main`, and `main` is what goes live.

**Two long-lived branches:**

```
   feature/42-something ─┐
   feature/43-other ─────┼──PR──► dev ──PR──► main ──► production
   dependabot/... ───────┘        │                    (Vercel + EC2)
                                  └──► (later, Part B) the dev environment
```

- **`dev`** — the integration branch. Every feature branch and every Dependabot
  update merges here first.
- **`main`** — the release branch. Only `dev` should be merged into it. Vercel
  publishes `main` to `kidlearn.net`, and the API images you build come from
  `main`.

**The `gates` check** — `.github/workflows/ci.yml`. On every pull request into
`dev` or `main`, and on every push to them, GitHub starts a fresh Linux machine
and runs:

```
pnpm install --frozen-lockfile     the exact dependencies in pnpm-lock.yaml
pnpm lint                          Biome: style, formatting, import order
pnpm build                         every package and app compiles
pnpm typecheck                     TypeScript finds no errors
pnpm test:coverage                 every Vitest suite passes
pnpm --filter server test:db       the real-database tests, against a Postgres container
docker build  apps/web/Dockerfile                     ┐ the Docker files still build —
docker build  apps/server/Dockerfile --target runner  │ so a broken Dockerfile is found
docker build  apps/server/Dockerfile --target migrate ┘ in the PR, not at deploy time
```

Those Docker builds are **never uploaded** — CI builds them only to prove they
still work. The images that actually run on the server you build yourself in
Step 16 (until file 38a automates it).

**The branch rules — ruleset 17802318** (GitHub → repo → **Settings → Rules →
Rulesets**). Already set up; you do not need to change anything. On both `main`
and `dev` it:

| Rule | What it means for you |
|---|---|
| Require a pull request | You cannot `git push` straight to `main` or `dev`. |
| Require status check `gates` | The **Merge** button stays grey until `gates` is green ✅. |
| Block force pushes | History on `main`/`dev` cannot be rewritten. |
| Block deletion | Nobody can delete `main` or `dev` by accident. |

You are the repository admin, so GitHub lets you **bypass** these rules. Don't —
the rules are only useful if they are followed when you are in a hurry.

**Dependabot** (`.github/dependabot.yml`) opens a pull request into `dev` every
week with dependency updates. Treat it like any other PR: merge when `gates` is
green.

**Reading a red ❌ `gates`:** open the PR → **Checks** tab → click the red step.
Each command is its own step, so the step name tells you *what* broke (lint,
types, a test). From your Mac, `gh pr checks` shows the same.

### Step 2 · 🌐 Bring `main` up to date with `dev`

**Why:** the live website and the live server are built from the **`main`**
branch. If `deploy/` or recent fixes exist only on `dev`, Vercel builds an old
website and the server gets old deploy scripts.

1. Go to <https://github.com/salmanbd100/kidlearn>.
2. **Pull requests → New pull request**. Set **base: `main`**, **compare: `dev`**.
3. Create the pull request. Wait for the **`gates`** check to turn green ✅.
   (About 5 minutes. If it goes red, fix it on `dev` first — Part 1.5.)
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

### 2.5 · What is in `deploy/` (read, nothing to do)

These six items are the whole server side of the deployment. You will copy them
onto the server in Step 20.

```
deploy/
├── bootstrap.sh        Runs ONCE when the server is born. Installs Docker, the
│                       Compose plugin, cron, 2 GB swap, makes /opt/kidlearn/*,
│                       and a weekly job that deletes old images.
├── edge/
│   ├── compose.yml     Starts Caddy. Opens ports 80/443. Creates the shared
│   │                   "kidlearn-edge" network. Keeps certificates in caddy_data.
│   └── Caddyfile       "api.kidlearn.net → send to prod-api:4000" (and the
│                       same for api.dev.kidlearn.net, used in Part B).
├── app/
│   ├── compose.yml     Describes the API container (and the migrate job) for
│   │                   ANY environment — the environment name is a variable.
│   └── compose.dev.yml Extra pieces only dev has: its own Postgres, memory caps.
├── deploy.sh           The release button. "deploy.sh prod <sha>" — Part 6.
├── backup.sh           Nightly database dump to S3 — Step 27.
└── weekly-reports.sh   Monday trigger for parent reports — Step 27.
```

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

   This saves the key in `~/.aws/credentials` on your Mac — outside the repo.

4. **Log out** of root. From now on, log in with the **console sign-in URL** as
   `salman-admin`.

✅ **Check:**

```bash
aws sts get-caller-identity
# shows "Arn": "arn:aws:iam::<12 digits>:user/salman-admin"
```

Write the 12-digit number in your values sheet as **AWS account ID**.

**Who is who in AWS — you will meet three identities:**

```
 root user            the account owner. Locked away with MFA. Used almost never.
 salman-admin (user)  YOU, every day: console clicks + the aws CLI on your Mac.
 kidlearn-instance    THE SERVER (Step 17). A role, not a user: no password,
 (role)               no key — AWS hands the server short-lived credentials itself.
```

### Step 4 · 🌐 Budget alarm — before you create anything that costs money

**Why:** if you make a mistake (for example a bigger server than planned), AWS
keeps charging silently. The `t4g` server also runs in "unlimited CPU" mode by
default, which bills extra rather than slowing down under heavy load. This alarm
emails you before the bill grows.

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

```
 BEFORE                                  AFTER
 Namecheap = registrar (you pay it)      Namecheap = registrar (you still pay it)
 Namecheap = DNS (the phone book)        Cloudflare = DNS (the phone book)
                                         Namecheap only says "ask Cloudflare"
```

You keep the domain at Namecheap. Only the phone book moves.

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
Parts 4–5; you need DNS only in Step 19.

**Why grey cloud, not orange?** Orange means "Cloudflare's proxy": traffic goes
*through* Cloudflare, which then shows its own address instead of yours. That
breaks two things here — Caddy cannot prove to Let's Encrypt that it owns
`api.kidlearn.net`, and Vercel cannot issue its certificate. Grey means
"phone book only", which is all we want.

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

*Why two?*

```
 prod-api  ── many short queries ──► :6543 TRANSACTION pooler ─┐
                                     (shares a few real        │
                                      connections among many)  ├──► Postgres
 migrate, backup ── one long ───────► :5432 SESSION pooler ────┘
                    connection        (one real connection,
                                       held until you finish)
```

The app makes many short connections — the **transaction pooler** is built for
that. Migrations and backups need one long, stable connection — the **session
pooler** gives that.

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
migration files in `packages/db/prisma/migrations/`, and records each one in a
table called `_prisma_migrations` so it never runs twice. The values are typed
in the command, so no secret is saved in a file.

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
parent report. If one of them silently stops, nobody would notice — cron on the
server has no way to email you. healthchecks.io is a **dead man's switch**: it
expects a "ping" every day/week and **emails you when it does not come**.

```
 every night 01:30         backup.sh ──ok──► GET https://hc-ping.com/<id>       → check stays green
                                     ──fail─► GET https://hc-ping.com/<id>/fail  → email NOW
 the server is dead / cron broken:   no ping at all → after 1 day + 2 h grace     → email
```

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

*Why let the bucket delete old backups instead of the script?* A script that
deletes its own old backups is a script that can, with one bug, delete all of
them. The server is deliberately not allowed to delete finished backups at all
(see the policy in Step 17).

✅ **Check:** the bucket is listed with "Objects can be public" **not** shown.
Bucket name is in your sheet.

### Step 13 · 💻🌐 Secrets — Parameter Store

**Why:** the API needs about 16 secret values to start. We store them in AWS,
encrypted. The server reads them itself at deploy time (diagram 0.5), so no
secret ever sits in GitHub or on your laptop's disk.

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

*What about `NODE_ENV`, `PORT`, `LOG_LEVEL`…?* Those are not secret and are the
same on every deploy, so they live in `deploy/app/compose.yml` instead. The full
list of every variable and its home is `runbook.md` §4.

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

*What that block does, line by line:* `set -a` means "every variable I set from
now on is exported". The long `eval` line asks Parameter Store for every
`/kidlearn/prod/*` value, turns `/kidlearn/prod/DATABASE_URL` into
`DATABASE_URL=…`, and sets it in this shell only. `set +a` stops exporting.
Then the seed script runs with those values. `exit` leaves the bash shell and
throws the variables away.

Then **close this Terminal window** — it held production secrets in memory.

✅ **Check:** the script says the admin was created. Save email and password in
your sheet. (Running it again with a new password is how you reset it.)

### Step 15 · 🌐 Image storage — ECR

**Why:** the server does not build code. You build a Docker image on your Mac,
put it in ECR, and the server downloads it from there.

```
 your Mac                         ECR (Mumbai, private)                 EC2 server
 docker build ──docker push──►    kidlearn-api:a1b2c3d     ◄──docker pull── deploy.sh
                                  kidlearn-migrate:a1b2c3d
```

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

(AWS also silently creates an **instance profile** with the same name. That is
the wrapper EC2 needs to attach a role to a server — you will pick it in Step
18 under "IAM instance profile".)

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

In plain words, statement by statement:

| Statement | Lets the server… | Used by |
|---|---|---|
| `ecr:GetAuthorizationToken` | log in to ECR | `deploy.sh` |
| `ecr:BatchGetImage`… | **download** our two images (not upload, not others) | `deploy.sh` |
| `ssm:GetParameter*` | **read** `/kidlearn/prod/*` and `/kidlearn/dev/*` | `deploy.sh`, `backup.sh`, `weekly-reports.sh` |
| `kms:Decrypt` (via SSM only) | unlock SecureString values | same |
| `s3:PutObject` | **write** backup files | `backup.sh` |
| `s3:DeleteObject` on `.partial/` only | clean up a half-finished backup — never a finished one | `backup.sh` |
| `s3:GetObject`, `ListBucket` | read backups back (for a restore) | you, during a restore |

…and **nothing else**.

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
*Why `small` (2 GB memory)?* The API, Caddy and later the dev stack need about
1.1 GB together. `micro` (1 GB) would leave no room for a nightly backup.
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

> **Behind the scenes — what `bootstrap.sh` does on first boot (about 2–3 min)**
>
> ```
>  1. dnf install docker            → systemctl enable --now docker
>  2. download Docker Compose v2 plugin (Arm build)  → "docker compose" works
>  3. dnf install cronie            → Amazon Linux 2023 ships with NO cron;
>                                     without this, backups would never run
>  4. create /swapfile (2 GB), swappiness 10
>                                   → a memory spike slows down instead of
>                                     the kernel killing the API
>  5. mkdir /opt/kidlearn/{prod,dev,edge}  (mode 0700: root only)
>     mkdir /opt/kidlearn/deploy           (empty — you fill it in Step 20)
>  6. write /etc/cron.weekly/kidlearn-docker-prune
>                                   → every week, delete all but the 4 newest
>                                     images per repository, so the 20 GB disk
>                                     never fills (a full disk = API down)
>  7. log "done — instance is ready for deploy/deploy.sh"
> ```
>
> It pulls **no** application image and needs **no** secret. Its output is in
> `/var/log/cloud-init-output.log` on the server. It runs **once**: if it ever
> needs re-running, the recovery is a fresh server from this file, not running
> it again.

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

```
 Your browser ──HTTPS──► AWS Systems Manager ◄──outbound── SSM agent on the server
                         (checks your IAM user)             (the server dials OUT,
                                                             so no inbound port 22)
```

> **Cannot connect?** Wait 2 more minutes and retry. Still no? Check the role:
> **Actions → Security → Modify IAM role** must show `kidlearn-instance`.
> Never "fix" this by opening port 22.

(Later, if you prefer your Mac's own terminal: `aws ssm start-session --target
<instance-id>` does the same. `runbook.md` §2 also shows real `ssh`/`scp` *through*
Session Manager, still with port 22 closed.)

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

> Whenever anything in `deploy/` changes in the future, repeat 20c. The server
> never updates these files on its own (until file 38a). If a deploy behaves
> like an older version of the scripts, this is why.

### Step 21 · 🖥️ HTTPS for the API — Caddy, in two careful stages

**Why two stages?** Caddy asks Let's Encrypt for a certificate the moment it
starts. Let's Encrypt allows only a few tries per week. If DNS is wrong, you can
burn all your tries and have **no HTTPS for a week**. So first we test with
Let's Encrypt's **staging** (practice) service, which has no such limit. Only
when that works do we switch to the real one.

```
 Caddy starts ──► "I want a certificate for api.kidlearn.net" ──► Let's Encrypt
                                                                     │
 Let's Encrypt ──► looks up api.kidlearn.net in DNS → your Elastic IP │
               ──► http://api.kidlearn.net/.well-known/acme-challenge/… (port 80)
                                                                     │
 Caddy answers the challenge ──► certificate issued, saved in caddy_data volume
 Every ~60 days Caddy renews it by itself. You never touch it again.

 Stage 1  ACME_CA unset          → STAGING   (untrusted cert, unlimited tries)
 Stage 2  ACME_CA=…acme-v02…     → PRODUCTION (trusted cert, 5 per week)
```

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

> **Behind the scenes — `deploy/edge/compose.yml`**
>
> - starts one container, `kidlearn-caddy`, from a Caddy image pinned to an exact
>   version *and* digest (so it can never change under you);
> - binds host ports `80`, `443` and `443/udp` — the **only** ports any container
>   on this server opens;
> - creates the Docker network `kidlearn-edge` that the API will join;
> - keeps certificates in the named volume `caddy_data`;
> - reads `ACME_EMAIL` / `ACME_CA` from `/opt/kidlearn/edge/caddy.env`;
> - `restart: unless-stopped`, so it comes back after a reboot.
>
> The Caddyfile also lists `api.dev.kidlearn.net` (for Part B). That name has no
> DNS record yet, so the logs show certificate errors **for that name only**.
> That is expected and harmless for `api.kidlearn.net`; it stops once you do
> Part B.

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
running yet" — which is true; you start it in Step 23. (502 = "Bad Gateway":
Caddy is up but has nobody to pass the request to.)

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
**new** client — keep your local one separate, so the production secret never
sits in a less protected environment. (Part 0.3 shows how this ties to the
other two hostname settings.)

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

The API reads secrets only when `deploy.sh` runs, so this change takes effect in
the next step. (Later, every time you change a parameter, run `deploy.sh` again
with the **same** tag to pick it up.)

### Step 23 · 🖥️ Start the API

**Why:** everything the API needs now exists: database, secrets, images, HTTPS.
`deploy.sh` reads the secrets, downloads the image, starts it, and checks it is
healthy *and* can reach the database.

On the server terminal (`sudo su -` first if it is a new window):

```bash
/opt/kidlearn/deploy/deploy.sh prod <IMAGE TAG from Step 16>
```

> **Behind the scenes — what `deploy.sh prod a1b2c3d [--migrate]` does**
>
> ```
>  0. check arguments: env must be exactly "prod" or "dev", tag must be given
>  │
>  1. SECRETS   aws ssm get-parameters-by-path /kidlearn/prod/ (decrypted)
>  │            → /opt/kidlearn/prod/app.env   (root only, 0600)
>  │            refuses if there are 0 parameters or a value spans lines
>  │            ("$" is doubled so Docker Compose does not eat it)
>  │
>  1b. COMPOSE VARIABLES → /opt/kidlearn/prod/compose.env
>  │            ENV_NAME=prod  ECR_REGISTRY=…  IMAGE_TAG=a1b2c3d
>  │            LOG_LEVEL=info  ENABLE_API_DOCS=false
>  │            (remembers the last GOOD tag for the rollback hint)
>  │
>  2. PULL      docker login to ECR → docker compose pull api
>  │
>  2b. MIGRATE  only with --migrate:
>  │            run kidlearn-migrate:a1b2c3d → prisma migrate deploy
>  │            ✖ fails → STOP. Nothing restarted; the old API keeps serving.
>  │
>  3. UP        docker compose -p kidlearn-prod up -d   (replaces prod-api)
>  │            a few seconds of 502 while the new container starts
>  │
>  4. HEALTH GATE (up to ~150 s)
>  │   container healthcheck: GET /health      ← is the process alive?
>  │      then          GET /ready             ← can it query the database?
>  │
>  ├── ✔ both pass → write last-good-tag
>  │                 "healthy and database reachable — deploy complete at a1b2c3d"
>  │
>  └── ✖ fails    → print the last 50 log lines
>                   print "ROLL BACK WITH: deploy.sh prod <last good tag>"
>                   exit 1   (the new image is LEFT running, so you can read why)
> ```
>
> Migrations only run when you add `--migrate` — a database change should be a
> decision you make, never a side effect of restarting a container.

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

**How Vercel works, in one picture:**

```
 GitHub push to main ──webhook──► Vercel
                                    │ 1. clone the repo
                                    │ 2. pnpm install --frozen-lockfile
                                    │ 3. cd ../.. && pnpm turbo run build --filter=web
                                    │      (NEXT_PUBLIC_* values are baked in HERE)
                                    │ 4. upload the result to its global network
                                    ▼
                         kidlearn.net  (HTTPS certificate: Vercel's job)

 GitHub push to any other branch ──► a "preview" deployment at a *.vercel.app link
```

You never upload anything to Vercel yourself. Merging to `main` **is** the
website deploy.

### Step 24 · 🌐 Create the Vercel project

**Why:** Vercel builds `apps/web` from GitHub and serves it worldwide, with
HTTPS, for free.

1. <https://vercel.com/new> → **Import Git Repository**. If `kidlearn` is not
   listed, click **Adjust GitHub App Permissions** and allow the `kidlearn`
   repo. (*This installs the Vercel GitHub App — it is how Vercel hears about
   your pushes. You can see it later under GitHub → Settings → Applications.*)
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
website's JavaScript when it is built. If you change one later, nothing happens
until you **redeploy**.

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

> **About preview links.** Pushes to `dev` and feature branches still get a
> preview at a `…vercel.app` address. Those previews load, but **sign-in and data
> do not work there**: the API only accepts requests from `https://kidlearn.net`
> (`WEB_ORIGIN`). That is the API protecting itself, not a bug. The proper dev
> site is Part B of the walkthrough.

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

Your Cloudflare DNS should now have **exactly three records**, all grey:

```
 Type   Name   Points to                 Served by
 A      @      Vercel's IP               Vercel  → kidlearn.net
 CNAME  www    …vercel-dns…              Vercel  → redirects to kidlearn.net
 A      api    your Elastic IP           EC2/Caddy → api.kidlearn.net
```

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

*Reading a cron line:* `30 1 * * *` = minute 30, hour 1, every day of month,
every month, every weekday. `0 2 * * 1` = 02:00 on weekday 1 (Monday).
`>>…log 2>&1` appends all output to a log file you can read later.

> **Behind the scenes — `backup.sh`**
>
> ```
>  read DIRECT_URL, BACKUP_S3_BUCKET, BACKUP_HEARTBEAT_URL from Parameter Store
>  │
>  ask the database its Postgres version (psql in a throw-away container)
>  │  → pick the matching postgres:<major>-alpine image for pg_dump
>  │    (a too-old pg_dump refuses a newer server; Supabase upgrades in place)
>  │
>  pg_dump --schema=public  ──gzip──►  s3://<bucket>/prod/.partial/<time>.sql.gz
>  │   streamed: nothing is written to the server's own disk
>  │
>  size < 1 KB?  ──yes──► FAIL (an empty dump is not a backup)
>  │
>  move .partial/<time>.sql.gz → prod/<time>.sql.gz     ← only now is it "real"
>  │
>  ping healthchecks.io ✔
>
>  on ANY failure: delete the .partial file, ping <url>/fail ✖, exit non-zero
> ```
>
> `--schema=public` is everything KidLearn owns. Supabase's own internal schemas
> are skipped because they cannot be restored into plain Postgres. The restore
> procedure is `runbook.md` §8 — rehearse it once (walkthrough Part B does).
>
> **Behind the scenes — `weekly-reports.sh`**
>
> Reads `CRON_SECRET` from Parameter Store and sends
> `POST https://api.kidlearn.net/api/admin/jobs/weekly-reports` with
> `Authorization: Bearer <CRON_SECRET>`. The API answers `202 Accepted` and does
> the work in the background, so a green ping means "the run started", not
> "every report was written" — failures for individual children are in the API
> log. The secret is passed on stdin, never as a command-line argument, so other
> processes on the server cannot see it.

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

### Step 28 · 💻📱 Smoke test — every layer, end to end

**Why:** each earlier check proved one piece. This proves the pieces are wired
to each other: DNS → HTTPS → Caddy → container → database, and Vercel → API.

💻 From your Mac:

```bash
dig +short api.kidlearn.net                        # your Elastic IP         (DNS)
curl -s https://api.kidlearn.net/health            # {"data":{"status":"ok",…}}  (Caddy + container)
curl -si https://api.kidlearn.net/docs | head -1   # 404                     (production config)
curl -si https://kidlearn.net | grep -i x-robots   # prints NOTHING          (Vercel, prod settings)
curl -si -H 'Origin: https://kidlearn.net' https://api.kidlearn.net/health \
  | grep -i access-control-allow-origin            # https://kidlearn.net    (CORS / WEB_ORIGIN)
```

🖥️ On the server:

```bash
ss -tlnp            # only Caddy, on 80 and 443
docker ps           # kidlearn-caddy and prod-api, both "Up", prod-api "(healthy)"
```

📱 Then on your phone, at `https://kidlearn.net` — this is the one test that
crosses every system (Vercel, Cloudflare, Caddy, the API, Supabase, Google):

1. Sign in with Google.
2. **Reload the page — you are still signed in.** If reload logs you out, the
   hostname settings in Part 0.3 disagree; fix that first.
3. Sign in with your **admin** account (Step 14) on a computer — it works.

> # 🎉 You are live!

---

## Part 9 — Finish the paperwork

- Fill the `<placeholders>` in `document/runbook.md` (registrar = Namecheap,
  Elastic IP, instance ID, bucket name, "ACME endpoint: production").
- Mark file 38 provisioning done in
  `document/implementation/00-progress-tracker.md`.
- After one full day, open **AWS Billing → Budgets**. The forecast should be
  around **$14/month**.
- Delete the AWS access key from Step 3d? **No** — you still need it to push
  images. But never share it, and make a new one if you think it leaked.

---

## Part 10 — Living with it: the release life cycle

Everything above happens **once**. This part is what you do every week.

### 10.1 · Ship a new version

```
 💻 feature branch ──PR──► dev ──(gates ✅, merge)──► PR dev → main ──(gates ✅, merge)
                                                                   │
                     ┌─────────────────────────────────────────────┴───────────────┐
                     ▼ AUTOMATIC                                                    ▼ BY HAND
          Vercel builds main → kidlearn.net                 💻 Step 16 on main → new SHA
          (2–3 minutes, watch Deployments)                  🖥️ deploy.sh prod <new SHA> [--migrate]
```

1. **Website:** merge the `dev → main` pull request. Vercel deploys by itself.
2. **API:**
   1. 💻 `git checkout main && git pull`, then run Step 16 again → a new `SHA`.
   2. 🖥️ `/opt/kidlearn/deploy/deploy.sh prod <new SHA>` — add `--migrate` at
      the end if the release adds files under
      `packages/db/prisma/migrations/`. It applies them before restarting the API.
3. **If `deploy/` files changed in this release:** repeat Step 20c **before**
   step 2.
4. 💻 `curl -s https://api.kidlearn.net/health` and click through the site.

**Which half goes first?** Vercel finishes before you have built the images, so
for a few minutes the **new website talks to the old API**. That is fine as long
as every change keeps working against the version before it — the same rule as
migrations, below.

**How to know whether a release has migrations:**

```bash
git diff --name-only <previous SHA> <new SHA> -- packages/db/prisma/migrations/
# prints anything → use --migrate
```

### 10.2 · Database changes safely — "expand, then contract"

During a deploy, and after any rollback, the **old** API runs against the **new**
database shape. So a migration must never break the version before it:

```
 Release 1 (EXPAND)    add the new column (nullable, or with a default)
                       new code writes both / reads the new one
                       ── deploy, wait ──
 Release 2 (CONTRACT)  drop the old column, once nothing running uses it
```

Never edit a migration that has already run, and never `prisma migrate dev`
against production. A bad migration is fixed by a *new* migration. Details:
`runbook.md` §3.

### 10.3 · Undo a bad release

Undo **both** halves — they are separate systems:

```
 API      🖥️ /opt/kidlearn/deploy/deploy.sh prod <previous SHA>
          (no --migrate: migrations only go forward)
 Website  🌐 Vercel → project → Deployments → the last good one → ⋯ → Instant Rollback
```

**Finding the previous SHA:** `cat /opt/kidlearn/prod/last-good-tag` *before*
you deploy the new one, your values sheet, the ECR console (images sorted by
date), or — after a failed deploy — the `ROLL BACK WITH:` line `deploy.sh`
printed. The server keeps the 4 newest images; ECR keeps 10. Anything older
cannot be rolled back to without rebuilding.

### 10.4 · What keeps running without you

| What | How often | Where to look if it stops |
|---|---|---|
| HTTPS renewal for `api.kidlearn.net` | ~every 60 days | `docker compose -p kidlearn-edge logs caddy` |
| HTTPS for `kidlearn.net` | automatic | Vercel → Settings → Domains |
| Database backup → S3 | daily 01:30 | healthchecks.io email; `/var/log/kidlearn-backup.log` |
| Weekly parent reports | Monday 02:00 | healthchecks.io email; `/var/log/kidlearn-weekly-reports.log` |
| Old image clean-up | weekly | `df -h /` — disk should stay well below 80% |
| Old backup expiry | after 30 days | S3 lifecycle rule `expire-30-days` |
| API restart after a crash or reboot | immediately | `restart: unless-stopped` in Compose |
| Dependency update PRs | weekly | GitHub → Pull requests (Dependabot) |

Things that **do** need you: Supabase pauses a free project after 7 days with
no traffic (only before launch); a secret change needs `deploy.sh` re-run with
the same tag; a Vercel `NEXT_PUBLIC_*` change needs a redeploy; and security
updates for the server itself (`dnf upgrade` now and then, then reboot during a
quiet hour).

### 10.5 · Where this is going — automatic API deploys (file 38a, not built yet)

Today the API half of a release is three commands you type. File 38a turns them
into a GitHub Actions job. Nothing in the server design changes — the job runs
the **same `deploy.sh`**, which is exactly why you do it by hand first.

```
 TODAY                                              AFTER 38a
 ─────                                              ─────────
 merge to main                                      merge to main
   │                                                  │
   ▼                                                  ▼
 💻 docker build ×2, docker push ×2                 GitHub Actions "gates" ✅
   │   (your Mac, your AWS key)                       │
   ▼                                                  ▼ job "deploy" (needs: gates)
 🖥️ open Session Manager                              │ 1. log in to AWS with OIDC —
   │                                                  │    a short-lived token, NO key
   ▼                                                  │    stored in GitHub
 deploy.sh prod <sha>                                 │ 2. build both images on an Arm
                                                      │    runner, push to ECR
                                                      │ 3. aws ssm send-command →
                                                      │    "deploy.sh prod <sha>" on the box
                                                      ▼ 4. job goes red if deploy.sh fails
                                                    push to dev → same thing → api.dev.kidlearn.net
                                                    "rollback" button = workflow_dispatch with a SHA
```

What you would set up by hand for it (on the day, from file 38a):

- 🌐 **AWS IAM → Identity providers:** add `token.actions.githubusercontent.com`
  (this lets AWS trust GitHub's tokens), then **two roles** — one for
  `production`, one for `development` — each allowed to push images and run a
  command on this one server, and **not** to open a shell or read secrets.
- 🌐 **GitHub → Settings → Environments:** create `production` and
  `development`, each with variables like `AWS_ROLE_ARN` and
  `EC2_INSTANCE_ID`. **No secrets** — OIDC replaces them.
- 🌐 **GitHub → Rulesets:** add a `promotion-guard` check to `main`, so a pull
  request into `main` from anything but `dev` cannot merge.

Until then, keep the access key from Step 3d — it is what pushes images.

---

## Part 11 — Where the dev environment fits (later)

Walkthrough Part B adds a full second environment **on the same server**, for
testing a release before it reaches parents:

```
                        ONE EC2 server, ONE Caddy
                    ┌────────────────┴────────────────┐
     api.kidlearn.net                          api.dev.kidlearn.net
           │                                          │
   kidlearn-prod project                       kidlearn-dev project
   prod-api ──► Supabase (backed up)           dev-api ──► dev-postgres container
   secrets /kidlearn/prod/*                    secrets /kidlearn/dev/*  (all DIFFERENT)
   docs OFF, no memory cap                     docs ON, 400 MB memory cap each
           ▲                                          ▲
   Vercel project "kidlearn"  (main)           Vercel project for dev  (dev)
   kidlearn.net                                dev.kidlearn.net  (password-protected)
```

It reuses the **same images** (`deploy.sh dev <sha>`), its own secrets, its own
throw-away database, and its own Vercel project. It costs nothing extra on AWS.
Do it once production has been stable for a few days.

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
| Caddy logs errors about `api.dev.kidlearn.net` | Expected until Part B — that name has no DNS record yet |
| Session Manager will not connect | Server still starting (wait), or role `kidlearn-instance` not attached. **Never** open port 22 |
| `deploy.sh`: "no parameters found" | Parameter name typo, wrong region, or wrong account number in the role JSON |
| `deploy.sh`: "exited — it did not get as far as a healthcheck" | A secret is missing or malformed — the printed log names the variable `env.ts` rejected |
| `deploy.sh`: "up but /ready failed" | Check `DATABASE_URL` in Parameter Store; is the Supabase project **paused**? |
| `docker pull` "denied" / "no basic auth credentials" | Role policy: account ID or repository name wrong in Step 17 |
| `pull access denied … not found` | The tag does not exist in ECR — typo, or Step 16 not pushed |
| Backup fails every night | `DIRECT_URL` must be the **Session pooler** string (port 5432 on `pooler.supabase.com`), not "Direct connection" |
| Vercel build: `@kidlearn/types` has no `dist` | Build command must be `cd ../.. && pnpm turbo run build --filter=web` |
| Website loads but sign-in fails | Google client origins/redirect (Step 22); is the consent screen **published**? |
| Sign-in fails on a `…vercel.app` preview | Expected — previews are not `WEB_ORIGIN` (Step 25 note) |
| You changed a Vercel variable and nothing changed | `NEXT_PUBLIC_*` are built in — **Redeploy** |
| You changed a Parameter Store value and nothing changed | Run `deploy.sh prod <current SHA>` again — secrets are read at deploy time |
| Logged out on every reload | `WEB_ORIGIN` / `BETTER_AUTH_URL` in Parameter Store, then redeploy the API |
| GitHub will not let you merge | `gates` is red or still running — open **Checks** (Part 1.5) |
| Server disk full | `df -h /`, `docker system df`; the weekly prune keeps 4 images. **Never** `docker volume prune` |

**Reading logs on the server:**

```bash
sudo su -
docker compose -p kidlearn-prod logs --tail 100 api     # the API
docker compose -p kidlearn-edge logs --tail 100 caddy   # HTTPS
cat /var/log/kidlearn-backup.log                        # backups
cat /var/log/kidlearn-weekly-reports.log                # weekly reports
docker ps                                               # what is running, and since when
ss -tlnp                                                # listening ports: only Caddy on 80/443
free -m && df -h /                                      # memory and disk
```

**Website logs:** Vercel → project → **Logs**. **CI logs:** GitHub → the PR →
**Checks**.

## Things that cost money or lock you out

- Skipping the budget alarm (Step 4).
- Unused Elastic IPs — AWS bills them even when not attached.
- Orange-cloud DNS records.
- Switching Caddy to real certificates before staging worked, or deleting the
  `caddy_data` volume.
- `prisma migrate dev` against the production database.
- Opening port 22.
- Putting any secret in Git.
- Bypassing the `gates` check as repository admin "just this once".
