# 38a — Custom Domain (`kidlearn.net`) & Same-Site Cookie Migration

> **Estimated effort:** 1–2 hours, most of it waiting on DNS/TLS propagation
> **Depends on:** 38
> **Requirement IDs:** spec §9 (deployment). No FR covers the domain — this is the upgrade path file 38 lists under _Out of Scope_ ("do when a domain exists").
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Move production off the platform-assigned hostnames onto `kidlearn.net` (web) and
`api.kidlearn.net` (API), and in doing so **delete the cross-origin cookie workaround** file 38
was forced into. Because both hosts share one registrable domain they are the *same site*, so
`src/lib/auth.ts` keeps its pinned `sameSite: "lax"` instead of being downgraded to
`SameSite=None`, and Safari/ITP third-party-cookie blocking stops being a risk to parent sign-in
altogether.

The point is not "we have a nicer URL". The point is that the session cookie stops being a
third-party cookie, which is the single most fragile part of the deployed auth flow.

## Context & Current State

Every URL in the codebase is already env-driven, so this file changes almost no code:

- `apps/server/src/lib/env.ts` Zod-parses `WEB_ORIGIN` and `BETTER_AUTH_URL` as `z.string().url()`
  and refuses to boot on a malformed value.
- `apps/server/src/app.ts` passes `origin: [env.WEB_ORIGIN]` to `cors({ credentials: true })` —
  exactly one origin, no wildcard.
- `apps/server/src/lib/auth.ts` sets `baseURL: env.BETTER_AUTH_URL`,
  `trustedOrigins: [env.WEB_ORIGIN]`, and pins
  `advanced.defaultCookieAttributes` to `{ httpOnly: true, sameSite: "lax", secure: NODE_ENV === "production" }`.
- `apps/web/lib/api-client.ts` reads `NEXT_PUBLIC_API_URL`, falling back to `http://localhost:4000`.

**Domain availability, verified against `whois.verisign-grs.com` on 2026-08-19:** `kidlearn.com`
is registered (created 1998-03-17, Network Solutions) and is not for sale cheaply; `kidlearn.org`,
`kidlearn.xyz` and `kidlearn.online` are taken; every `.com` modifier tried was taken
(`getkidlearn`, `mykidlearn`, `kidlearnapp`, `trykidlearn`, `joinkidlearn`, `playkidlearn`,
`kidlearners`, `kidlearnlab`, `kidlearnworld`, `kidlearn.kids`). `kidlearn.net` **was free**, as
were `kidlearn.club`, `.fun`, `.site` and `.space`.

`.net` was chosen because it is the only free option that keeps the brand string in
`apps/web/locales/{en,bn}/common.json` (`app.name`) **and** holds a flat ~$11–15/yr forever.
`.fun`/`.site`/`.space` are ~$2–3 in year one but renew at ~$20–30 — more than `.com` — and read
as less trustworthy to the parent, who is the paying audience. Fallback names if `kidlearn.net`
has since gone: see the appendix.

> **Check availability again before starting.** The verification above is a point-in-time
> snapshot and nothing is reserved.

## Detailed Requirements

1. **Registration.** Buy `kidlearn.net` at **Cloudflare Registrar** (sold at wholesale cost, no
   renewal markup, WHOIS privacy included) or **Porkbun**. Both take a Bangladeshi card. Enable
   auto-renew and registrar lock. Do not buy the bundled email/SSL upsells — Vercel and Render
   both issue TLS free.

2. **DNS.** Apex `kidlearn.net` → Vercel (Vercel will dictate either an `A` record to its anycast
   IP or an apex `CNAME`/`ALIAS`; follow what its dashboard shows for the zone). `www` → redirect
   to apex, configured in Vercel's Domains tab rather than as a second deployment target.
   `api` → `CNAME` to the Render service host, with `api.kidlearn.net` added as a custom domain on
   the Render service so it provisions a certificate for that name. Wait for TLS to be issued on
   **both** names before touching env vars — a half-provisioned domain looks identical to a CORS
   bug.

