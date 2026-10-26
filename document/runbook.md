# KidLearn — Operations Runbook

> **What this is for:** the thing you open when production is down, when a deploy
> has to be rolled back, or when you have forgotten where a value lives. It is
> written to be read in a hurry. > Design rationale lives in
> `document/implementation/38-deployment-aws-docker.md`; this file is procedure
> and reference.
>
> **Bringing this into existence for the first time?** You want
> `document/deployment/`, not this file. It is the one-time, sequential
> provisioning, with every command spelled out and the AWS vocabulary explained,
> and it links back here for the reference tables. Come back here once
> production is up.
>
> **Status:** the repository half of file 38 is implemented and verified locally.
> **No AWS, Vercel, Cloudflare or Supabase resource has been provisioned yet.**
> Every value written `<like-this>` is a placeholder to be filled in on the day it
> is created. A section marked **⬜ not yet done** describes a procedure that has
> been written but never executed — treat it as a plan, not as a record.

---

## 1. Topology

| Environment | Branch | Web (Vercel) | API (EC2) | Database |
|---|---|---|---|---|
| **Production** | `main` | `kidlearn.net`, `www.kidlearn.net` | `api.kidlearn.net` | Supabase free project, `ap-south-1` |
| **Development** | `dev` | `dev.kidlearn.net` | `api.dev.kidlearn.net` | `dev-postgres` container on the box |

One `t4g.small` in `ap-south-1` runs both API stacks behind Caddy. Vercel serves
the three web hostnames and terminates their TLS itself. Media is on Cloudinary.

Three Compose projects on one box (separate so that deploying one cannot restart
another):

| Project | Files | Holds |
|---|---|---|
| `kidlearn-edge` | `deploy/edge/compose.yml` | Caddy, and the `kidlearn-edge` network. **Bring up first** — the other two join that network as `external`. |
| `kidlearn-prod` | `deploy/app/compose.yml` | `prod-api`, and the `prod-migrate` job under a profile |
| `kidlearn-dev` | `deploy/app/compose.yml` + `compose.dev.yml` | `dev-api`, `dev-postgres`, `dev-migrate` |

**`prod-api` and `dev-api` are network aliases, not service names.** Both stacks
call the service `api`, and on a shared network Compose registers the service
name as an alias too — so `reverse_proxy api:4000` resolves to whichever stack
answered DNS first. Verified: `dev-api`'s aliases on `kidlearn-edge` are
`["dev-api", "api", "dev-api"]`. The Caddyfile must always name the prefixed
alias.

### What is and is not isolated

Data and frontends are isolated; API runtime is only soft-isolated. **A dev
container that fills the EBS volume takes the production API down with it.**
The full statement, and the fix if it stops being acceptable, is in file 38,
"The isolation this design does and does not give you".

---

## 2. Getting a shell — and the logs

**The security group has no port 22 rule, and does not need one.** There are
three ways in, all through Session Manager, which needs no inbound rule and
leaves an audit trail.

If none of them works, the instance role has lost `AmazonSSMManagedInstanceCore`
or the agent is down — that is the thing to fix, not a temporary port 22 rule.

**1. Browser.** EC2 console → tick the instance → **Connect** → **Session
Manager** → Connect. Nothing to install; useful from a machine that is not yours.

**2. Terminal, quickest.**

```bash
aws ssm start-session --target <instance-id> --region ap-south-1
sudo su -
```

**3. Real SSH from your own terminal — `ssh`, `scp`, `rsync`, `ssh -L`, VS Code
Remote.** Still over Session Manager: the transport is the SSM tunnel, so there
is no open port and the session is still audited. See §2a for the one-time setup;
afterwards it is, 💻 **on your Mac**:

```bash
ssh kidlearn                                   # a shell
scp -r deploy/ kidlearn:/tmp/                  # copy files up
rsync -az --delete deploy/ kidlearn:/tmp/deploy/
ssh -N -L 15432:<dev-postgres address>:5432 kidlearn   # tunnel a port to your machine
```

The tunnel's far end is resolved on the host, where the name `dev-postgres`
does not exist — it is only on dev's Docker network, and the container
publishes no port. Use the container's address instead, read 🖥️ **on the
server** (`ssh kidlearn`, then `sudo su -`):

```bash
docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' dev-postgres
```

Then connect to `localhost:15432` from your Mac. It changes when the container
is recreated (a wipe in `deployment/` Step 33a), so read it again each time.

### 2a. One-time setup for SSH over Session Manager

Do this once per Mac. Afterwards `ssh kidlearn` gives you a shell on the server,
and the tunnel in `deployment/` Step 32b works.

#### Where each command runs

Every command below is marked with **where you type it**. Running one in the
wrong place is the most common mistake here, and the error it gives does not say
"wrong machine".

| Mark | Where | How you know you are there |
|---|---|---|
| 💻 **Mac** | A normal Terminal window on your own computer | Your usual prompt, e.g. `❯` or `yourname@MacBook ~ %` |
| 🖥️ **Server** | Inside a Session Manager session on the EC2 box | The prompt is `sh-5.2$`, or `[root@ip-172-31-…]#` after `sudo su -` |

To get from the Mac **into** the server:
`aws ssm start-session --target <instance-id> --region ap-south-1`.
To get **back out** to the Mac: type `exit` (twice if you ran `sudo su -`), or
press Ctrl-D, until you see `Exiting session with sessionId: …`.

#### What you are building, in plain words

- **SSH** is the standard way to log in to a Linux machine from a terminal. It
  proves who you are with a **key pair** instead of a password.
- A **key pair** is two files made together. The **private key**
  (`~/.ssh/kidlearn`) never leaves your Mac — it is your identity. The **public
  key** (`~/.ssh/kidlearn.pub`) is safe to share; you give a copy to the server.
- **`authorized_keys`** is a file on the server listing the public keys allowed
  to log in as a user. When you connect, the server checks that your Mac holds
  the private key matching a line in it.
- **Session Manager (SSM)** is AWS's way in to the server without opening port
  22 to the internet. SSH normally needs that port; here SSH travels *inside* an
  SSM connection instead, so the server stays closed.
