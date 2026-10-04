# apps/web

The kidlearn web app: the Student Portal, the Parent Dashboard and the admin CMS, in one Next.js 16 (App Router) project. Read [`AGENTS.md`](./AGENTS.md) before writing Next.js code — v16 differs from what you may remember.

## Running it

From the repository root:

```bash
pnpm dev          # web on :3000 and the API on :4000, together
pnpm --filter web test
pnpm --filter web typecheck
```

Copy `.env.local.example` to `.env.local` first. The API it talks to is `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`); the session cookie belongs to that origin, which is why screens fetch in the browser (see `document/standards/frontend.md §3`).

## Layout

```
app/        routing only — the (student), (parent) and (admin) route groups, their
            layouts, guards and screens
features/   one directory per domain, named after the server module
shared/     api/ components/ hooks/ lib/ — what a second feature has needed
locales/    i18next bundles, English and Bangla
```

The rules behind the layout — where a file goes, no barrel files, `@/*` imports, semantic tokens only, every string through i18next — are in [`document/standards/frontend.md`](../../document/standards/frontend.md) and [`document/design.md`](../../document/design.md).
