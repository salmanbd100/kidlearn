# Part 7 — The website on Vercel

[← Previous](06-server.md) · [Guide index](README.md) · [Next →](08-backups-and-smoke-test.md)

> **Where you work:** 🌐 Vercel and Cloudflare. Steps 24–26.  
> **You finish with:** `https://kidlearn.net` served by Vercel and talking to your API.  
> **Before you start:** Step 23 — the API is healthy.

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

## Step 24 · 🌐 Create the Vercel project

**Cost:** $0 — Vercel Hobby plan. Hobby is for non-commercial use; if KidLearn
starts charging, move to Pro ($20 per member per month).

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

## Step 25 · 🌐 Project settings

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
> site is [Part 11](11-dev-environment.md) of this guide.

## Step 26 · 🌐 Connect `kidlearn.net` to Vercel

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

[← Previous](06-server.md) · [Guide index](README.md) · [Next →](08-backups-and-smoke-test.md)