- **`~/.ssh/config`** is a file on your Mac that holds shortcuts. The
  `Host kidlearn` block in it is what makes the word `kidlearn` mean "this
  instance, this user, this key, through SSM". `kidlearn` is **not** a real
  internet name — without that block, `ssh kidlearn` cannot find anything.

```
 💻 Mac                                              🖥️ EC2 server
 ~/.ssh/kidlearn      (private key, stays here)
 ~/.ssh/kidlearn.pub  ──── copied once (step 3) ───► /home/ec2-user/.ssh/authorized_keys
 ~/.ssh/config        (the "kidlearn" shortcut)
        │
        └── ssh kidlearn ══ SSM tunnel, no open port ══► sshd checks the key ► shell
```

`~` means your home folder: `/Users/<you>` on the Mac, `/home/ec2-user` for
`ec2-user` on the server. A path starting `~/.ssh` is a different file on each
machine.

#### Step 1 · 💻 Mac — install the plugin and make the key pair

```bash
brew install --cask session-manager-plugin
session-manager-plugin                          # prints a version — the plugin is installed

ssh-keygen -t ed25519 -f ~/.ssh/kidlearn -C "kidlearn-ec2"
```

`ssh-keygen` asks for a passphrase — press Enter twice for none. It creates
`~/.ssh/kidlearn` and `~/.ssh/kidlearn.pub`. If it says the file already
exists, you made the key before: answer `n` and use the one you have.

#### Step 2 · 💻 Mac — find the instance ID

```bash
aws ec2 describe-instances --region ap-south-1 \
  --query 'Reservations[].Instances[].[InstanceId,Tags[?Key==`Name`].Value|[0],State.Name]' \
  --output table
```

Write down the `i-…` value of the `running` instance. It is the server's name
inside AWS — not its IP address, which SSH over SSM never uses.

#### Step 3 · 💻 then 🖥️ — give the server your public key

**💻 Mac** — copy the public key to the clipboard:

```bash
cat ~/.ssh/kidlearn.pub          # look at it: one line, "ssh-ed25519 AAAA… kidlearn-ec2"
pbcopy < ~/.ssh/kidlearn.pub     # now it is on the clipboard
```

**💻 Mac** — open a session on the server:

```bash
aws ssm start-session --target <instance-id> --region ap-south-1
```

**🖥️ Server** — the prompt is now `sh-5.2$`. Type `echo '`, press **Cmd-V** to
paste the key, then type the rest, so the whole line reads:

```bash
echo 'ssh-ed25519 AAAAC3Nza…your key… kidlearn-ec2' | sudo -u ec2-user tee -a /home/ec2-user/.ssh/authorized_keys
```

> ⚠️ **Paste the key itself, not a placeholder.** If what follows `echo '`
> starts with `<`, it is placeholder text from a guide, not your key — the
> server stores that text and still refuses you.

*Reading it:* `echo '…'` prints the key; `|` hands it to the next command;
`sudo -u ec2-user` runs that as the `ec2-user` account, the user you will log in
as; `tee -a` **appends** the key to `authorized_keys`, keeping any keys already
there (without `-a` it would replace the whole file).

Then tighten the permissions — SSH ignores the file if other users can write to
it — and look at the result:

```bash
sudo -u ec2-user chmod 700 /home/ec2-user/.ssh
sudo -u ec2-user chmod 600 /home/ec2-user/.ssh/authorized_keys
sudo cat /home/ec2-user/.ssh/authorized_keys
```

✅ Every line starts with `ssh-ed25519 AAAA` (or `ssh-rsa AAAA`), and none
contains `<` or `>`. Delete any bad line with
`sudo -u ec2-user nano /home/ec2-user/.ssh/authorized_keys` (Ctrl-O, Enter to
save; Ctrl-X to leave).

**🖥️ Server** — type `exit` until you are back at your Mac prompt.

#### Step 4 · 💻 Mac — add the `kidlearn` shortcut to `~/.ssh/config`

Check the prompt first — this **must not** run on the server. There the
shortcut would try to open SSM from the server to itself, and fail with an
`AccessDeniedException` naming `assumed-role/kidlearn-instance`.

Replace `i-YOUR-ID` with the ID from step 2, then paste the whole block:

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
cat >> ~/.ssh/config <<'EOF'

Host kidlearn
  HostName i-YOUR-ID
  User ec2-user
  IdentityFile ~/.ssh/kidlearn
  ProxyCommand sh -c "aws ssm start-session --target %h --document-name AWS-StartSSHSession --parameters 'portNumber=%p' --region ap-south-1"
EOF
chmod 600 ~/.ssh/config
```

*Reading it:* `cat >> file <<'EOF' … EOF` adds everything between the two `EOF`
lines to the **end** of the file — entries already in it are kept, and the file
is created if it does not exist. In the block, `HostName` is the instance ID,
and `ProxyCommand` tells `ssh` to reach it through Session Manager instead of
the internet (`ssh` fills in `%h` and `%p` with the host and port).

To use an editor instead: `nano ~/.ssh/config`, paste the five `Host kidlearn`
lines, then Ctrl-O, Enter, Ctrl-X. Do not put a `# comment` after a value on the
same line — this file only allows comments on a line of their own.

#### Step 5 · 💻 Mac — check

```bash
ssh -G kidlearn | grep -E '^(hostname|user|identityfile) '
```

It prints your `i-…` ID, `ec2-user` and `~/.ssh/kidlearn` — the shortcut is
read correctly. Then:

```bash
ssh kidlearn
```

The prompt becomes `[ec2-user@ip-172-31-… ~]$` — you are on the server over
SSH. `sudo su -` for root as usual; `exit` to come back.

Your IAM **user** needs `ssm:StartSession` on the instance and on
`arn:aws:ssm:*::document/AWS-StartSSHSession`. An account administrator already
has it; the instance role from `deployment/` Step 17 covers the server's side.

#### When it does not work

