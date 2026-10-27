# KidLearn — Operations Runbook

> **What this is for:** the thing you open when production is down, when a deploy
> has to be rolled back, or when you have forgotten where a value lives. It is
> written to be read in a hurry. Design rationale lives in
> [file 38](implementation/38-deployment-aws-docker.md); this file is procedure
> and reference.
>
> **Bringing this into existence for the first time?** You want
> [`document/deployment/`](deployment/README.md), not this file — the one-time,
> step-by-step provisioning, with the AWS vocabulary explained. Come back here
> once production is up.
>
> **Status:** how far provisioning has got is the **38 · provisioning** row of
> [`00-progress-tracker.md`](implementation/00-progress-tracker.md). A section
> marked **⬜ not yet done** has been written but never executed — treat it as a
> plan, not a record. Values written `<like-this>` in the record lines are filled
> in on the day ([`deployment/09-paperwork.md`](deployment/09-paperwork.md)).

---

## 0. Before you type anything

### Which machine am I on?

Every command is marked with **where you type it**. Running one in the wrong
place is the most common mistake, and the error it gives never says "wrong
machine".

| Mark | Where | How you know you are there |
|---|---|---|
| 💻 **Mac** | A normal Terminal window on your own computer | Your usual prompt, e.g. `❯` or `salman@MacBook kidlearn %` |
| 🖥️ **Server** | Inside a session on the EC2 box | `sh-5.2$` (Session Manager), `[ec2-user@ip-172-31-…]$` (SSH), or `[root@ip-172-31-… ~]#` after `sudo su -` |
| 🌐 **Browser** | A web console — AWS, Vercel, Cloudflare | — |

