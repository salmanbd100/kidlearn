# Part 10 — Living with it: the release life cycle

[← Previous](09-paperwork.md) · [Guide index](README.md) · [Next →](11-dev-environment.md)

> **Where you work:** Read now, use on every release.  
> **You finish with:** how to ship, migrate safely, roll back, and what keeps running without you.  
> **Before you start:** Production is live.

Everything above happens **once**. This part is what you do every week.

## 10.1 · Ship a new version

```
 💻 feature branch ──PR──► dev ──(gates ✅, merge)──► PR dev → main ──(gates ✅, merge)
                                                                   │
                     ┌─────────────────────────────────────────────┴───────────────┐
                     ▼ AUTOMATIC                                                    ▼ BY HAND
          Vercel builds main → kidlearn.net                 💻 Step 16 on main → new SHA
          (2–3 minutes, watch Deployments)                  🖥️ deploy.sh prod <new SHA> [--migrate]
```

1. **Website:** merge the `dev → main` pull request. Vercel deploys by itself.
2. **API images:** 💻 `git checkout main && git pull`, then run
   [Step 16](05-aws-storage-secrets-images.md) again. It ends with
   `IMAGE TAG = b2c3d4e` — that is the new SHA.
3. **Only if `deploy/` files changed in this release:** 🖥️ repeat
   [Step 20c](06-server.md) now, so the server runs the new scripts.
4. **API deploy:** 🖥️ as root, with the SHA from step 2:

   ```bash
   /opt/kidlearn/deploy/deploy.sh prod b2c3d4e
   ```

   Add ` --migrate` at the end if the release adds folders under
   `packages/db/prisma/migrations/` (see below how to tell). It applies them
   before restarting the API.
5. ✅ The deploy ends `deploy complete at b2c3d4e`; then 💻
   `curl -s https://api.kidlearn.net/health` prints `{"data":{"status":"ok",…}}`.
   Click through the site.

**Which half goes first?** Vercel finishes before you have built the images, so
for a few minutes the **new website talks to the old API**. That is fine as long
as every change keeps working against the version before it — the same rule as
migrations, below.

**How to know whether a release has migrations** — 💻 in the repo, with the
SHA production runs now (`cat /opt/kidlearn/prod/last-good-tag` on the server,
e.g. `a1b2c3d`) and the new one:

```bash
git diff --name-only a1b2c3d b2c3d4e -- packages/db/prisma/migrations/
# prints anything → use --migrate · prints nothing → leave it off
```

## 10.2 · Database changes safely — "expand, then contract"

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
[`runbook.md` §3](../runbook.md).

## 10.3 · Undo a bad release

Undo **both** halves — they are separate systems:

```
 API      🖥️ /opt/kidlearn/deploy/deploy.sh prod a1b2c3d     ← the previous SHA
          (no --migrate: migrations only go forward)
 Website  🌐 Vercel → project → Deployments → the last good one → ⋯ → Instant Rollback
```

**Finding the previous SHA:** `cat /opt/kidlearn/prod/last-good-tag` *before*
you deploy the new one, your values sheet, the ECR console (images sorted by
date), or — after a failed deploy — the `ROLL BACK WITH:` line `deploy.sh`
printed. ECR keeps the newest 10 images per repository, **dev's builds
included**; anything older has to be rebuilt from its commit before you can
roll back to it.

## 10.4 · What keeps running without you

| What | How often | Where to look if it stops |
|---|---|---|
| HTTPS renewal for `api.kidlearn.net` | ~every 60 days | 🖥️ `docker logs --tail 50 kidlearn-caddy` |
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

## 10.5 · Where this is going — automatic API deploys

Today the API half of a release is steps 2–4 above, by hand. [Part 12](12-automatic-deploys.md) (file 38a)
turns them into a GitHub Actions job that runs the **same `deploy.sh`** — which
is exactly why you do it by hand first. Until [Part 12](12-automatic-deploys.md) is done, keep the access
key from [Step 3d](02-accounts.md): it is what pushes images.

---

[← Previous](09-paperwork.md) · [Guide index](README.md) · [Next →](11-dev-environment.md)