| `ssh kidlearn` says | What it means | Fix |
|---|---|---|
| `Could not resolve hostname kidlearn` | This machine has no `Host kidlearn` block — step 4 was skipped, or done on the server instead of the Mac | Step 4, on the 💻 Mac |
| `AccessDeniedException … assumed-role/kidlearn-instance/i-…` | You ran `ssh kidlearn` **on the server**. That role is the server's own, and it rightly cannot open sessions | `exit` to the Mac and run it there. On the server, remove what steps 1 and 4 created there by mistake: `/root/.ssh/config` and `/root/.ssh/kidlearn*` |
| `AccessDeniedException … user/<your name>` | Your own IAM user lacks the permission above | Ask the account administrator to grant it |
| `SessionManagerPlugin is not found` | Step 1's install has not happened on this Mac | `brew install --cask session-manager-plugin` |
| `Permission denied (publickey,…)` | SSM worked, but the server does not know this Mac's key — it is missing from `authorized_keys`, or a placeholder was pasted instead of the key | Redo step 3 and check its ✅ |

For anything else, `ssh -v kidlearn 2>&1 | grep -iE 'offering|accepted|denied'`
shows which key was tried and what the server answered.

> Rotating or revoking access is `authorized_keys` on the box plus the IAM
> permission — there is still nothing listening on port 22 to attack.

```bash
# API logs, per environment
docker compose -p kidlearn-prod logs -f api
docker compose -p kidlearn-dev  logs -f api

# Edge / TLS
docker compose -p kidlearn-edge logs -f caddy

# What is actually listening. Expect ONLY Caddy on 80 and 443.
ss -tlnp

# Memory. Expect ~700 MB available with both stacks up.
free -m
docker stats --no-stream
```

**Frontend logs are in the Vercel dashboard**, per project. Nothing about the web
tier is on the box.

---

## 3. Deploying the API

Both images are environment-agnostic — configured entirely at runtime — so one
bare `<sha>` tag serves both environments.

**Build from the branch the environment tracks.** Production runs a `main`
commit; dev runs a `dev` commit. `git switch dev && git pull` before building
for dev, `main` before building for production. Any SHA you have built and
pushed deploys to either environment, so nothing stops you deploying the wrong
one. Rollback reads its own environment's record:
`/opt/kidlearn/dev/last-good-tag` for dev, `/opt/kidlearn/prod/last-good-tag`
for production.

```bash
# On your own machine (arm64 Mac → native builds), from the repository root:
aws ecr get-login-password --region ap-south-1 \
  | docker login --username AWS --password-stdin <acct>.dkr.ecr.ap-south-1.amazonaws.com

# The tag names a commit, so build from a clean tree or it will not reproduce the
# image a rollback to that SHA expects.
[ -z "$(git status --porcelain)" ] || { echo "dirty tree — commit or stash first" >&2; exit 1; }
SHA=$(git rev-parse --short HEAD)
docker build --platform linux/arm64 -f apps/server/Dockerfile --target runner \
  -t <acct>.dkr.ecr.ap-south-1.amazonaws.com/kidlearn-api:$SHA .
docker build --platform linux/arm64 -f apps/server/Dockerfile --target migrate \
  -t <acct>.dkr.ecr.ap-south-1.amazonaws.com/kidlearn-migrate:$SHA .
docker push <acct>.dkr.ecr.ap-south-1.amazonaws.com/kidlearn-api:$SHA
docker push <acct>.dkr.ecr.ap-south-1.amazonaws.com/kidlearn-migrate:$SHA
```

Then on the box:

```bash
/opt/kidlearn/deploy/deploy.sh prod $SHA     # or: dev $SHA
```

`deploy.sh` fetches that environment's SSM parameters into
`/opt/kidlearn/<env>/app.env` (root-owned, `0600`), pulls, brings the stack up,
and polls the container healthcheck for 150 seconds, then calls `/ready` — one
database read — so a wrong `DATABASE_URL` or a paused Supabase project fails the
deploy instead of passing the DB-free `/health`. If either gate fails it leaves
the new image running and prints the rollback command with the last tag that
passed both gates — recorded in `/opt/kidlearn/<env>/last-good-tag`, written only
on success. `compose.env` cannot serve: it is written before the gate, so after a
failed deploy it names the broken image.

### Putting `deploy/` on the box

`bootstrap.sh` creates `/opt/kidlearn/deploy` and deliberately pulls nothing, so
the repository's `deploy/` tree is a copy you make — the first time, and again
whenever anything in it changes. The box has no other way to hear about it until
file 38a. If a deploy behaves like an older version of the scripts, this is why.
Pick one, as root:

```bash
# 1. Clone on the box (copies what is on main, not your working tree)
dnf install -y git
git clone https://github.com/salmanbd100/kidlearn.git /tmp/kidlearn
cp -r /tmp/kidlearn/deploy/. /opt/kidlearn/deploy/ && rm -rf /tmp/kidlearn

# 2. rsync your working tree from your Mac (needs §2a)
rsync -az --delete deploy/ kidlearn:/tmp/deploy/
ssh kidlearn 'sudo cp -r /tmp/deploy/. /opt/kidlearn/deploy/ && rm -rf /tmp/deploy'

# 3. No SSH set up: stream a tarball through Session Manager, from the repository root
tar cz deploy | aws ssm start-session --target <instance-id> \
  --document-name AWS-StartInteractiveCommand \
  --parameters 'command=["sudo tar xz -C /opt/kidlearn --strip-components=1"]'
```

Then `chmod +x /opt/kidlearn/deploy/*.sh`. Expect `app  backup.sh  bootstrap.sh
deploy.sh  edge  weekly-reports.sh` in `ls /opt/kidlearn/deploy`, with
`app/compose.yml` and `app/compose.dev.yml` under `app/`.

### Migrations are a separate step, deliberately

A schema change must be a decision, not a side effect of restarting a container,
so it takes an explicit flag on the deploy that ships it:

```bash
/opt/kidlearn/deploy/deploy.sh prod <new-sha> --migrate     # or: dev <new-sha> --migrate
```

`deploy.sh` writes `compose.env` with the new tag, pulls `kidlearn-migrate:<new-sha>`,
runs it, and only restarts the API if it succeeds. **Do not run the migrate service
by hand before a deploy**: the migrations are baked into the image, and until
`deploy.sh` rewrites `compose.env` its `IMAGE_TAG` names the release already
serving — so the hand-run command applies *that* release's migrations, prints
`No pending migrations to apply`, and the new API then boots on the old schema.

