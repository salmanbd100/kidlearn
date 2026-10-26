# Deployment — from zero to `https://kidlearn.net`, by hand

> **Who this is for.** You own `kidlearn.net` (bought from Namecheap) and nothing
> else exists yet: no AWS, no Vercel, no database. You are new to AWS, Vercel and
> deployment in general. Work through the files **in order**. Every step says
> **what** you do, **why** you do it, and **how to check** it worked. Where a
> script does work for you, a **"Behind the scenes"** box says what it did, so
> nothing is magic.

**Time:** about one full day for production, half a day for dev, half a day for
automatic deploys. You can stop between any two steps.
**Cost:** about **$14 per month** (AWS), plus your domain. Everything else is free —
the service-by-service breakdown is [0.12](00-understand.md#012-what-it-costs).

## The journey

Three stages. Stop between them for as long as you like — each one ends in a
working system. Step numbers run through the whole journey, so "Step 31" always
means the same step whichever file mentions it.

| # | File | Steps | Where you work | Status |
|---|---|---|---|---|
| | **Stage 1 — Production live at `kidlearn.net`** (file 38) | | | |
| 0 | [Understand what you are building](00-understand.md) | — | read only | ✅ |
| 1 | [Prepare your Mac, your code and GitHub](01-prepare-mac-and-github.md) | 1–2 | 💻 🌐 | ✅ |
| 2 | [Create your accounts](02-accounts.md) | 3–5 | 🌐 | ✅ |
| 3 | [Move your domain's DNS to Cloudflare](03-dns-cloudflare.md) | 6–7 | 🌐 | ✅ |
| 4 | [Database and outside services](04-database-and-services.md) | 8–11 | 🌐 💻 | ✅ |
| 5 | [AWS: storage, secrets and images](05-aws-storage-secrets-images.md) | 12–16 | 🌐 💻 | ✅ |
| 6 | [The server](06-server.md) | 17–23 | 🌐 🖥️ | 🟨 17–20c done · **next: Step 21** |
| 7 | [The website on Vercel](07-website-vercel.md) | 24–26 | 🌐 | ⬜ |
| 8 | [Backups, scheduled jobs, final test](08-backups-and-smoke-test.md) | 27–28 | 🖥️ 💻 📱 | ⬜ |
| 9 | [Finish the paperwork](09-paperwork.md) | — | notes | ⬜ |
| 10 | [Living with it: the release life cycle](10-release-life-cycle.md) | — | read, then use | ⬜ |
| | **Stage 2 — Dev environment at `dev.kidlearn.net`, same server** (file 38) | | | |
| 11 | [The dev environment](11-dev-environment.md) | 29–36 | 🌐 💻 🖥️ | ⬜ |
| | **Stage 3 — Automatic API deploys from GitHub Actions** (file 38a) | | | |
| 12 | [Automatic API deploys](12-automatic-deploys.md) | 37–46 | 🌐 💻 | ⬜ |
| | [Troubleshooting](troubleshooting.md) — what you see, what to check; and what costs money or locks you out | | | |

Update the **Status** column as you go — it is the one place that says where you
are. The CI gates (file 39) are already done;
[Part 1.5](01-prepare-mac-and-github.md#15--how-github-fits-in-read-nothing-to-do-yet)
explains what they check.

## Where you work

Every command block is marked with one of these. **Look at the prompt before you
paste** — a command run in the wrong terminal fails, or worse, half-works.

| Icon | Place | What you do there | How to tell you are there |
|---|---|---|---|
| 🌐 | A website (AWS, Vercel, Cloudflare, GitHub…) | Click buttons, fill forms | — |
| 💻 | Terminal on **your Mac**, inside the `kidlearn` folder | Database setup, building images | The prompt ends in `%`, e.g. `salman@MacBook kidlearn %` |
| 🖥️ | Terminal **on the server** (Session Manager, in the browser — [Step 20a](06-server.md)) | Start Caddy and the API, set up cron | The prompt is `sh-5.2$`, or `[root@ip-172-31-…]#` after `sudo su -` |
| 📱 | Your phone | Testing what a parent actually sees | — |

Anything in `<angle brackets>` or marked "e.g." is a **placeholder**: replace
it with your own value, and do not type the `< >` themselves.

## How to work through a file

1. Read the box at the top: what you finish with, and what must be done first.
2. Do one step at a time. Do not skip the ✅ **Check** lines — each one proves
   the step worked before the next step builds on it.
3. Write every value you create into your values sheet ([0.11](00-understand.md#011-your-values-sheet)).
4. When something does not match, stop and open [Troubleshooting](troubleshooting.md)
   before trying anything clever.
5. Re-read the golden rules ([0.10](00-understand.md#010-golden-rules--read-these-twice)) before Parts 6, 11 and 12.

## Related documents

- [`runbook.md`](../runbook.md) — what you open *after* you are live, when something breaks.
- [`38-deployment-aws-docker.md`](../implementation/38-deployment-aws-docker.md) — the
  design decisions (why EC2 and not Fargate, why Mumbai, the cost table).
- [`38a-github-actions-continuous-deployment.md`](../implementation/38a-github-actions-continuous-deployment.md)
  — the automation [Part 12](12-automatic-deploys.md) sets up.

You do not need any of them to follow this guide.
