# KidLearn

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
| **Dual portal** | A distraction-free **Student Portal** (no ads, no external links, no social features) and a PIN-gated **Parent Dashboard** for progress reports and screen-time controls |
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
| Database | Supabase (PostgreSQL) — relational data + `JSONB` for quiz/activity schemas |
| ORM | Prisma (`packages/db`) |
| i18n | i18next on frontend + per-language asset refs in DB |
| AI — text & quizzes | LLMs → typed JSON payloads validated against shared schemas |
| AI — audio | ElevenLabs (multi-language narration) |
| AI — images | Midjourney / Gemini image models |
| AI — video | Google Veo / Runway Gen-3 |
| Linting & formatting | Biome (repo-wide, replaces ESLint + Prettier) |

### Repo layout

```
kidlearn/
├── apps/
│   ├── web/        # Next.js — student portal, parent dashboard, admin CMS
│   └── server/     # Express API — progress, quiz responses, AI pipeline
├── packages/
│   ├── ui/         # Shared React components
│   ├── types/      # Shared TypeScript types + JSON schemas
│   ├── db/         # Prisma schema + client (Supabase/PostgreSQL)
│   └── config/     # Shared TS configs
└── document/       # Full requirements spec, design decisions, DB design
```

---

## Running Locally

### Prerequisites

- [Node.js](https://nodejs.org) 22+
- [pnpm](https://pnpm.io) 9+ — install with `npm install -g pnpm`

### 1. Clone and install

```bash
git clone https://github.com/your-username/kidlearn.git
cd kidlearn
pnpm install
```

### 2. Configure environment

```bash
cp apps/server/.env.example apps/server/.env
```

Open `apps/server/.env` and fill in your values (database URL, AI API keys, etc.).

### 3. Run everything

```bash
pnpm dev
```

Turborepo starts all apps in parallel:

| App | URL |
|---|---|
| Web (Next.js) | http://localhost:3000 |
| API (Express) | http://localhost:4000 |
| Health check | http://localhost:4000/health |

### Run a single app

```bash
cd apps/web && pnpm dev      # Next.js only
cd apps/server && pnpm dev   # Express only (with hot reload)
```

### Other commands

```bash
pnpm build        # Production build of every app
pnpm lint         # Lint + typecheck every app (Biome)
pnpm db:generate  # Regenerate Prisma client
pnpm db:migrate   # Run DB migrations
pnpm db:studio    # Open Prisma Studio (DB browser)
```

### Production build

```bash
# Web
cd apps/web && pnpm build && pnpm start

# Server
cd apps/server && pnpm build && pnpm start   # compiles to dist/, runs node dist/index.js
```

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
- [`engineering-standards.md`](document/engineering-standards.md) — coding standards
- [`user-journey-manual.md`](document/user-journey-manual.md) — end-to-end user flows

---

*Built with love — for two little girls who deserve the best start.*