The hand-run form is only for re-running the deployed release's migrations:

```bash
cd /opt/kidlearn/deploy/app
docker compose --env-file /opt/kidlearn/prod/compose.env \
  -p kidlearn-prod -f compose.yml --profile migrate run --rm migrate
# dev also passes: --env-file /opt/kidlearn/dev/compose.env  and  -f compose.dev.yml
```

**The `--env-file` is not optional.** `compose.yml` interpolates `ENV_NAME`,
`ECR_REGISTRY` and `IMAGE_TAG`; nothing sets them in your shell. Without the flag
Compose substitutes blanks and stops on `env file /opt/kidlearn//app.env not
found` — which reads like a missing file and is a missing variable.
`compose.env` is written by `deploy.sh`, so run a deploy before the first
migration.

**Migrations are forward-only.** A bad migration is fixed by a new forward
migration, never by editing an applied one. Never run `prisma migrate dev`
against a deployed database.

**A migration must be safe for the previous release.** The migrate step runs
before the new image is up, so for the length of a deploy the *old* API runs
against the *new* schema, and the rollback command below puts the old image back
against it permanently. Prisma selects every column of a model by default, so a
`DROP COLUMN` makes every read of that table fail until the new image is serving
(this is what `20260909000000_remove_parent_pin` would have done on a deploy with
a slow health check). So split a destructive change across two releases:

1. **Expand** — add the new column or table, with a default or nullable. Ship it.
2. **Contract** — once no running release references the old column, drop it in
   a later migration.

Adding a `NOT NULL` column needs a default for the same reason. A migration that
cannot be written this way needs a maintenance window, and says so in its header.

### Rollback — two independent halves

Both, because under load nobody derives the second one.

```bash
# 1. API
/opt/kidlearn/deploy/deploy.sh prod <previous-sha>
```

```
# 2. Frontend
Vercel dashboard → the project → Deployments → the last known-good one
  → "Instant Rollback" (or "Promote to Production").
```

The weekly image prune that `bootstrap.sh` installs
(`/etc/cron.weekly/kidlearn-docker-prune`) keeps the **4 newest images of each
repository**, by creation time, and `docker rmi`s the rest — it does not stop at
dangling layers. So the previous release is on the box for a rollback only while
it is among the 4 newest builds; anything older is pulled from ECR again, which
`deploy.sh` does anyway. `docker rmi` refuses an image a running container uses,
so the live release is never removed.

---

## 4. Where every value lives

`apps/server/src/config/env.ts` is the enforcement — the API refuses to boot on a
missing or malformed variable, naming the field. This table is the inventory.

**Secrets: SSM Parameter Store, every one a `SecureString`**, under
`/kidlearn/prod/` and `/kidlearn/dev/`. Standard tier, free to 10,000 parameters;
this uses about 30.

| Var | Where | Production | Development |
|---|---|---|---|
| `NODE_ENV` | compose | `production` | `production` — both, see file 38 requirement 7 |
| `PORT` | compose | `4000` | `4000` |
| `DATABASE_URL` | SSM | Supabase pooled `:6543`, `?pgbouncer=true&connection_limit=5` | `postgresql://kidlearn:<pw>@dev-postgres:5432/kidlearn` — **neither flag** |
| `DIRECT_URL` | SSM | Supabase **session pooler** `:5432` — not the IPv6-only direct connection | identical to the dev `DATABASE_URL` |
| `WEB_ORIGIN` | SSM | `https://kidlearn.net` | `https://dev.kidlearn.net` |
| `BETTER_AUTH_URL` | SSM | `https://api.kidlearn.net` | `https://api.dev.kidlearn.net` |
| `BETTER_AUTH_SECRET` | SSM | fresh `openssl rand -base64 32` | **a different** fresh value |
| `GOOGLE_CLIENT_ID` / `_SECRET` | SSM | production OAuth client | dev OAuth client |
| `LOG_LEVEL` | compose | `info` | `debug` |
| `ENABLE_API_DOCS` | compose | `false` | `true` |
| `PARENT_POST_LOGIN_PATH` | compose | `/parent` | `/parent` |
| `APP_TIMEZONE` | compose | `Asia/Dhaka` | `Asia/Dhaka` |
| `CRON_SECRET` | SSM | `openssl rand -base64 32` | a different value; dev runs no cron |
| `CLOUDINARY_*` | SSM | production cloud | **a separate free cloud** |
| `GEMINI_API_KEY` | SSM, **optional** (file 41) | production AI Studio key — omit it and the CMS falls back to admins' own assistants | **a separate free key** |
| `GEMINI_TEXT_MODEL` / `_IMAGE_MODEL` | compose | `gemini-3.6-flash` / `gemini-2.5-flash-image` | same |
| `GOOGLE_TTS_API_KEY` | SSM | Cloud TTS key, restricted to that API | **same key, shared** |
| `GOOGLE_TTS_VOICE_EN` / `_BN` | compose | `en-US-Standard-C` / `bn-IN-Standard-A` | same |
| `AI_TEXT_JOBS_PER_DAY` / `_AUDIO_` / `_IMAGE_` | compose | 8 / 100 / 15 | 4 / 20 / 5 |
| `MCP_ENABLED` | SSM, optional | unset (= `false`) until turned on — mounts `/mcp` and the token endpoints | `true` to try it first |
| `MCP_RESOURCE_URL` | unset | defaults to `${BETTER_AUTH_URL}/mcp`; must be `https` | same |
| `MCP_DRAFTS_PER_DAY` / `MCP_RATE_LIMIT_PER_MINUTE` | SSM, optional | unset = 30 per admin per day / 60 per admin per minute | same |
| `POSTGRES_PASSWORD` | SSM (dev only) | — | `openssl rand -base64 24` |
| `BACKUP_S3_BUCKET` | SSM (prod only) | the backup bucket name, no `s3://` | — ; dev is never backed up |
| `BACKUP_HEARTBEAT_URL` | SSM (prod only, optional) | a healthchecks.io-style check URL — see §8 | — |
| `WEEKLY_REPORTS_HEARTBEAT_URL` | SSM (prod only, optional) | a second check URL — see §9 | — |
| `NEXT_PUBLIC_API_URL` | **Vercel**, build-time | `https://api.kidlearn.net` | `https://api.dev.kidlearn.net` |
| `NEXT_PUBLIC_SITE_URL` | **Vercel**, build-time | `https://kidlearn.net` | `https://dev.kidlearn.net` |
| `MEDIA_ASSET_HOSTS` | **Vercel**, build-time | `https://res.cloudinary.com` | `https://res.cloudinary.com` |
| `SITE_NOINDEX` | **Vercel**, build-time | **unset** | `true` |
| `DEV_SITE_BASIC_AUTH` | **Vercel**, runtime | **unset** | **unset** — optional `dev:<password>` turns on a password prompt; **not** `NEXT_PUBLIC_` |

`ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` are in neither deployment. They
are read only by `seed:admin` and passed inline — a deployment must not need an
admin password present just to start.

**Three generated files per environment; the first two are not interchangeable.**
`deploy.sh` writes both, root-owned `0600`:

| File | Job |
|---|---|
| `/opt/kidlearn/<env>/app.env` | handed to the container as Compose's `env_file:` — the secrets above |
| `/opt/kidlearn/<env>/compose.env` | the `${...}` substitutions the Compose files themselves contain: `ENV_NAME`, `ECR_REGISTRY`, `IMAGE_TAG`, the compose-sourced rows above, and (dev) `POSTGRES_PASSWORD`. Passed with `--env-file` |
| `/opt/kidlearn/<env>/last-good-tag` | the image tag of the last deploy that passed `/health` and `/ready` — the rollback target `deploy.sh` prints on failure. Written only on success |

**Every `$` in both files is doubled.** Compose interpolates `env_file` *and*
`--env-file`, so a raw `s3cr$tastic` reaches the process as `s3cr` — and since
`/health` is DB-free, a truncated database password deploys "successfully" and
fails on the first query. `$$` round-trips to a literal `$`. The consequence for
you: **do not read a value out of `app.env` and paste it somewhere else** —
`psql`, a `DATABASE_URL` you are debugging with, anything. Read it from SSM
instead, which is what `backup.sh` does.

### Two things in that table that will cost you an afternoon

**The dev `DATABASE_URL` carries neither `pgbouncer=true` nor
`connection_limit`.** `pgbouncer=true` exists for Supabase's PgBouncer; against a
plain Postgres it needlessly disables prepared statements. `connection_limit=5`
is what Prisma picks on the box's two CPUs anyway — production states it only so
nobody "fixes" it to the `=1` that serverless guides recommend. That value is for
functions where every instance opens its own pool; this API is one long-running
process, so with one connection every request queues behind every other, a
transaction that cannot get it within two seconds fails, and account deletion
holds it for up to two minutes. Five is well inside the pooler's limit. Copying
production's URL shape into dev is the obvious mistake. The two production URLs
differ in job: the app uses the pooled one (many short connections), while
migrations and `pg_dump` use the session-pooler one (one long connection, which the
transaction pooler would kill).

**Four Vercel variables are build-time, and one of them does not look it.**
`NEXT_PUBLIC_*` are inlined into the client bundle — everyone expects that. So is
`MEDIA_ASSET_HOSTS`, and so is **`SITE_NOINDEX`**: Next serialises `headers()`
into `.next/routes-manifest.json` during `next build`, so setting it on a running
server does nothing. Editing any of the four in the dashboard has no effect until
you **redeploy**. `DEV_SITE_BASIC_AUTH` is the one that genuinely is runtime.

> Because they are build-time, all four are declared under `web#build` → `env` in
> `turbo.json`. **Turbo runs in strict env mode**, which means a variable not
> declared there is stripped from `next build` and vanishes silently. `NEXT_PUBLIC_*`
> survive by framework inference; `MEDIA_ASSET_HOSTS` and `SITE_NOINDEX` did not,
> and that is why the `noindex` header did not appear the first time it was tried.
> **Adding a new build-time variable means adding it to `turbo.json` in the same
> change.**

The failure mode this guards against is `dev.kidlearn.net` quietly calling
`api.kidlearn.net`. It looks like a CORS bug, is not one, and would have a dev
build writing to the production database. **Check the deployed bundle, not the
dashboard.** If the first command matches, the dev project was built with
production's `NEXT_PUBLIC_API_URL`: fix the variable and **redeploy**.

```bash
curl -s https://dev.kidlearn.net | grep -o 'api\.kidlearn\.net'      # NOTHING
curl -s https://dev.kidlearn.net | grep -o 'api\.dev\.kidlearn\.net' # matches
```

---

## 5. DNS — Cloudflare, free tier ⬜ not yet done

Registrar nameservers point at Cloudflare. Five records:

| Name | Type | Target |
|---|---|---|
| `kidlearn.net` | CNAME (flattened by Cloudflare), or A on older projects | the apex target Vercel shows for the production project |
| `www` | CNAME | the `*.vercel-dns.com` target Vercel shows for the production project |
| `dev` | CNAME | the same, for the dev project |
| `api` | A | the Elastic IP |
| `api.dev` | A | the Elastic IP |

**Take the two Vercel targets from the project's Domains tab on the day you add
them**, not from any value written down here — Vercel has changed its published
apex address before.

**Proxy off (grey cloud) on all five.** On the Vercel names, orange-cloud
proxying puts a second TLS terminator in front of Vercel's own and interferes
with its certificate issuance; on the API names it does the same to Caddy's ACME
challenge, for no benefit at this traffic.

`api.dev.kidlearn.net` is an ordinary four-label name — Let's Encrypt issues for
it with no wildcard and no DNS challenge.

**Wait for both Caddy certificates and all three Vercel domains before touching
anything else.** A half-provisioned domain is indistinguishable from a CORS bug.

- Registrar: `<registrar>`
- Cloudflare account: `<account>`
- Elastic IP: `<a.b.c.d>`
- Instance ID: `<i-…>`

---

## 6. TLS — Caddy, and the one way to lock yourself out

Caddy obtains and renews both API certificates itself. Vercel handles the three
web hostnames.