3. **Same-site cookie migration — the actual payoff.** File 38 requirement 4 mandates
   `SameSite=None; Secure` for the cross-origin Vercel↔Render split. Once both hosts are under
   `kidlearn.net` that is no longer required: leave `advanced.defaultCookieAttributes` in
   `src/lib/auth.ts` at `sameSite: "lax"` exactly as it stands today.
   - If file 38 shipped a `SameSite=None` override, **remove it** in this change and say so in the
     commit message.
   - Do **not** reach for better-auth's `advanced.crossSubDomainCookies`. The API both sets and
     receives its own host-scoped cookie; widening the cookie's `Domain` to `.kidlearn.net` would
     expose it to every future subdomain for no benefit.
   - `app.set("trust proxy", 1)` from file 38 is still needed — Render still terminates TLS.

4. **Production environment variables.** Change on the hosts only; the committed defaults stay
   localhost.

   | Var | App | New production value |
   |---|---|---|
   | `WEB_ORIGIN` | server (Render) | `https://kidlearn.net` |
   | `BETTER_AUTH_URL` | server (Render) | `https://api.kidlearn.net` |
   | `NEXT_PUBLIC_API_URL` | web (Vercel) | `https://api.kidlearn.net` |
   | `NEXT_PUBLIC_SITE_URL` | web (Vercel) | `https://kidlearn.net` (new — see requirement 6) |

   Order matters: set `WEB_ORIGIN`/`BETTER_AUTH_URL` and redeploy the server **before** pointing
   the web app at the new API host, or the first request from the new origin is CORS-rejected.

