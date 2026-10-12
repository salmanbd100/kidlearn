# KidLearn

[![CI](https://github.com/salmanbd100/kidlearn/actions/workflows/ci.yml/badge.svg)](https://github.com/salmanbd100/kidlearn/actions/workflows/ci.yml)

> An AI-powered early education platform built for children aged 3–6 — and, honestly, built for my two daughters.

---

## The Story Behind It

I am a developer and a father. Watching my daughters learn, I noticed that the best educational apps were either too expensive, not available in our language (Bangla), or built without real care for how young children actually learn. So I decided to build one myself.

**KidLearn** ("Learning Adventure") is a safe, gamified, voice-guided web platform for early learners (Nursery, KG-1, KG-2). It delivers bite-sized lessons across Language, Mathematics, Science, and Social Skills — with animated characters, interactive activities, stories, and quizzes — all designed for a focused 30-to-60 minute daily session.

Every design decision traces back to two real users: my daughters.

---

## What It Does

| Pillar | Description |
|---|---|
| **Visual-first, voice-guided** | Children who cannot yet read can navigate and learn independently — every instruction is spoken aloud |
| **Chunked learning flow** | Each lesson follows the same five-step structure: Introduction → Video → Activity → Quiz → Reward, so children always know what comes next |
| **Dual portal** | A distraction-free **Student Portal** (no ads, no external links, no social features) and a **Parent Dashboard** for progress reports and screen-time controls, with an **Admin CMS** behind them and a public **homepage and guides** in front |
| **AI content pipeline** | Lessons, stories, quizzes, narration audio, and illustrations are AI-generated at scale — but every piece goes through a mandatory human admin review before any child sees it |
| **Multilingual from day one** | English and Bangla at launch; the i18n architecture is data-driven, so Arabic, Hindi, and Spanish roll out as asset sets, not code changes |
| **Gamification** | Stars, coins, badges, character unlocks, and daily learning streaks — all earned through learning, never purchased |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Monorepo | Turborepo + pnpm workspaces |
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS v4 |
| Backend | Express 5 + TypeScript (ESM) |
| Database | PostgreSQL — Supabase in deployment, a local Docker container for development. Relational data + `JSONB` for quiz/activity schemas |
| ORM | Prisma (`packages/db`) |
| API docs | OpenAPI 3.0 generated from Zod schemas → Scalar API reference at [`/docs`](http://localhost:4000/docs) |
| Validation | Zod — one schema per contract, shared between the API and the web app (`packages/types`) |
| Testing | Vitest — Supertest for API routes, React Testing Library for components |
| i18n | i18next on frontend + per-language asset refs in DB |
| AI — text & quizzes | Gemini text models (free tier) → typed JSON payloads validated against shared schemas |
| AI — audio | Google Cloud Text-to-Speech (Standard voices, one per language) |
| AI — images | Gemini image models (free tier) |
| AI — video | Google Veo / Runway Gen-3 |
| Auth | better-auth — Google sign-in for parents, password for seeded admins |
| Linting & formatting | Biome (repo-wide, replaces ESLint + Prettier) |
| Hosting | Vercel (web) + one AWS EC2 box running the API in Docker behind Caddy |

### Repo layout

```
kidlearn/
├── apps/
│   ├── web/        # Next.js — public homepage + guides, student portal, parent dashboard, admin CMS
│   └── server/     # Express API — progress, quiz responses, AI pipeline
│       └── src/openapi/   # OpenAPI document served at /docs
├── packages/
│   ├── ui/         # Theme-agnostic React primitives — web-only by design (mobile-app-plan.md §4.2)
│   ├── types/      # Shared Zod schemas — activity/quiz payloads + API contracts (src/api/)
│   ├── db/         # Prisma schema + client (PostgreSQL)
│   ├── i18n/       # en/bn UI strings — one copy for web and mobile
│   ├── tokens/     # Design-token values — tokens.css is generated from them
│   └── config/     # Shared TS configs
├── deploy/         # Production scripts (deploy, bootstrap, backup, weekly reports) + Caddy edge
├── docker/         # Local Postgres init scripts
└── document/       # Requirements, design, standards, implementation specs, deploy guides
```

---

## Running Locally

### Prerequisites

- [Node.js](https://nodejs.org) 22 — the major in `.nvmrc` (`nvm use` picks it up); pnpm warns on any other, from `engines` in `package.json`
- [pnpm](https://pnpm.io) 9+ — install with `npm install -g pnpm`
- [Docker Desktop](https://docs.docker.com/desktop/) — runs the local PostgreSQL. You can point at a hosted Supabase instance instead, but Docker is the shortest path to a working checkout.

### 1. Clone and install

```bash
git clone https://github.com/salmanbd100/kidlearn.git
cd kidlearn
pnpm install
```

### 2. Start the database

```bash
docker compose up -d postgres
docker compose ps          # wait for STATUS = (healthy)
```

`docker-compose.yml` runs `postgres:16-alpine` on `localhost:5432` with a named volume, so your data survives restarts. On first boot it also creates `kidlearn_test` alongside `kidlearn` — the database the Vitest suite expects.

If `5432` is already taken on your machine, do not edit the committed compose file — create a gitignored `docker-compose.override.yml`, which Compose loads automatically on top of it:

```yaml
services:
  postgres:
    ports: !override
      - "127.0.0.1:5433:5432"
```

`!override` is load-bearing: Compose merges sequences by default, so a plain `ports:` list adds the new mapping while keeping `5432` — binding the container to both and shadowing whatever already held that port. Whichever host port you land on has to appear in **all three** connection strings in step 3.

### 3. Configure environment

```bash
cp packages/db/.env.example packages/db/.env
cp apps/server/.env.example apps/server/.env
```

**`packages/db/.env`** — Prisma reads this for migrations and Studio. Point both variables at the container. Drop the `?pgbouncer=true` suffix from the example: that flag is for the Supabase pooler, and there is no pooler in front of a local container, so the runtime/migration split collapses to one URL.

```
DATABASE_URL="postgresql://postgres:password@localhost:5432/kidlearn"
DIRECT_URL="postgresql://postgres:password@localhost:5432/kidlearn"
```

**`apps/server/.env`** — the API runs as its own process and needs the connection string in its own environment. Every variable here is validated by `src/config/env.ts` at boot; a missing or malformed value stops the process and names the offending field.

```
DATABASE_URL="postgresql://postgres:password@localhost:5432/kidlearn"
BETTER_AUTH_SECRET=      # generate: openssl rand -base64 32  (min 32 chars)
GOOGLE_CLIENT_ID=        # see .env.example for the Google Cloud console steps
GOOGLE_CLIENT_SECRET=
```

The two Google variables reject blank values but are not otherwise checked at boot, so placeholders like `local-dev-client-id` are enough to get the server running. Everything except Google sign-in works with them — the routes behind `requireParent` return `401` until you supply real credentials.

**`apps/web/.env.local`** — optional, and there is no error at boot to tell you it is missing. Copy `apps/web/.env.local.example` if you want it.

```
MEDIA_ASSET_HOSTS=https://cdn.kidlearn.test
```

`next.config.ts` turns this comma-separated list of origins into `images.remotePatterns`, and `next/image` **throws** on any host not listed — an `Invalid src prop` error that takes down the whole screen rather than showing one broken image. The seeded activity and quiz payloads come from the canonical fixtures in `packages/types/src/__fixtures__/`, which reference `https://cdn.kidlearn.test`, so without this variable the first lesson containing a drag-and-drop step crashes. Asset urls inside a payload cannot dodge this the way `MediaAsset.url` can: `AssetRefSchema` requires an absolute `https://` url (`packages/types/src/primitives.ts`), so a relative `/dev/…` path is invalid content.

Listing that host stops the crash but does not produce pictures — `.test` is a reserved TLD that never resolves, so each image logs an optimiser warning and renders as a gap. The activities stay playable, because every item and drop target also carries a localised text label. Real artwork arrives by admin upload (file 33) and the AI pipeline (file 36); attaching it is a data change, which is the reason this host list is configuration rather than code.

**Keep all three URLs on the same port.** The server connects with its own `DATABASE_URL` from `apps/server/.env`; the Prisma CLI uses `DIRECT_URL` from `packages/db/.env`. Letting those diverge produces the least helpful failure in the project: `pnpm db:migrate` and `prisma migrate status` report a healthy, fully-migrated database while every request the API makes dies with `PrismaClientInitializationError`, because the CLI and the server are talking to different servers. If sign-in 500s on a checkout where migrations pass, check the ports before anything else.

### 4. Migrate and seed

```bash
pnpm db:migrate                        # create the schema
pnpm --filter @kidlearn/db db:seed     # dev parent, child profile, sample curriculum
```

The seed upserts on fixed ids, so re-running it is safe.

To use the admin CMS, create an admin — there is no sign-up page, so this script is the only way one exists ([`admin-account-guide.md`](document/admin-account-guide.md)):

```bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-local-password' ADMIN_NAME='Your Name' \
  pnpm --filter server seed:admin
```

Then sign in from the homepage (**Admin sign-in**, or `http://localhost:3000/?signin=admin`). Admin sessions last 12 hours and do not extend with activity.

### 5. Run everything

```bash
pnpm dev
```

Turborepo starts all apps in parallel:

| App | URL |
|---|---|
| Web (Next.js) — homepage | http://localhost:3000 |
| Guides (parents / admins / engineering) | http://localhost:3000/guide/parents |
| API (Express) | http://localhost:4000 |
| **API docs (Scalar)** | **http://localhost:4000/docs** |
| OpenAPI spec (raw JSON) | http://localhost:4000/docs.json |
| Health check | http://localhost:4000/health |

**Start at [`/docs`](http://localhost:4000/docs) before writing any client code against the API.** It documents every endpoint — request and response schemas, every status code, and which of the session / consent / active-child gates each route sits behind. Because the reference is served from the same origin the session cookie belongs to, signing in once at [`/api/auth/google`](http://localhost:4000/api/auth/google) makes **Send** work on every authenticated endpoint, with no token to copy around.

The page is generated from the code at boot, not maintained by hand: request schemas are the same Zod objects the routes validate with, and response schemas are shared with the web app via `packages/types/src/api/`. A test fails if an endpoint is missing from it. It is always available outside production; in production it requires `ENABLE_API_DOCS=true`.

### Run a single app

```bash
cd apps/web && pnpm dev      # Next.js only
cd apps/server && pnpm dev   # Express only (with hot reload)
```

### Other commands

```bash
pnpm build        # Production build of every app
pnpm lint         # Lint + format check + import sort (Biome, no writes)
pnpm format       # Apply Biome fixes
pnpm typecheck    # tsc --noEmit per package
pnpm test         # Vitest across every package
pnpm test:coverage # ...with a coverage report per package (what CI runs)
pnpm --filter server test:db  # *.db.test.ts against Postgres (needs docker compose up -d postgres)
pnpm db:generate  # Regenerate Prisma client
pnpm db:migrate   # Run DB migrations
pnpm db:studio    # Open Prisma Studio (DB browser)

pnpm --filter @kidlearn/db db:seed   # Reseed dev fixtures (idempotent)

# Write the OpenAPI spec to apps/server/openapi.json — for Postman or a client
# generator. The server already serves it live at /docs.json, so this is optional.
pnpm --filter server openapi:write
```

### Managing the database container

```bash
docker compose up -d postgres   # Start it (safe to re-run — a no-op if already up)
docker compose stop             # Pause it, keep the data
docker compose start            # Resume
docker compose down             # Remove the container, keep the data (named volume)
docker compose down -v          # Wipe the data — re-run step 4 afterwards
docker compose logs -f postgres
docker compose ps               # Which host port it actually landed on
```

`docker compose ps` is the answer to "is the database even running" — it prints the live host→container port mapping, which is what the connection strings have to match. A `PrismaClientInitializationError` from the API when that mapping and `apps/server/.env` disagree looks identical to the database being down.

Port conflicts belong in `docker-compose.override.yml` — see step 2.

### CI

`.github/workflows/ci.yml` runs `pnpm lint`, `pnpm build`, `pnpm typecheck`, `pnpm test:coverage` and `pnpm --filter server test:db` as one `gates` job on every pull request and every push to `main` or `dev`. It needs no secrets; the database tests run against a `postgres:16-alpine` service container, and every other step opens no database connection. Coverage is reported — in the run summary and as a downloadable artifact — and deliberately not gated on a threshold.

### Production build

```bash
# Web
cd apps/web && pnpm build && pnpm start

# Server
cd apps/server && pnpm build && pnpm start   # compiles to dist/, runs node dist/index.js
```

### Deployment

The web app deploys to Vercel; the API, the weekly-report job and backups run on one AWS EC2 box in Docker behind Caddy (`deploy/`, `apps/*/Dockerfile`). Start with [`go-live-guide.md`](document/go-live-guide.md) for a first deploy, [`deployment-walkthrough.md`](document/deployment-walkthrough.md) for the detail, and [`runbook.md`](document/runbook.md) for day-two operations.

---

## MVP Scope

The first release targets **ages 3–5** (Nursery + KG-1) in **English and Bangla**:

- Alphabet (A–Z), Numbers (1–20), Shapes, Colors
- 20 starter stories
- All four interactive activity types (drag-drop, trace, match, puzzle)
- All four quiz formats (multiple choice, match-pair, drag-answer, picture selection)
- Parent dashboard with weekly reports and screen-time controls
- AI content pipeline with human review queue

---

## Roadmap

| Phase | Scope |
|---|---|
| **Phase 1 (MVP)** | Ages 3–5, English + Bangla, core curriculum, AI pipeline |
| **Phase 2** | KG-2, Arabic, teacher role + virtual classrooms, Space World subjects |
| **Phase 3** | Hindi + Spanish, Grade 1+, school administration |

---

## Project Docs

Detailed specs live in `document/`:

- [`project-requirement-details.md`](document/project-requirement-details.md) — full functional + non-functional requirements
- [`design.md`](document/design.md) — UI/UX design decisions
- [`database-design.md`](document/database-design.md) — full data model
- [`engineering-standards.md`](document/engineering-standards.md) — coding standards index, routing to:
  - [`standards/general.md`](document/standards/general.md) — applies to every task (layout, TypeScript, imports, naming, testing, GitHub flow)
  - [`standards/frontend.md`](document/standards/frontend.md) — `packages/ui`, `apps/web`, React/Next.js
  - [`standards/backend.md`](document/standards/backend.md) — `apps/server`, Prisma, `packages/db`, API design, and the OpenAPI rules every new endpoint follows (§7)
- [`user-journey-manual.md`](document/user-journey-manual.md) — end-to-end user flows
- [`admin-account-guide.md`](document/admin-account-guide.md) — creating and using an admin account
- [`go-live-guide.md`](document/go-live-guide.md), [`deployment-walkthrough.md`](document/deployment-walkthrough.md), [`runbook.md`](document/runbook.md) — deploying and operating production
- [`mobile-app-plan.md`](document/mobile-app-plan.md) — what is shared between web and the planned mobile app
- [`implementation/`](document/implementation/) — one spec per piece of work, tracked in `00-progress-tracker.md`

The running app also carries short, translated guides for parents, admins and engineers at `/guide/parents`, `/guide/admins` and `/guide/engineering`.

---

*Built with love — for two little girls who deserve the best start.*