**`deploy/edge/Caddyfile` defaults to the ACME *staging* endpoint.** That
is deliberate: Caddy begins requesting certificates the instant it starts, there
is no dry run, and Let's Encrypt's production endpoint allows 5 duplicate
certificates per week and rate-limits failed validations. A wrong A record burns
them without asking.

**The endpoint and email are set on the box, not in the Caddyfile.** The
Caddyfile reads `{$ACME_CA}` and `{$ACME_EMAIL}`, and `deploy/edge/compose.yml`
loads them from `/opt/kidlearn/edge/caddy.env` (root, 0600, outside `deploy/`):

```bash
ACME_EMAIL=you@example.com
ACME_CA=https://acme-v02.api.letsencrypt.org/directory   # omit for staging
```

Never edit the Caddyfile on the box to change endpoint — every refresh of
`deploy/` (§3) overwrites it, and a box on production would silently drop back to
staging certificates. The first-run sequence is `deployment/` Step 21. Changing endpoint
later is editing `caddy.env` and
`docker compose -p kidlearn-edge -f compose.yml up -d --force-recreate` from
`/opt/kidlearn/deploy/edge`. A missing `caddy.env` is not an error: Caddy starts
on staging.

- Endpoint the box is currently on: `<staging | production>`

**The `caddy_data` volume is load-bearing.** It holds the ACME account key and
both certificates. Losing it on every deploy re-requests them until the rate
limit locks you out — a week with no TLS, not an inconvenience. It is a named
volume, never a bind mount into a directory a deploy script might clean. Do not
run `docker volume prune` on this box without checking what it would take.

---

## 7. The dev database

Disposable and never backed up (file 38 requirement 2).

```bash
# THE WIPE-AND-RESEED ONE-LINER. Destroys the dev database completely.
cd /opt/kidlearn/deploy/app
dc() { docker compose --env-file /opt/kidlearn/dev/compose.env \
         -p kidlearn-dev -f compose.yml -f compose.dev.yml "$@"; }
dc down -v && dc up -d && dc --profile migrate run --rm migrate
```

Then reseed — either the repository seed, or (better, and it rehearses the
restore) the latest production `pg_dump`, per §8.

---

## 8. Backups — production only ⬜ not yet done

Supabase's free tier has **no point-in-time recovery**, so this is yours to own.

`deploy/backup.sh` runs `pg_dump --schema=public` against production's `DIRECT_URL`, gzips it,
and streams it to the backup bucket (settings: `deployment/` Step 12). It reads both `DIRECT_URL` and
`BACKUP_S3_BUCKET` from SSM, dumps through the `postgres:<major>-alpine` image
matching the server's major version — asked of the server on every run, because
`pg_dump` refuses a server newer than itself and Supabase upgrades projects in
place (so the box needs no postgres-client package) — pipes straight to S3
rather than staging on the 20 GB volume, and fails if the uploaded object is
under 1 KB — a gzip of nothing uploads perfectly happily.

**Only the `public` schema is dumped.** It holds every application table and
Prisma's `_prisma_migrations`, and no migration creates an extension. Supabase's
own schemas (`auth`, `storage`, `realtime`, `vault`, `graphql` and their
extensions) exist only on Supabase; a whole-database dump of them cannot be
loaded into plain Postgres at all.

**Restoring into an older Postgres.** The dev stack runs `postgres:16-alpine`. A
plain dump made by a newer `pg_dump` can carry settings 16 does not know (17's
emits `SET transaction_timeout = 0;`). The restore below strips that one line; if
it stops on another, delete that line too — or bump the dev image to the server's
major.

**The dump lands under `prod/.partial/` and is moved to `prod/<timestamp>.sql.gz`
only after the whole pipeline succeeds.** A `pg_dump` that dies midway ends its
output like a clean EOF, so the upload completes with whatever bytes arrived;
writing straight to the final key would leave a truncated file as the newest
backup. On failure the script deletes the partial object. Anything left in
`.partial/` (the instance was killed mid-run) is never a restore candidate:
list `s3://<bucket>/prod/` — a non-recursive listing shows `.partial/` only as a
prefix — and take the newest `.sql.gz` object.

**A failed run alerts.** Cron on this box has no mail agent, so the script pings a
dead-man's-switch instead. Create a free check at healthchecks.io (period 1 day,
grace 2 hours, notify your email), store its ping URL as
`/kidlearn/prod/BACKUP_HEARTBEAT_URL`, and the script pings it on success and at
`<url>/fail` on failure. The monitor also alerts when no ping arrives at all,
which is the only way to learn that cron itself never fired. Without the
parameter the script still backs up, and prints a warning on every run.

`sudo crontab -e`:

```cron
CRON_TZ=Asia/Dhaka
# Nightly production database dump → S3
30 1 * * *  /opt/kidlearn/deploy/backup.sh >>/var/log/kidlearn-backup.log 2>&1
```

**Both cron entries need a cron daemon, and AL2023 ships none** — `bootstrap.sh`
installs `cronie` and enables `crond` for exactly this. If the box was built
before that was added, `dnf install -y cronie && systemctl enable --now crond`
first, or nothing in this section or §9 has ever run.

**Restore it once into the dev Postgres container** (file 38 requirement 16).

**The restore goes into an EMPTY database — never a migrated one.** The dump
carries the whole schema *and* `_prisma_migrations`, so a database that has been
migrated first stops at the first `CREATE TYPE … already exists`. And the dump
starts with `CREATE SCHEMA public`, so even a brand-new database needs its
default `public` schema dropped first. This replaces the dev database wholesale:

```bash
cd /opt/kidlearn/deploy/app
dc() { docker compose --env-file /opt/kidlearn/dev/compose.env \
         -p kidlearn-dev -f compose.yml -f compose.dev.yml "$@"; }
dc stop api

docker exec dev-postgres psql -U kidlearn -d postgres -v ON_ERROR_STOP=1 \
  -c 'DROP DATABASE IF EXISTS kidlearn WITH (FORCE)' \
  -c 'CREATE DATABASE kidlearn'
docker exec dev-postgres psql -U kidlearn -d kidlearn -v ON_ERROR_STOP=1 \
  -c 'DROP SCHEMA public'

aws s3 cp s3://<backup-bucket>/<object> - | gunzip \
  | sed '/^SET transaction_timeout = 0;$/d' \
  | docker exec -i dev-postgres psql -U kidlearn -d kidlearn \
      -v ON_ERROR_STOP=1 --single-transaction

dc start api
```