- **Mac → server:** `aws ssm start-session --target i-0a1b2c3d4e5f67890 --region ap-south-1`
  (your instance ID — [§2](#2-getting-a-shell--and-the-logs) shows how to find it), or `ssh kidlearn` once [§2a](#2a-one-time-setup-for-ssh-over-session-manager) is done.
- **On the server, become root first.** Every 🖥️ command below assumes you ran
  `sudo su -` and the prompt ends in `#`. Without it, `docker` answers
  `permission denied … docker.sock`.
- **Server → Mac:** type `exit` (twice if you ran `sudo su -`) until you see
  your Mac prompt again.

### Placeholders

`<previous-sha>`, `<instance-id>` and friends are **not** to be typed as-is.
Replace the whole thing, angle brackets included. Every placeholder below has a
real-looking example beside it. If a command you are about to press Enter on
still contains `<` or `>`, stop.

### Incident index — symptom → section

| Symptom | Go to |
|---|---|
| Site or API down, `502` from `api.kidlearn.net` | [§2b](#2b-logs-and-health-at-a-glance) logs → [§3 Rollback](#rollback--two-independent-halves) |
| A deploy printed `did not become healthy` / `ROLL BACK WITH:` | [§3 Rollback](#rollback--two-independent-halves) |
| A deploy printed `/ready failed` | [§3 When `deploy.sh` fails](#when-deploysh-fails) |
| Certificate error on `api.*` | [§6](#6-tls--caddy-and-the-one-way-to-lock-yourself-out) |
| "CORS error" in the browser on dev | [§4](#4-where-every-value-lives) — the bundle check |
| Signed out on every reload | [§14](#14-smoke-test) step 7, then [§4](#4-where-every-value-lives) `WEB_ORIGIN` / `BETTER_AUTH_URL` |
| healthchecks.io email: backup or weekly reports failed | §8 / §9 |
| Disk full / `no space left on device` | [§2b](#2b-logs-and-health-at-a-glance) disk check, then [§3](#rollback--two-independent-halves) image prune note |
| An admin AI-assistant token has leaked | [§12 AI assistants](#ai-assistants-over-mcp-file-41) |
| Admin cannot sign in | [`admin-account-guide.md` §5](admin-account-guide.md#5-troubleshooting) |
| Anything else | [`deployment/troubleshooting.md`](deployment/troubleshooting.md) |

---

## 1. Topology

| Environment | Branch | Web (Vercel) | API (EC2) | Database |
|---|---|---|---|---|
| **Production** | `main` | `kidlearn.net`, `www.kidlearn.net` | `api.kidlearn.net` | Supabase free project, `ap-south-1` |
| **Development** | `dev` | `dev.kidlearn.net` | `api.dev.kidlearn.net` | `dev-postgres` container on the box |

One `t4g.small` in `ap-south-1` runs both API stacks behind Caddy. Vercel serves
the three web hostnames and terminates their TLS itself. Media is on Cloudinary.

Three Compose projects on one box, separate so that deploying one cannot restart
another:

| Project | Files | Containers |
|---|---|---|
| `kidlearn-edge` | `deploy/edge/compose.yml` | `kidlearn-caddy`, and the `kidlearn-edge` network. **Bring up first** — the other two join that network as `external`. |
| `kidlearn-prod` | `deploy/app/compose.yml` | `prod-api`, and the `prod-migrate` job under a profile |
| `kidlearn-dev` | `deploy/app/compose.yml` + `compose.dev.yml` | `dev-api`, `dev-postgres`, `dev-migrate` |

**`prod-api` and `dev-api` are network aliases, not service names.** Both stacks
call the service `api`, and on a shared network Compose registers the service
name as an alias too — so `reverse_proxy api:4000` would resolve to whichever
stack answered DNS first. The Caddyfile must always name the prefixed alias.

**Isolation:** data and frontends are isolated; the API runtime is only
soft-isolated. **A dev container that fills the EBS volume takes the production
API down with it.** Full statement: file 38, "The isolation this design does and
does not give you".

---

## 2. Getting a shell — and the logs

**The security group has no port 22 rule, and does not need one.** All three
ways in go through Session Manager, which needs no inbound rule and leaves an
audit trail. If none works, the instance role has lost
`AmazonSSMManagedInstanceCore` or the agent is down — fix that, never open
port 22.

**Your instance ID** (looks like `i-0a1b2c3d4e5f67890`) — 💻 Mac:

```bash
aws ec2 describe-instances --region ap-south-1 \
  --filters Name=instance-state-name,Values=running \
  --query 'Reservations[].Instances[].[InstanceId,Tags[?Key==`Name`].Value|[0]]' \
  --output table
```

✅ One row: the `i-…` ID and the name `kidlearn`. Record it at the bottom of
§5 so you never need this again.

| Way in | How | Good for |
|---|---|---|
| **1. Browser** | 🌐 EC2 console → tick `kidlearn` → **Connect** → **Session Manager** → **Connect** | Nothing to install; any machine |
| **2. Terminal** | 💻 `aws ssm start-session --target i-0a1b2c3d4e5f67890 --region ap-south-1`, then 🖥️ `sudo su -` | Quickest from your Mac |
| **3. Real SSH** | 💻 `ssh kidlearn`, then 🖥️ `sudo su -` — needs the one-time [§2a](#2a-one-time-setup-for-ssh-over-session-manager) | `scp`, `rsync`, tunnels, VS Code Remote |

With §2a done, these also work from 💻 the Mac:

```bash
ssh kidlearn                                           # a shell
rsync -az --delete deploy/ kidlearn:/tmp/deploy/       # copy files up (from the repo root)
ssh -N -L 15432:172.18.0.3:5432 kidlearn               # tunnel dev-postgres to localhost:15432
```

**The tunnel needs `dev-postgres`'s container address, not its name** — the far
end is resolved on the host, where `dev-postgres` only exists on Docker's
network. Read the address 🖥️ on the server:

```bash
docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' dev-postgres
# 172.18.0.3   ← use this in place of 172.18.0.3 above
```

It changes whenever the container is recreated (a wipe, [§7](#7-the-dev-database)), so read it
each time. ✅ The `ssh -N` command prints nothing and keeps running — that is
the tunnel open. Ctrl-C closes it. The full walk-through, including the seed
over the tunnel, is [`deployment/` Step 32b](deployment/11-dev-environment.md).

### 2a. One-time setup for SSH over Session Manager

Do this once per Mac. Afterwards `ssh kidlearn` gives you a shell on the server.

#### What you are building, in plain words

- **SSH** logs you in to a Linux machine from a terminal, proving who you are
  with a **key pair** instead of a password.
- A **key pair** is two files made together. The **private key**
  (`~/.ssh/kidlearn`) never leaves your Mac. The **public key**
  (`~/.ssh/kidlearn.pub`) is safe to share; the server keeps a copy.
- **`authorized_keys`** is the file on the server listing the public keys
  allowed to log in.
- **Session Manager (SSM)** is AWS's way into the server without port 22. SSH
  travels *inside* an SSM connection, so the server stays closed.
- **`~/.ssh/config`** on your Mac holds shortcuts. Its `Host kidlearn` block is
  what makes the word `kidlearn` mean "this instance, this user, this key,
  through SSM". `kidlearn` is **not** a real internet name.

```
 💻 Mac                                              🖥️ EC2 server
 ~/.ssh/kidlearn      (private key, stays here)
 ~/.ssh/kidlearn.pub  ──── copied once (step 3) ───► /home/ec2-user/.ssh/authorized_keys
 ~/.ssh/config        (the "kidlearn" shortcut)
        │
        └── ssh kidlearn ══ SSM tunnel, no open port ══► sshd checks the key ► shell
```

`~` means your home folder: `/Users/salman` on the Mac, `/home/ec2-user` for
`ec2-user` on the server. A path starting `~/.ssh` is a different file on each
machine.

#### Step 1 · 💻 Mac — install the plugin and make the key pair

```bash
brew install --cask session-manager-plugin
session-manager-plugin                          # prints a version — the plugin is installed

ssh-keygen -t ed25519 -f ~/.ssh/kidlearn -C "kidlearn-ec2"
```

`ssh-keygen` asks for a passphrase — press Enter twice for none. If it says the
file already exists, you made the key before: answer `n` and use the one you have.

✅ `ls ~/.ssh/kidlearn*` lists `kidlearn` and `kidlearn.pub`.

#### Step 2 · 💻 Mac — find the instance ID

The `describe-instances` command at the top of [§2](#2-getting-a-shell--and-the-logs). Write down the `i-…` value.

#### Step 3 · 💻 then 🖥️ — give the server your public key

**💻 Mac** — copy the public key to the clipboard, then open a session:

```bash
cat ~/.ssh/kidlearn.pub          # one line: "ssh-ed25519 AAAAC3Nza… kidlearn-ec2"
pbcopy < ~/.ssh/kidlearn.pub     # now it is on the clipboard
aws ssm start-session --target i-0a1b2c3d4e5f67890 --region ap-south-1
```

**🖥️ Server** — the prompt is now `sh-5.2$`. Type `echo '`, press **Cmd-V** to
paste the key, then type the rest, so the whole line reads:

```bash
echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIK3x…rest of your key… kidlearn-ec2' | sudo -u ec2-user tee -a /home/ec2-user/.ssh/authorized_keys
```

> ⚠️ **Paste the key itself, not a placeholder.** If what follows `echo '`
> starts with `<`, it is placeholder text from a guide, not your key — the
> server stores that text and still refuses you.

*Reading it:* `echo '…'` prints the key; `|` hands it to the next command;
`sudo -u ec2-user` runs that as `ec2-user`, the user you will log in as;
`tee -a` **appends** to `authorized_keys`, keeping keys already there (without
`-a` it would replace the file).

Then tighten the permissions — SSH ignores the file if others can write to it:

```bash
sudo -u ec2-user chmod 700 /home/ec2-user/.ssh
sudo -u ec2-user chmod 600 /home/ec2-user/.ssh/authorized_keys
sudo cat /home/ec2-user/.ssh/authorized_keys
```

✅ Every line starts with `ssh-ed25519 AAAA` (or `ssh-rsa AAAA`), and none
contains `<` or `>`. Delete a bad line with
`sudo -u ec2-user nano /home/ec2-user/.ssh/authorized_keys` (Ctrl-O, Enter to
save; Ctrl-X to leave).

**🖥️ Server** — type `exit` until you are back at your Mac prompt.

#### Step 4 · 💻 Mac — add the `kidlearn` shortcut to `~/.ssh/config`

Check the prompt first — this **must not** run on the server, where it fails
later with an `AccessDeniedException` naming `assumed-role/kidlearn-instance`.

Replace `i-0a1b2c3d4e5f67890` with your ID from step 2, then paste the whole block:

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
cat >> ~/.ssh/config <<'EOF'

Host kidlearn
  HostName i-0a1b2c3d4e5f67890
  User ec2-user
  IdentityFile ~/.ssh/kidlearn
  ProxyCommand sh -c "aws ssm start-session --target %h --document-name AWS-StartSSHSession --parameters 'portNumber=%p' --region ap-south-1"
EOF
chmod 600 ~/.ssh/config
```

*Reading it:* `cat >> file <<'EOF' … EOF` appends everything between the two
`EOF` lines to the **end** of the file (creating it if needed). `HostName` is the
instance ID, and `ProxyCommand` tells `ssh` to go through Session Manager instead
of the internet (`ssh` fills in `%h` and `%p`).

To use an editor instead: `nano ~/.ssh/config`, paste the five `Host kidlearn`
lines, then Ctrl-O, Enter, Ctrl-X. A `# comment` must be on a line of its own.

#### Step 5 · 💻 Mac — check

```bash
ssh -G kidlearn | grep -E '^(hostname|user|identityfile) '
ssh kidlearn
```

✅ The first prints your `i-…` ID, `ec2-user` and `~/.ssh/kidlearn`. The second
changes the prompt to `[ec2-user@ip-172-31-… ~]$` — you are on the server.
`sudo su -` for root; `exit` to come back.

Your IAM **user** needs `ssm:StartSession` on the instance and on
`arn:aws:ssm:*::document/AWS-StartSSHSession`. An account administrator already
has it; the instance role from [`deployment/` Step 17](deployment/06-server.md) covers the server's side.

#### When it does not work

| `ssh kidlearn` says | What it means | Fix |
|---|---|---|
| `Could not resolve hostname kidlearn` | This machine has no `Host kidlearn` block — step 4 skipped, or done on the server | Step 4, on the 💻 Mac |
| `AccessDeniedException … assumed-role/kidlearn-instance/i-…` | You ran `ssh kidlearn` **on the server** | `exit` to the Mac and run it there. On the server, remove `/root/.ssh/config` and `/root/.ssh/kidlearn*` if steps 1 and 4 were done there by mistake |
| `AccessDeniedException … user/<your name>` | Your IAM user lacks the permission above | Ask the account administrator |
| `SessionManagerPlugin is not found` | Step 1's install has not happened on this Mac | `brew install --cask session-manager-plugin` |
| `Permission denied (publickey,…)` | SSM worked, but the server does not know this Mac's key | Redo step 3 and check its ✅ |

For anything else, `ssh -v kidlearn 2>&1 | grep -iE 'offering|accepted|denied'`
shows which key was tried and what the server answered. Revoking access is
deleting the line from `authorized_keys` plus removing the IAM permission.

### 2b. Logs and health at a glance

🖥️ Server, as root:

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}'   # what is running
docker logs --tail 100 -f prod-api                    # production API (Ctrl-C to stop)
docker logs --tail 100 -f dev-api                     # dev API
docker logs --tail 100 -f kidlearn-caddy              # edge / TLS
df -h /                                               # disk
free -m                                               # memory
docker stats --no-stream                              # memory per container
ss -tlnp                                              # what is listening
```

What good looks like:

| Command | Healthy |
|---|---|
| `docker ps` | `kidlearn-caddy`, `prod-api` (and with dev up, `dev-api`, `dev-postgres`) all `Up …`, the APIs `(healthy)` |
| `df -h /` | `Use%` well under 80% |
| `free -m` | `available` about 700 MB or more with both stacks up |
| `ss -tlnp` | `docker-proxy` on `:80` and `:443` (that is Caddy) and `sshd` on `:22` (it serves `ssh kidlearn` through SSM; the security group blocks it from outside) — nothing else, and never `:5432` |

The API logs are pino JSON, one object per line; `"level":50` is an error.
**Frontend logs are in the Vercel dashboard**, per project — nothing about the
web tier is on the box.

💻 From anywhere, the one-line health checks:

```bash
curl -s https://api.kidlearn.net/health        # {"data":{"status":"ok",…}}
curl -s https://api.dev.kidlearn.net/health    # same, for dev
```

---

## 3. Deploying the API

Both images are environment-agnostic, so one bare commit SHA (e.g. `a1b2c3d`)
names a release for either environment.

| Step | Where | Production | Development |
|---|---|---|---|
| 1. Build and push the two images | 💻 | [Step 16](deployment/05-aws-storage-secrets-images.md), on `main` | [Every time you update dev, 1–2](deployment/11-dev-environment.md), on `dev` |
| 2. Only if `deploy/` changed: refresh the box's copy | 🖥️ | [below](#putting-deploy-on-the-box) | [below](#putting-deploy-on-the-box) |
| 3. Deploy | 🖥️ | `/opt/kidlearn/deploy/deploy.sh prod a1b2c3d` | `/opt/kidlearn/deploy/deploy.sh dev a1b2c3d` |

Add `--migrate` to step 3 when the release adds anything under
`packages/db/prisma/migrations/` — [below](#migrations-are-a-flag-deliberately). The full release routine,
website half included, is [`deployment/10-release-life-cycle.md`](deployment/10-release-life-cycle.md).

**Build from the branch the environment tracks.** Production runs a `main`
commit; dev runs a `dev` commit. Any SHA you have pushed deploys to either
environment, so nothing stops you deploying the wrong one.

✅ The last line `deploy.sh` prints is
`[deploy:prod] healthy and database reachable — deploy complete at a1b2c3d`.

*What it does:* fetches that environment's SSM parameters into
`/opt/kidlearn/<env>/app.env`, writes `compose.env`, pulls, (migrates), brings
the stack up, then waits up to 150 seconds for the container healthcheck
(`/health`, DB-free) and then `/ready` (one database read). On success it
records the tag in `/opt/kidlearn/<env>/last-good-tag`. The annotated version is
[`deployment/` Step 23](deployment/06-server.md).

### When `deploy.sh` fails

It leaves the new image **running** (so you can read why), prints the last 50
log lines, and ends with the rollback command. What the last lines mean:

| `deploy.sh` says | Likely cause | Do |
|---|---|---|
| `no parameters found under /kidlearn/prod/` | Wrong region, or the instance role cannot read SSM | Check [Step 17](deployment/06-server.md)'s policy |
| `manifest unknown` / `not found` while pulling | No image with that SHA in ECR | Check the SHA against ECR; finish the build |
| `migration failed — nothing was restarted` | The migration itself failed; the old release still serves | Read the output above it; fix with a new forward migration |
| `exited … did not get as far as a healthcheck` | The API refused to boot — usually `config/env.ts` naming a missing or malformed variable in the log lines | Fix the SSM parameter ([§4](#4-where-every-value-lives)), re-run the same command |
| `is up but /ready failed` | Cannot reach the database: wrong `DATABASE_URL`, a paused Supabase project, or (first dev deploy) no schema yet | Supabase dashboard → restore the project; or add `--migrate` |
| `ROLL BACK WITH: …/deploy.sh prod 9f8e7d6` | Any of the above | Run that line — [Rollback](#rollback--two-independent-halves) |

### Rollback — two independent halves

Both, because under load nobody remembers the second one.

**1. API** — 🖥️ server, as root. Deploy the previous good SHA, **without**
`--migrate`:

```bash
/opt/kidlearn/deploy/deploy.sh prod 9f8e7d6      # or: dev 9f8e7d6
```

Where to find that SHA, in order:

- **After a failed deploy:** the `ROLL BACK WITH:` line `deploy.sh` printed.
- **Before deploying, every time:** note `cat /opt/kidlearn/prod/last-good-tag`.
- **After a deploy that passed but is wrong** (the bug is in the app, not the
  health checks): `last-good-tag` now names the **bad** release, so do not use
  it. List what the box still has, newest first, and take the second line:

  ```bash
  docker images --format '{{.CreatedAt}}  {{.Tag}}' '*/kidlearn-api' | sort -r | head -5
  ```

  Or ECR console → `kidlearn-api` → **Images**, sorted by pushed date.

✅ The rollback ends with the same `deploy complete at 9f8e7d6` line, and
`curl -s https://api.kidlearn.net/health` is `ok`.

**2. Frontend** — 🌐 Vercel → the project → **Deployments** → the last
known-good one → **⋯** → **Instant Rollback**.

The weekly prune (`/etc/cron.weekly/kidlearn-docker-prune`) keeps the **4 newest
images per repository** on the box; older ones are pulled from ECR again, which
`deploy.sh` does anyway. ECR keeps 10. It never removes an image a running
container uses.

### Putting `deploy/` on the box

`bootstrap.sh` creates an empty `/opt/kidlearn/deploy`; the scripts and Compose
files in it are a copy you make — the first time, and again whenever anything
under `deploy/` changes. **The box never updates them itself** (not even after
file 38a). If a deploy behaves like an older version of the scripts, this is why.

There is **one** copy for both environments, so the next production deploy runs
whatever you copied for dev.

**Option 1 — clone from GitHub** (🖥️ server, as root). Copies a branch as
pushed, not your working tree. `-b main` for production, `-b dev` for dev:

```bash
dnf install -y git                    # once; harmless if already installed
git clone --depth 1 -b main https://github.com/salmanbd100/kidlearn.git /tmp/kidlearn
cp -r /tmp/kidlearn/deploy/. /opt/kidlearn/deploy/ && rm -rf /tmp/kidlearn
chmod +x /opt/kidlearn/deploy/*.sh
```

**Option 2 — `rsync` your working tree** (💻 Mac, from the repository root;
needs [§2a](#2a-one-time-setup-for-ssh-over-session-manager)):

```bash
rsync -az --delete deploy/ kidlearn:/tmp/deploy/
ssh kidlearn 'sudo cp -r /tmp/deploy/. /opt/kidlearn/deploy/ && sudo chmod +x /opt/kidlearn/deploy/*.sh && rm -rf /tmp/deploy'
```

✅ 🖥️ `ls /opt/kidlearn/deploy` shows
`app  backup.sh  bootstrap.sh  deploy.sh  edge  weekly-reports.sh`.

If the change was under `deploy/edge/`, also recreate Caddy ([§6](#6-tls--caddy-and-the-one-way-to-lock-yourself-out)).

### Migrations are a flag, deliberately

A schema change must be a decision, not a side effect of a restart:

```bash
/opt/kidlearn/deploy/deploy.sh prod a1b2c3d --migrate     # or: dev a1b2c3d --migrate
```

`deploy.sh` writes `compose.env` with the new tag, runs `kidlearn-migrate:a1b2c3d`,
and only restarts the API if it succeeds. Whether a release has migrations — 💻
Mac:

```bash
git diff --name-only 9f8e7d6 a1b2c3d -- packages/db/prisma/migrations/   # any output → --migrate
```

**Do not run the migrate service by hand before a deploy.** Until `deploy.sh`
rewrites `compose.env`, its `IMAGE_TAG` names the release already serving, so the
hand-run command prints `No pending migrations to apply` and the new API then
boots on the old schema. The hand-run form is only for re-running the
**deployed** release's migrations (🖥️, as root):

```bash
cd /opt/kidlearn/deploy/app
docker compose --env-file /opt/kidlearn/prod/compose.env \
  -p kidlearn-prod -f compose.yml --profile migrate run --rm migrate
# dev: --env-file /opt/kidlearn/dev/compose.env  -p kidlearn-dev  and add  -f compose.dev.yml
```

**The `--env-file` is not optional.** Without it Compose has no `ENV_NAME`,
`ECR_REGISTRY` or `IMAGE_TAG` and stops on
`env file /opt/kidlearn//app.env not found` — which reads like a missing file
and is a missing variable.

**Rules for writing a migration:**

- **Forward-only.** A bad migration is fixed by a new one, never by editing an
  applied one. Never `prisma migrate dev` against a deployed database.
- **Safe for the previous release.** During a deploy, and after any rollback,
  the *old* API runs against the *new* schema. Prisma selects every column, so a
  `DROP COLUMN` breaks every read of that table. Split destructive changes:
  **expand** (add, nullable or with a default) in one release; **contract**
  (drop) in a later one. A migration that cannot be written this way needs a
  maintenance window and says so in its header.

---

## 4. Where every value lives

`apps/server/src/config/env.ts` is the enforcement — the API refuses to boot on a
missing or malformed variable, naming the field. This table is the inventory.

**Secrets: SSM Parameter Store, every one a `SecureString`**, under
`/kidlearn/prod/` and `/kidlearn/dev/`. Standard tier, free; this uses about 30.

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
| `API_RATE_LIMIT_PER_MINUTE` | SSM, optional | unset = 300 per client IP on `/api/*` ([§12](#12-ceilings-and-limits-worth-knowing-before-they-bite)) | same |
| `MCP_ENABLED` | SSM, optional | unset (= `false`) until turned on — mounts `/mcp` and the token endpoints | `true` to try it first |
| `MCP_RESOURCE_URL` | unset | defaults to `${BETTER_AUTH_URL}/mcp`; must be `https` | same |
| `MCP_DRAFTS_PER_DAY` / `MCP_RATE_LIMIT_PER_MINUTE` | SSM, optional | unset = 30 per admin per day / 60 per admin per minute | same |
| `POSTGRES_PASSWORD` | SSM (dev only) | — | `openssl rand -base64 24` |
| `BACKUP_S3_BUCKET` | SSM (prod only) | the backup bucket name, no `s3://` | — ; dev is never backed up |
| `BACKUP_HEARTBEAT_URL` | SSM (prod only, optional) | a healthchecks.io ping URL — §8 | — |
| `WEEKLY_REPORTS_HEARTBEAT_URL` | SSM (prod only, optional) | a second ping URL — §9 | — |
| `NEXT_PUBLIC_API_URL` | **Vercel**, build-time | `https://api.kidlearn.net` | `https://api.dev.kidlearn.net` |
| `NEXT_PUBLIC_SITE_URL` | **Vercel**, build-time | `https://kidlearn.net` | `https://dev.kidlearn.net` |
| `MEDIA_ASSET_HOSTS` | **Vercel**, build-time | `https://res.cloudinary.com` | `https://res.cloudinary.com` |
| `SITE_NOINDEX` | **Vercel**, build-time | **unset** | `true` |
| `DEV_SITE_BASIC_AUTH` | **Vercel**, runtime | **unset** | **unset** — optional `dev:<password>` turns on a password prompt; **not** `NEXT_PUBLIC_` |

`ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` are in neither deployment — they
are passed inline to `seed:admin` only ([`admin-account-guide.md`](admin-account-guide.md)).

**Changing a value:**

- **SSM** (💻 Mac): `aws ssm put-parameter --name /kidlearn/prod/LOG_LEVEL --type SecureString --value 'debug' --overwrite --region ap-south-1`,
  then 🖥️ redeploy the running image so it is read:
  `/opt/kidlearn/deploy/deploy.sh prod "$(cat /opt/kidlearn/prod/last-good-tag)"`.
  ✅ `deploy complete` again.
- **compose** rows are fixed in `deploy/app/compose.yml` and `deploy.sh` — a code change.
- **Vercel** rows: 🌐 project → **Settings → Environment Variables**, then
  **redeploy** — all four build-time ones do nothing until the next build.

**Three generated files per environment**, written by `deploy.sh`, root-owned `0600`:

| File | Job |
|---|---|
| `/opt/kidlearn/<env>/app.env` | handed to the container as Compose's `env_file:` — the SSM values |
| `/opt/kidlearn/<env>/compose.env` | the `${...}` substitutions the Compose files contain (`ENV_NAME`, `ECR_REGISTRY`, `IMAGE_TAG`, the compose rows, dev's `POSTGRES_PASSWORD`). Passed with `--env-file` |
| `/opt/kidlearn/<env>/last-good-tag` | the tag of the last deploy that passed `/health` and `/ready` — the rollback target `deploy.sh` prints. Written only on success |

**Every `$` in `app.env` and `compose.env` is doubled**, because Compose
interpolates both — a raw `s3cr$tastic` would reach the process as `s3cr`. So
**never copy a value out of `app.env`** into `psql` or anywhere else; read it
from SSM instead, as `backup.sh` does.

### Two things in that table that will cost you an afternoon

**The dev `DATABASE_URL` carries neither `pgbouncer=true` nor
`connection_limit`.** Those exist for Supabase's PgBouncer; against plain
Postgres `pgbouncer=true` needlessly disables prepared statements. Production
states `connection_limit=5` so nobody "fixes" it to the `=1` serverless guides
recommend — this API is one long-running process, and with one connection every
request queues behind every other. The two production URLs differ in job: the
app uses the pooled one; migrations and `pg_dump` use the session-pooler one
(one long connection, which the transaction pooler would kill).

**Four Vercel variables are build-time, and one does not look it.**
`NEXT_PUBLIC_*` are inlined into the client bundle; so are `MEDIA_ASSET_HOSTS`
and **`SITE_NOINDEX`** (Next serialises `headers()` at `next build`). All four are
declared under `web#build` → `env` in `turbo.json`, because **Turbo runs in strict
env mode** and strips any undeclared variable from the build silently. **A new
build-time variable goes into `turbo.json` in the same change.**

**The bundle check.** The failure this guards against is `dev.kidlearn.net`
calling `api.kidlearn.net` — it looks like a CORS bug, is not one, and is a dev
build writing to the production database. Check the deployed JavaScript, not
the dashboard (💻 Mac):

```bash
curl -s https://dev.kidlearn.net \
  | grep -oE '/_next/static/[^"]+\.js' | sort -u \
  | while read -r f; do curl -s "https://dev.kidlearn.net$f"; done \
  | grep -oE 'api(\.dev)?\.kidlearn\.net' | sort | uniq -c
```

*Reading it:* fetch the page, pull out every script path, download each script,
and count which API host names appear in them.

✅ Only `api.dev.kidlearn.net`. If `api.kidlearn.net` appears, fix
`NEXT_PUBLIC_API_URL` in the dev Vercel project and **redeploy**. Run it against
`https://kidlearn.net` too: only `api.kidlearn.net`.

---

## 5. DNS — Cloudflare, free tier ⬜ not yet done

Registrar nameservers point at Cloudflare. Five records, **proxy off (grey
cloud) on all five** — an orange cloud puts a second TLS terminator in front of
Vercel's, and breaks Caddy's ACME challenge on the API names.

| Name | Type | Target |
|---|---|---|
| `kidlearn.net` | CNAME (flattened by Cloudflare), or A | the apex target Vercel shows for the production project |
| `www` | CNAME | the `*.vercel-dns.com` target Vercel shows for the production project |
| `dev` | CNAME | the same, for the dev project |
| `api` | A | the Elastic IP |
| `api.dev` | A | the Elastic IP |

**Take the Vercel targets from the project's Domains tab on the day**, not from
anything written here — Vercel has changed its published apex address before.
A half-provisioned domain is indistinguishable from a CORS bug, so wait for both
Caddy certificates and all three Vercel domains before testing anything else.

✅ 💻 `dig +short api.kidlearn.net` prints the Elastic IP.

Record:

- Registrar: `<registrar>`
- Cloudflare account: `<account>`
- Elastic IP: `<a.b.c.d>`
- Instance ID: `<i-…>`

---

## 6. TLS — Caddy, and the one way to lock yourself out

Caddy obtains and renews both API certificates itself; Vercel handles the three
web hostnames.

**`deploy/edge/Caddyfile` defaults to the ACME *staging* endpoint**, because
Caddy requests certificates the instant it starts, there is no dry run, and
Let's Encrypt's production endpoint allows only 5 duplicate certificates a week.
A wrong A record burns them.

**The endpoint and email are set on the box, never in the Caddyfile.** They live
in `/opt/kidlearn/edge/caddy.env` (root, `0600`, outside `deploy/` so a refresh
never resets it):

```bash
ACME_EMAIL=salman@example.com
ACME_CA=https://acme-v02.api.letsencrypt.org/directory   # leave this line out for staging
```

Editing the Caddyfile on the box is undone by the next refresh of `deploy/`
([§3](#putting-deploy-on-the-box)) — and a box on production silently drops back
to staging. A missing `caddy.env` is not an error: Caddy starts on staging. The
first-run sequence is [`deployment/` Step 21](deployment/06-server.md).

**To change endpoint, or after any change under `deploy/edge/`** — 🖥️ server, as root:

```bash
nano /opt/kidlearn/edge/caddy.env        # only if changing endpoint or email
cd /opt/kidlearn/deploy/edge
docker compose -p kidlearn-edge -f compose.yml up -d --force-recreate
docker logs --tail 30 kidlearn-caddy
```

✅ The log shows `certificate obtained successfully` (or nothing new, if the
certificates were already there), and 💻 `curl -sI https://api.kidlearn.net/health | head -1`
shows `HTTP/2 200` with no certificate error. A certificate error on production
means the box is on staging — check `caddy.env`.

**The `caddy_data` volume is load-bearing.** It holds the ACME account key and
both certificates; losing it repeatedly hits the rate limit — a week with no
TLS. **Never run `docker volume prune` on this box.**

- Endpoint the box is currently on: `<staging | production>`

---

## 7. The dev database

Disposable and never backed up (file 38 requirement 2). This is the "undo" for a
bad migration on dev. 🖥️ server, as root:

```bash
# DESTROYS THE DEV DATABASE COMPLETELY. Never touches production.
cd /opt/kidlearn/deploy/app
dc() { docker compose --env-file /opt/kidlearn/dev/compose.env \
         -p kidlearn-dev -f compose.yml -f compose.dev.yml "$@"; }
dc down -v && dc up -d && dc --profile migrate run --rm migrate
```

*Reading it:* the `dc() { … }` line defines a shortcut, `dc`, for the long dev
Compose command — it lasts until you close the terminal. `down -v` stops dev and
**deletes its volume** (the database). `up -d` starts an empty Postgres and the
API. The migrate job creates the tables. `-p kidlearn-dev` is what keeps it away
from production.

✅ `docker ps` shows `dev-api` and `dev-postgres` up, and 💻
`curl -s https://api.dev.kidlearn.net/health` is `ok`.

Then refill it — either the starter data and a dev admin
([`deployment/` Steps 32b and 32c](deployment/11-dev-environment.md)), or a copy of production (§8),
which rehearses the restore at the same time.

---

## 8. Backups — production only ⬜ not yet done

Supabase's free tier has **no point-in-time recovery**, so this is the only copy
of production data. Set up in [`deployment/` Step 27](deployment/08-backups-and-smoke-test.md).

**What runs:** `deploy/backup.sh`, nightly at 01:30 Asia/Dhaka, from root's
crontab:

```cron
CRON_TZ=Asia/Dhaka
30 1 * * *  /opt/kidlearn/deploy/backup.sh >>/var/log/kidlearn-backup.log 2>&1
```

It dumps the `public` schema over `DIRECT_URL` with the `postgres:<major>-alpine`
image matching Supabase's version, gzips it straight to
`s3://<bucket>/prod/.partial/…`, refuses anything under 1 KB, then moves it to
`prod/<timestamp>.sql.gz`. Only `public` is dumped — it holds every application
table and `_prisma_migrations`; Supabase's own schemas cannot load into plain
Postgres. The bucket's lifecycle rule expires backups after 30 days. The *why*
of each choice is in the script's comments.

**A failed run alerts** through healthchecks.io: the script pings
`/kidlearn/prod/BACKUP_HEARTBEAT_URL` on success and `<url>/fail` on failure, and
the monitor also alerts when no ping arrives (cron never fired). Without the
parameter it still backs up, and warns on every run.

### Checking it worked

🖥️ server, as root:

```bash
tail -n 5 /var/log/kidlearn-backup.log
crontab -l                              # both lines from §8 and §9 are there
systemctl is-active crond               # active
```

✅ The log's last line is `[backup] wrote s3://kidlearn-backups-salman-2026/prod/2026-10-25T19-30-02Z.sql.gz (1234567 bytes)`
— a recent date, a size well over 1 KB. A `FAILED with status …` line means read
the lines above it. If `crond` is not `active`, nothing in §8 or §9 has ever run:
`dnf install -y cronie && systemctl enable --now crond`.

To run it by hand now (takes a minute or two): `/opt/kidlearn/deploy/backup.sh`.

### Restoring into the dev Postgres

**Rehearse this once** (file 38 requirement 16) — an unrestored backup is a
guess. It **replaces the dev database wholesale**, and must go into an **empty**
database: the dump carries the schema and `_prisma_migrations`, so a migrated
database stops at the first `already exists`.

> ⚠️ **This copies real children's data into dev**, which logs at `debug`. If
> that is not acceptable yet, restore into a scratch container you delete
> afterwards instead.

🖥️ server, as root:

```bash
# 1. Which backup: read the bucket name from SSM, then list the newest five
BUCKET=$(aws ssm get-parameter --name /kidlearn/prod/BACKUP_S3_BUCKET --with-decryption \
  --region ap-south-1 --query Parameter.Value --output text)
aws s3 ls "s3://$BUCKET/prod/" | grep '\.sql\.gz$' | sort | tail -n 5
#   2026-10-26 01:31:04    1234567 2026-10-25T19-30-02Z.sql.gz   ← newest is last

# 2. Stop the dev API and empty the database
cd /opt/kidlearn/deploy/app
dc() { docker compose --env-file /opt/kidlearn/dev/compose.env \
         -p kidlearn-dev -f compose.yml -f compose.dev.yml "$@"; }
dc stop api
docker exec dev-postgres psql -U kidlearn -d postgres -v ON_ERROR_STOP=1 \
  -c 'DROP DATABASE IF EXISTS kidlearn WITH (FORCE)' \
  -c 'CREATE DATABASE kidlearn'
docker exec dev-postgres psql -U kidlearn -d kidlearn -v ON_ERROR_STOP=1 \
  -c 'DROP SCHEMA public'

# 3. Load it — replace the file name with the newest one from step 1
aws s3 cp "s3://$BUCKET/prod/2026-10-25T19-30-02Z.sql.gz" - | gunzip \
  | sed '/^SET transaction_timeout = 0;$/d' \
  | docker exec -i dev-postgres psql -U kidlearn -d kidlearn \
      -v ON_ERROR_STOP=1 --single-transaction

dc start api
```

*Reading it:* never pick a file under `.partial/` — `grep '\.sql\.gz$'` skips
that prefix. The `DROP SCHEMA public` is there because the dump creates `public`
itself. The `sed` removes one setting newer `pg_dump` writes that dev's
Postgres 16 rejects; if the load stops on another unknown setting, delete that
line the same way. `ON_ERROR_STOP` plus `--single-transaction` make it all or
nothing — plain `psql` carries on after an error and still exits `0`.

✅ The load prints a stream of `SET`, `CREATE TABLE`, `COPY 42` lines and **no**
`ERROR:` line (on an error it stops and loads nothing). Then compare row counts with
production (🌐 Supabase → SQL Editor, same query):

```bash
docker exec dev-postgres psql -U kidlearn -d kidlearn -c \
  'SELECT (SELECT count(*) FROM "ChildProfile") AS children,
          (SELECT count(*) FROM "LessonProgress") AS progress,
          (SELECT count(*) FROM _prisma_migrations) AS migrations'
```

The numbers match (production may have gained a few rows since last night), and
`migrations` equals the number of folders in `packages/db/prisma/migrations/`.
If dev runs a newer release than production, apply its migrations afterwards
with the hand-run migrate command in [§3](#migrations-are-a-flag-deliberately).

Record:

- Bucket: `<bucket>`
- Last restore rehearsal: `<date>` — **⬜ never**

---

## 9. Scheduled jobs — production only ⬜ not yet done

The weekly parent-report job (`POST /api/admin/jobs/weekly-reports`, bearer
`CRON_SECRET`) is triggered from the box (file 38 requirement 17), Mondays 02:00
Asia/Dhaka, from root's crontab:

```cron
CRON_TZ=Asia/Dhaka
0 2 * * 1  /opt/kidlearn/deploy/weekly-reports.sh >>/var/log/kidlearn-weekly-reports.log 2>&1
```

The `curl` lives in the script because **cron has no line continuation**. It
retries on a failed request (the job is idempotent) and pings
`/kidlearn/prod/WEEKLY_REPORTS_HEARTBEAT_URL` like `backup.sh` does.

**The endpoint answers `202 Accepted` and works in the background**, so the
heartbeat means the run *started*, not that every report was written. The same
run deletes `SessionEvent` rows older than 90 days and reports
`sessionEventsPruned`.

### Checking it worked — Monday morning

🖥️ server, as root:

```bash
tail -n 3 /var/log/kidlearn-weekly-reports.log
docker logs prod-api --since 24h 2>&1 | grep -i "weekly report"
```

✅ The script log ends with `[weekly-reports] accepted — the outcome is in the API log`.
The API log has **no** `Weekly reports failed for N of M children` line — that
`error`-level line is the only place a partial failure shows.

**Dev runs no scheduled jobs.** Trigger it by hand there when testing.

---

## 10. Vercel — two Hobby projects ⬜ not yet done

Each project sets its own production branch (the [§1](#1-topology) table) so neither builds
the other's commits. Setting them up: [`deployment/` Steps 24–26](deployment/07-website-vercel.md) and
[Step 34](deployment/11-dev-environment.md).

| Setting | Value |
|---|---|
| Root Directory | `apps/web`, with *Include source files outside of the Root Directory* **enabled** |
| Build Command | `cd ../.. && pnpm turbo run build --filter=web` |
| Install Command | `pnpm install --frozen-lockfile`, at the repository root |
| Function region | `bom1` (Mumbai) — Hobby allows one; the default is `iad1` |

**The build must go through Turbo, not `next build`.** `apps/web` depends on
`@kidlearn/types`, which compiles to `dist/`; a bare `next build` fails on the
missing `dist`. If a first build fails, check the log shows `@kidlearn/types`
building first.

### Two Hobby facts that are operational, not footnotes

- **Hobby is licensed for non-commercial personal projects.** The first paid
  feature, advert or business use requires Pro ($20/month) — **a trigger for the
  escape hatch in [§11](#11-escape-hatch--moving-the-frontend-back-onto-the-box).**
- **Hobby has no overage billing.** Exceeding the transfer or edge-request
  ceiling **pauses the project**. **Turn on Vercel's usage notifications.**
  - Ceilings as at `<date>`: `<transfer>`, `<edge requests>`

---

## 11. Escape hatch — moving the frontend back onto the box

**Trigger:** either Hobby condition in §10. A response to a trigger, not
routine work; about thirty minutes. CI keeps `apps/web/Dockerfile` buildable
(file 38 requirement 5).

1. **Resize the box to `t4g.medium` first** — two Next.js servers do not fit in
   2 GiB. 🌐 Stop, change instance type, start; the Elastic IP survives it.
2. 🌐 Create the `kidlearn-web` ECR repository — it does not exist.
3. 💻 Build and push, one image per environment because `NEXT_PUBLIC_*` are
   baked in (`$REGISTRY` and `$SHA` as in [Step 16](deployment/05-aws-storage-secrets-images.md)):
   ```bash
   docker build --platform linux/arm64 -f apps/web/Dockerfile \
     --build-arg NEXT_PUBLIC_API_URL=https://api.kidlearn.net \
     --build-arg NEXT_PUBLIC_SITE_URL=https://kidlearn.net \
     --build-arg MEDIA_ASSET_HOSTS=https://res.cloudinary.com \
     -t "$REGISTRY/kidlearn-web:prod-$SHA" .
   docker push "$REGISTRY/kidlearn-web:prod-$SHA"
   # dev: the dev URLs, plus --build-arg SITE_NOINDEX=true, tagged dev-$SHA
   ```
4. Add a `web` service to `deploy/app/compose.yml` with a `${ENV_NAME}-web`
   network alias (and `DEV_SITE_BASIC_AUTH` at runtime on dev, if used).
5. Add the web hostnames to `deploy/edge/Caddyfile`, reverse-proxying to those
   aliases on the port the web container listens on.
6. Repoint the `kidlearn.net`, `www` and `dev` Cloudflare records at the Elastic
   IP. Caddy obtains three more certificates — go through staging again ([§6](#6-tls--caddy-and-the-one-way-to-lock-yourself-out)).

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
| SSM Parameter Store Standard | 10,000 parameters, free — this uses ~30 | — |
| AWS Budgets alarm | **$20/month** — [`deployment/` Step 4](deployment/02-accounts.md) | ⬜ not yet created |
| API flood guard | **300 requests/min per client IP** on `/api/*` — a `429 RATE_LIMITED`. Raise `API_RATE_LIMIT_PER_MINUTE` if a school or shared network trips it | 2026-10-05 |
| API JSON body | **100 KB** — a `413` | 2026-10-05 |
| MCP drafts | **30 per admin per day** (`MCP_DRAFTS_PER_DAY`), separate from the Gemini caps | 2026-10-22 |

Cost and sizing are file 38's "Costs, at steady state".

### AI assistants over MCP (file 41)

`POST /mcp` lets an admin's own assistant (Claude, Cursor, VS Code…) write
drafts. Caddy already proxies the whole API host, so nothing at the edge changes.

- **Turn it on:** 💻 create the SSM parameter `/kidlearn/<env>/MCP_ENABLED` =
  `true` (the `put-parameter` command in [§4](#4-where-every-value-lives)) and redeploy the running
  image. It is not in `compose.yml` on purpose: Compose's `environment:` beats
  `app.env`, so a key listed there could never be turned on.
  ✅ The CMS shows **AI assistants** working.
- **A token has leaked — revoke first.** Takes effect on the next call, no
  deploy. An admin revokes their own on the AI assistants page. Otherwise, in
  🌐 Supabase → SQL Editor (production) or `psql` on dev:
  - one token (the prefix is in the CMS list):
    `update "AdminAccessToken" set "revokedAt" = now() where prefix = 'klat_3f9a…';`
  - every token:
    `update "AdminAccessToken" set "revokedAt" = now() where "revokedAt" is null;`
  - one admin's tokens and sessions together: rotate their password with
    `seed:admin` ([`admin-account-guide.md` §3](admin-account-guide.md#3-kidlearnnet-and-devkidlearnnet)).
- **Then turn MCP off, if it should stay off:** set the parameter to `false` (or
  delete it) and 🖥️ redeploy the running image:
  `/opt/kidlearn/deploy/deploy.sh prod "$(cat /opt/kidlearn/prod/last-good-tag)"`.
  `/mcp` and the token endpoints stop existing; tokens stay in the table and
  work again if it is turned back on — which is why revoking comes first.
- **Who wrote a draft:** `AIGenerationJob.source = 'mcp'`, `requestedById` and
  the self-reported `client`; the AI Queue shows the same.
- **Gemini off:** omit `GEMINI_API_KEY`. The Gemini routes answer `503
  AI_PROVIDER_NOT_CONFIGURED` and the CMS hides them; narration still works.

---

## 13. Google OAuth — the two clients

| Client | Authorized JavaScript origins | Authorized redirect URIs |
|---|---|---|
| existing (local + dev) | `http://localhost:3000`, `https://dev.kidlearn.net` | `http://localhost:4000/api/auth/callback/google`, `https://api.dev.kidlearn.net/api/auth/callback/google` |
| new (production) | `https://kidlearn.net` | `https://api.kidlearn.net/api/auth/callback/google` |

Why two clients, why the cookie stays `SameSite=Lax`, and why there is no basic
auth on `api.dev.kidlearn.net`: file 38 requirements 14 and 4, and its Goal.

**Dev site password: off.** `dev.kidlearn.net` is open to anyone with the
address; `SITE_NOINDEX` keeps it out of search results. To turn the optional
prompt in `apps/web/proxy.ts` on, set `DEV_SITE_BASIC_AUTH` to `dev:<password>`
(e.g. `dev:correct-horse-battery`) in the dev Vercel project and redeploy. That
is the credential's only home — not SSM.

---

## 14. Smoke test

Run on a real phone, against production, after any deploy you are unsure about.

1. Parent signs in with Google on `https://kidlearn.net`.
2. The parent area opens straight away — **there is no PIN step**. A PIN prompt
   means an image from before 2026-09-09 is running.
3. Create a child profile.
4. A seeded lesson plays through all five steps, with audio.
5. The parent dashboard shows the learning time just spent.
6. `/admin/ai-queue` loads for the admin user and lists and filters jobs.
7. **Reload the page — you are still signed in.** This proves the proxy and
   cookie settings; if you are logged out on reload, investigate that first.

Plus, 💻 from your Mac:

```bash
curl -s https://api.kidlearn.net/health                                  # {"data":{"status":"ok",…}}
curl -s -o /dev/null -w '%{http_code}\n' https://api.kidlearn.net/docs   # 404 — docs are off in production
curl -si https://kidlearn.net | grep -i x-robots                         # nothing — noindex is dev-only
curl -si https://dev.kidlearn.net | head -1                              # HTTP/2 200 — no password on dev
curl -si https://api.dev.kidlearn.net/health | grep -iE '^HTTP|x-robots' # HTTP/2 200 and x-robots-tag: noindex, nofollow
nmap -Pn 13.200.10.20                                                    # your Elastic IP: only 80 and 443 open
```

`nmap` is `brew install nmap` on the Mac. ✅ Every line matches its comment.
