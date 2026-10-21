# Part 1 — Prepare your Mac, your code and GitHub

[← Previous](00-understand.md) · [Guide index](README.md) · [Next →](02-accounts.md)

> **Where you work:** 💻 your Mac, 🌐 GitHub. Steps 1–2.  
> **You finish with:** the tools installed, `main` up to date with `dev`, and an understanding of how CI guards both branches.  
> **Before you start:** Part 0 read once.

## Step 1 · 💻 Check your tools

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

## 1.5 · How GitHub fits in (read, nothing to do yet)

GitHub is not only where the code is stored. It is the **gatekeeper** that
decides what code is allowed to reach `main`, and `main` is what goes live.

**Two long-lived branches:**

```
   feature/42-something ─┐
   feature/43-other ─────┼──PR──► dev ──PR──► main ──► production
   dependabot/... ───────┘        │                    (Vercel + EC2)
                                  └──► (Part 11) the dev environment
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
[Step 16](05-aws-storage-secrets-images.md) (until [Part 12](12-automatic-deploys.md) automates it).

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

## Step 2 · 🌐 Bring `main` up to date with `dev`

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

## 2.5 · What is in `deploy/` (read, nothing to do)

These six items are the whole server side of the deployment. You will copy them
onto the server in [Step 20](06-server.md).

```
deploy/
├── bootstrap.sh        Runs ONCE when the server is born. Installs Docker, the
│                       Compose plugin, cron, 2 GB swap, makes /opt/kidlearn/*,
│                       and a weekly job that deletes old images.
├── edge/
│   ├── compose.yml     Starts Caddy. Opens ports 80/443. Creates the shared
│   │                   "kidlearn-edge" network. Keeps certificates in caddy_data.
│   └── Caddyfile       "api.kidlearn.net → send to prod-api:4000" (and the
│                       same for api.dev.kidlearn.net, used in Part 11).
├── app/
│   ├── compose.yml     Describes the API container (and the migrate job) for
│   │                   ANY environment — the environment name is a variable.
│   └── compose.dev.yml Extra pieces only dev has: its own Postgres, memory caps.
├── deploy.sh           The release button. "deploy.sh prod <sha>" — Part 6.
├── backup.sh           Nightly database dump to S3 — Step 27.
└── weekly-reports.sh   Monday trigger for parent reports — Step 27.
```

---

[← Previous](00-understand.md) · [Guide index](README.md) · [Next →](02-accounts.md)