`ON_ERROR_STOP` and `--single-transaction` are what make this a rehearsal: plain
`psql` keeps going after an error and still exits `0`, so a dump that half-loads
would be recorded as a pass. Strict, it stops at the first error and loads
nothing. After it succeeds, compare row counts with production
(`SELECT count(*) FROM "ChildProfile"`, `"LessonProgress"`, and
`_prisma_migrations` against the number of migration directories) before writing
a date on the rehearsal line. The dump brings the schema at production's
migration; if dev runs a newer release than production, apply its migrations
afterwards with the migrate command from §3.

> **This copies real children's data into dev**, which runs `LOG_LEVEL=debug` on a
> shared disk. If that is not acceptable for the stage you are at, reseed from the
> repository seed instead and rehearse the restore against a scratch container you
> delete afterwards.

- Bucket: `<bucket>`
- Last restore rehearsal: `<date>` — **⬜ never**

---

## 9. Scheduled jobs — production only ⬜ not yet done

The weekly parent-report job (`POST /api/admin/jobs/weekly-reports`, bearer
`CRON_SECRET`) is triggered from the box (file 38 requirement 17).

`sudo crontab -e`:

```cron
CRON_TZ=Asia/Dhaka
# Weekly parent reports, Mondays 02:00 Asia/Dhaka
0 2 * * 1  /opt/kidlearn/deploy/weekly-reports.sh >>/var/log/kidlearn-weekly-reports.log 2>&1
```

The `curl` lives in `deploy/weekly-reports.sh`, not inline, because **cron has no
line continuation** — a crontab command is one line, to the newline, and a
backslash-wrapped `curl` is handed to `/bin/sh` a fragment at a time. Same reason
`backup.sh` is a script in §8.

Like `backup.sh`, it pings a dead-man's-switch URL on success and at `<url>/fail` on
failure, because this box has no mail agent and a bare non-zero exit would reach
nobody. Set `/kidlearn/prod/WEEKLY_REPORTS_HEARTBEAT_URL` in SSM; unset, the script
says so on every run. The job is idempotent (an upsert per child per week), which is
why the script retries on a failed request.

**The endpoint answers `202 Accepted` and runs the job in the background**, so the
script's success — and the heartbeat — means the run *started*, not that every
report was written. A run where children fail is logged by the API at `error`
level (`Weekly reports failed for N of M children`); check
`docker logs prod-api --since 3h | grep -i "weekly report"` on Monday morning, or
alert on it from the logs, because nothing else reports it.

The same run then **deletes `SessionEvent` rows older than 90 days**, in batches of
5,000, and reports the count as `sessionEventsPruned`. Each week's aggregate is kept
in its `WeeklyReport`; the backfill never writes a week older than the retention
window, because its minutes would read as zero. A failed prune fails the run like a
failed report does. The first run against a long-lived database deletes the whole
backlog — expect it to take longer than later runs.

**Dev runs no scheduled jobs.** Trigger it by hand there when testing.

---

## 10. Vercel — two Hobby projects ⬜ not yet done

Each project sets its own production branch (the §1 table) so neither builds the
other's commits.

**Settings, both projects:**

| Setting | Value |
|---|---|
| Root Directory | `apps/web`, with *Include source files outside of the Root Directory* **enabled** |
| Build Command | `cd ../.. && pnpm turbo run build --filter=web` |
| Install Command | `pnpm install --frozen-lockfile`, at the repository root |
| Function region | `bom1` (Mumbai) — Hobby allows one; the default is `iad1` |

**The build command must go through Turbo, not `next build`.** `apps/web`
depends on `@kidlearn/types`, which compiles to `dist/` and is resolved through
its `exports` map; a bare `next build` rooted at `apps/web` fails on the missing
`dist`. If you accept Vercel's Turborepo detection instead, **read the first
build log and confirm `@kidlearn/types` built first.** This is the single most
likely thing to fail on the first deploy.

`@kidlearn/ui` needs nothing — it ships raw TypeScript and `next.config.ts`
already lists it in `transpilePackages`. `packages/db` is not a dependency of
`apps/web`, so no `prisma generate` runs on Vercel.

### Two Hobby facts that are operational, not footnotes

- **Hobby is licensed for non-commercial personal projects.** The first paid
  feature, advert or business use puts this in breach and requires Pro at
  $20/month — more than the $8.17 the move saved. **That is a trigger for the
  escape hatch in §11.**
- **Hobby has no overage billing.** Exceeding the transfer or edge-request
  ceiling **pauses the project** rather than charging for the excess, so
  production availability depends on a free tier with a hard stop. Media being on
  Cloudinary keeps the bulk of the bytes off Vercel. **Turn on Vercel's usage
  notifications**, and record the ceilings here on the day you provision — they
  move.
  - Ceilings as at `<date>`: `<transfer>`, `<edge requests>`

---

## 11. Escape hatch — moving the frontend back onto the box

**Trigger:** either Hobby condition in §10 — a commercial trigger, or a paused
project on a ceiling. Running this is a response to a trigger, not routine work.

Expect about thirty minutes (file 38 requirement 5 explains why the image is kept
buildable).

1. **Resize the box to `t4g.medium` first.** Two Next.js servers do not fit in
   2 GiB. This is a stop, change instance type, start — the Elastic IP survives it.
2. Build and push, one image per environment because `NEXT_PUBLIC_*` are baked in:
   ```bash
   docker build --platform linux/arm64 -f apps/web/Dockerfile \
     --build-arg NEXT_PUBLIC_API_URL=https://api.kidlearn.net \
     --build-arg NEXT_PUBLIC_SITE_URL=https://kidlearn.net \
     --build-arg MEDIA_ASSET_HOSTS=https://res.cloudinary.com \
     -t <acct>.dkr.ecr.ap-south-1.amazonaws.com/kidlearn-web:prod-$SHA .
   # the dev image adds --build-arg SITE_NOINDEX=true
   ```
   You will need to create the `kidlearn-web` ECR repository — it does not exist.