5. **Google OAuth client** (the client created in file 09's `.env.example` step 3). Add — do not
   replace, so the old hostnames keep working through the cutover:
   - Authorized JavaScript origins: `https://kidlearn.net`
   - Authorized redirect URIs: `https://api.kidlearn.net/api/auth/callback/google`

   Prune the `*.vercel.app` / `*.onrender.com` entries only after the smoke test below passes.

6. **`apps/web` canonical URL.** `app/layout.tsx` exports `metadata` with only `title` and
   `description`. Add `metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000")`
   plus `openGraph: { siteName, url: "/" }`, so any future OG image or canonical link resolves
   absolutely instead of warning at build. Add `NEXT_PUBLIC_SITE_URL=http://localhost:3000` to
   `apps/web/.env.local.example` with a comment naming the production value.

   Fix the casing mismatch while in this file: `title` is `"kidlearn"` while `locales/en/common.json`
   `app.name` is `"KidLearn"`. Set it to `"KidLearn"`. Do **not** attempt a per-locale metadata
   title — the locale lives in the `LOCALE_COOKIE_NAME` cookie read in `layout.tsx`, and doing it
   properly is separate work.

   Per `apps/web/AGENTS.md`, read the Metadata API docs under `node_modules/next/dist/docs/`
   before editing rather than assuming the pre-16 shape.

7. **Documentation.** Annotate `apps/server/.env.example` (`WEB_ORIGIN`, `BETTER_AUTH_URL`, and
   the Google-console step-4 comment block) and `apps/web/.env.local.example` with the production
   values, matching each file's existing commented-explanation style. Record the domain and the
   subdomain split in `document/project-requirement-details.md` §9, which currently names no
   domain. Update `document/runbook.md` (written in file 38) with the DNS records and the registrar.

## Steps

1. Re-check availability, register `kidlearn.net`, enable auto-renew + registrar lock. (~15 min)
2. Add `kidlearn.net` + `www` in Vercel, `api.kidlearn.net` on Render, create the DNS records;
   wait for both certificates. (~30 min, mostly waiting)
3. Set `WEB_ORIGIN` and `BETTER_AUTH_URL` on Render, redeploy, `curl https://api.kidlearn.net/health`. (~10 min)
4. Set `NEXT_PUBLIC_API_URL` + `NEXT_PUBLIC_SITE_URL` on Vercel, redeploy. (~10 min)
5. Add the production origin + redirect URI to the Google OAuth client. (~10 min)
6. Repo edits: requirements 3, 6 and 7. `pnpm lint && pnpm typecheck && pnpm --filter server test`. (~20 min)
7. Smoke test on a real phone, prune the old OAuth entries, update the tracker. (~20 min)

## Acceptance Criteria

- [ ] `https://kidlearn.net` serves the app; `https://www.kidlearn.net` redirects to the apex; both are valid TLS.
- [ ] `https://api.kidlearn.net/health` returns the `{ data: { status: "ok" } }` envelope.
- [ ] A parent signs in with Google on `https://kidlearn.net` end-to-end, and the session **survives a reload** — the decisive check that the cookie is being sent.
- [ ] In devtools the session cookie is `Secure; HttpOnly; SameSite=Lax` — **not** `SameSite=None`. `src/lib/auth.ts` contains no `SameSite=None` override.
- [ ] The same sign-in works in **Safari on iOS** with cross-site tracking prevention on — this is the case that fails under file 38's cross-origin arrangement and is the reason this file exists.
- [ ] A request with a forged `Origin` header gets no CORS allow header (file-08 lockdown intact, now against the new origin).
- [ ] No `onrender.com` or `vercel.app` string appears in the shipped web bundle (network tab / `grep` the build output).
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter server test` pass; `metadataBase` builds with the localhost fallback when `NEXT_PUBLIC_SITE_URL` is unset, so `pnpm dev` is unaffected.
- [ ] Page source shows `<title>KidLearn</title>` and an `og:url` resolving to `https://kidlearn.net`.
- [ ] `.env.example`, `.env.local.example`, spec §9 and `runbook.md` all name the new hosts.

## Out of Scope

- **`.com.bd`** — BDT ~800/2yr is cheap, but BTCL's manual process is slow and a ccTLD narrows the product to the domestic market, which spec §2 ("international-standard") does not want.
- Email on the domain (`hello@kidlearn.net`) — needs an MX provider; no FR requires it.
- Localised/per-route metadata, `sitemap.ts`, `robots.ts`, OG image generation — SEO work, post-MVP.
- Moving DNS authority to Cloudflare proxying (orange-cloud) in front of Vercel — unnecessary and it complicates Vercel's certificate issuance.
- Retiring the platform hostnames as deployment targets; preview deploys keep their `*.vercel.app` URLs.

## Appendix — fallback names, all verified free on 2026-08-19

If `kidlearn.net` is gone, these `.com`s were unregistered and standard-priced (~$10/yr). A `.com`
here costs a rebrand: `app.name` in both locale files, plus any brand copy and metadata.

| Domain | Meaning / note |
|---|---|
| `ghurikids.com` | ঘুড়ি, kite — playful, pronounceable in English and Bangla |
| `khelashikhi.com` | খেলা শিখি, "play, I learn" — restates the existing tagline *শেখো, খেলো, বড় হও* |
| `okkhorkids.com` | অক্ষর, letter — on the nose for ages 3–6 |
| `tuntunia.com` | from তুনতুনি, the tailorbird of Bengali folk tales; the only decent single-word option left |
| `shishulearn.com` | শিশু, child — keeps "learn" from the current brand |
| `bornomalakids.com` | বর্ণমালা, alphabet |
| `shikhaghor.com` | শিক্ষাঘর, house of learning |

Also free at that date: `rupkathakids.com`, `mishtikids.com`, `doyelkids.com`, `chorakids.com`,
`piplikids.com`, `lernikids.com`, `kidopath.com`, `tinyklub.com`, `learnkidly.com`,
`kidlearnbd.com`, `kidlearnzone.com`.

`kidlearn.app`, `kidlearn.co` and `kidlearn.dev` could **not** be verified — those registries were
unreachable at the time of checking. Check them before settling for a fallback; `kidlearn.app`
would keep the brand intact and `.app` is HSTS-preloaded, which suits a product handling
parent sign-in.