3. Add a `web` service to `deploy/app/compose.yml` with a `${ENV_NAME}-web`
   network alias, taking `DEV_SITE_BASIC_AUTH` as a runtime variable on the dev
   stack if the optional dev password is on.
4. Add the web hostnames to `deploy/edge/Caddyfile`, reverse-proxying to those
   aliases on port 4000.
5. Repoint the `kidlearn.net`, `www` and `dev` Cloudflare records at the Elastic
   IP. Caddy will obtain three more certificates — go through the staging
   endpoint again (§6).

---

## 12. Ceilings and limits worth knowing before they bite

| Thing | Limit | Checked |
|---|---|---|
| Supabase free: database | 500 MB | 2026-09-06 |
| Supabase free: egress | 5 GB/month | 2026-09-06 |
| Supabase free: active projects | 2 per organisation — this design uses **one** | 2026-09-06 |
| Supabase free: inactivity pause | **7 days** — matters between provisioning and launch | 2026-09-06 |
| Supabase free: PITR | **none** — see §8 | 2026-09-06 |
| Let's Encrypt | 5 duplicate certificates per week | — |
| SSM Parameter Store Standard | 10,000 parameters, free — this uses ~35 | — |
| AWS Budgets alarm | **$20/month** — thresholds in `deployment/` Step 4 | ⬜ not yet created |
| API flood guard | **300 requests/min per client IP** on `/api/*` — a `429 RATE_LIMITED`. Raise `API_RATE_LIMIT_PER_MINUTE` if a school or shared network trips it | 2026-10-05 |
| API JSON body | **100 KB** — a `413`. An editor sends one activity or question at a time; an MCP submission is one lesson, story or quiz, a few KB | 2026-10-05 |
| MCP drafts | **30 per admin per day** (`MCP_DRAFTS_PER_DAY`), separate from the Gemini caps — the tool answers with an error, the assistant tells the admin | 2026-10-22 |

### AI assistants over MCP (file 41)

`POST /mcp` lets an admin's own assistant (Claude, Cursor, VS Code…) write drafts.
Caddy already proxies the whole API host, so nothing at the edge changes.

- **Turn it on:** create the SSM parameter `/kidlearn/<env>/MCP_ENABLED` = `true`
  and redeploy. Not in `compose.yml` on purpose: Compose's `environment:` beats
  the SSM-written `app.env`, and `deploy.sh` rewrites `compose.env` on every
  deploy, so neither could carry it. The CMS
  shows **AI assistants** working once `GET /api/admin/ai/capabilities` reports it.
- **A token has leaked — stop it first:** revoking takes effect on the next call,
  with no deploy. Everything: `update "AdminAccessToken" set "revokedAt" = now() where "revokedAt" is null;`.
  One admin's: rotate their password with `seed:admin`, which revokes their tokens
  and sessions together (`admin-account-guide.md`). One token:
  `update "AdminAccessToken" set "revokedAt" = now() where prefix = 'klat_…';` — the
  prefix is in the CMS list and in any screenshot of it. An admin revokes their own
  on the AI assistants page.
- **Then turn MCP off, if it should stay off:** set the parameter to `false` (or
  delete it) and redeploy the running image, so nothing else changes:
  `sudo /opt/kidlearn/deploy/deploy.sh <env> "$(cat /opt/kidlearn/<env>/last-good-tag)"`.
  `/mcp` and the token endpoints stop existing; tokens stay in the table and work
  again if it is turned back on, which is why revoking comes first.
- **Who wrote a draft:** `AIGenerationJob.source = 'mcp'`, `requestedById` and the
  self-reported `client`; the AI Queue shows the same line.
- **Gemini off:** omit `GEMINI_API_KEY`. The Gemini generate routes answer `503
  AI_PROVIDER_NOT_CONFIGURED` and the CMS hides them; narration still works.

Cost and sizing are file 38's "Costs, at steady state".

---

## 13. Google OAuth — the two clients

| Client | Authorized JavaScript origins | Authorized redirect URIs |
|---|---|---|
| existing (local + dev) | `http://localhost:3000`, `https://dev.kidlearn.net` | `http://localhost:4000/api/auth/callback/google`, `https://api.dev.kidlearn.net/api/auth/callback/google` |
| new (production) | `https://kidlearn.net` | `https://api.kidlearn.net/api/auth/callback/google` |

Why two clients, why the cookie stays `SameSite=Lax`, and why there is no basic auth
on `api.dev.kidlearn.net`: file 38 requirements 14, 4 and the Goal.

**Dev site password: off.** `dev.kidlearn.net` is open to anyone with the
address; `SITE_NOINDEX` keeps it out of search results. To turn the optional
prompt in `apps/web/proxy.ts` on, set `DEV_SITE_BASIC_AUTH` to `dev:<password>`
in the dev Vercel project's settings and redeploy. That is the credential's
only home — it is deliberately not duplicated into SSM, which would give two
places to forget to rotate.

---

## 14. Smoke test

Run on a real phone, against production, after any deploy you are unsure about.

1. Parent signs in with Google on `https://kidlearn.net`.
2. The parent area opens on consent alone — **there is no PIN step.** A deployed
   build that asks for a PIN is running an image older than 2026-09-09, which
   makes this a useful check on *which* build you actually deployed.
3. Create a child profile.
4. A seeded lesson plays through all five steps, with audio.
5. The parent dashboard shows the learning time just spent.
6. `/admin/ai-queue` loads for the admin user and lists and filters jobs.
7. **Reload the page — you are still signed in.** This is the step that proves
   the proxy and cookie settings are right; if you are logged out on reload,
   investigate that first.

Plus, from anywhere:

```bash
curl -s https://api.kidlearn.net/health          # {"data":{"status":"ok",…}}
curl -si https://api.kidlearn.net/docs | head -1 # 404 — docs are off in production
curl -si https://kidlearn.net | grep -i x-robots # nothing — noindex is dev-only
curl -si https://dev.kidlearn.net | head -1      # 200 — no password on dev
curl -si https://api.dev.kidlearn.net/health     # 200, X-Robots-Tag: noindex
nmap <elastic-ip>                                # only 80 and 443 open
```
