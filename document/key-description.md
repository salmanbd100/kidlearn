# Next-Gen International Educational Platform for Early Learners

---

## 1. Executive Summary

The goal of this project is to design and develop an international-standard, web-based educational platform tailored for early childhood education (initially targeting **Nursery and Kindergarten students, ages 3–5**). The platform will deliver highly engaging, gamified, and age-appropriate learning experiences designed to be consumed in focused **30-to-60-minute daily sessions**.

The project will be built using a **Monorepo architecture** allowing the entire system (Frontend, Backend, Shared Packages) to run with a single command. It will feature a cost-effective, automated multimedia content pipeline powered by generative AI (video, audio, graphics, and interactive quizzes) across multiple languages, optimized to run entirely on **free-tier hosting providers** for its initial launch.

---

## 2. Core Project Pillars

### A. Age-Appropriate User Experience (UX/UI)

- **Visual-First & Voice-Guided:** Minimal text interface. Navigation relies on intuitive visual cues, micro-animations, and a friendly AI-generated voice companion/mascot to guide the child.
- **Chunked Learning Flow:** A rigid, daily 30–60 minute learning journey broken into short micro-activities (e.g., 5-minute video, 10-minute puzzle, 5-minute reward ceremony) to prevent screen fatigue.
- **Dual-Portal System:**
  - **Student Portal:** Completely immersive, distraction-free gamified learning environment.
  - **Parent Dashboard:** Secured behind a parental gate (pin-code) for tracking analytics, managing multi-language settings, and monitoring daily time limits.

### B. Dynamic AI-Powered Content Pipeline

We will utilize an automated content generation framework using state-of-the-art AI tools to build our curriculum:

| Content Type                 | Tools                                              |
| ---------------------------- | -------------------------------------------------- |
| **Graphics & Visual Assets** | Midjourney, Gemini 3 Flash Image / Nano Banana Pro |
| **Videos & Animation**       | Google Veo, Runway Gen-3, Mootion                  |
| **Audio & Voiceovers**       | ElevenLabs (multi-language dubbing)                |
| **Interactive Quizzes**      | LLMs → JSON payloads (stored as Postgres `JSONB`) → dynamic frontend modules |

> Quiz types include: drag-and-drop matching, balloon-popping, and tracing activities.

### C. Internationalization & Scalability

- **Multi-Language Architecture:** Built natively with internationalization (`i18next` / multi-region backend databases) allowing instant toggling of language assets — audio, subtitles, and localized visual cues.
- **Modular Grade Scaling:** The database and system architecture must be built symmetrically, allowing rollout for higher classes (Grade 1, Grade 2, etc.) step-by-step without altering the base code.

---

## 3. Technical Stack & Monorepo Architecture

To manage the codebase cleanly and run everything under a single command, the platform will be structured as a Monorepo using **Turborepo** or **npm/yarn workspaces**.

### Monorepo Structure

```
my-app/
├── apps/
│   ├── web/        # Next.js / React Frontend
│   └── server/     # Node.js (Express) Backend API
├── packages/
│   ├── ui/         # Shared React component library
│   ├── db/         # Prisma schema + client (Supabase/PostgreSQL)
│   └── config/     # Shared ESLint, TypeScript & Tailwind configs
├── package.json
└── turbo.json
```

### Stack Summary

| Layer                   | Technology                                               |
| ----------------------- | -------------------------------------------------------- |
| **Monorepo Tooling**    | Turborepo + npm/pnpm workspaces                          |
| **Frontend**            | Next.js or React (responsive for tablets & desktops)     |
| **Backend**             | Node.js (Express) with TypeScript                        |
| **Database**            | Supabase (PostgreSQL, Free Tier) — single source of truth; relational data + `JSONB` for flexible quiz schemas |
| **ORM / Migrations**    | Prisma (type-safe client + schema migrations)            |

---

## 4. Zero-Cost Free Deployment Strategy

For the MVP stage, the app will be optimized for the following free hosting setups:

| Service                     | Platform                               |
| --------------------------- | -------------------------------------- |
| **Frontend** (`apps/web`)   | Vercel or Netlify (Global CDN)         |
| **Backend** (`apps/server`) | Render, Railway, or Fly.io             |
| **Database**                | Supabase free cluster (PostgreSQL)     |
| **Media Assets**            | Cloudinary (Free Tier) or Uploadthing  |

> Cloudinary / Uploadthing will host and stream AI-generated images, audio files, and short educational video snippets.

---

## 5. Claude's Role as AI Co-Pilot

As the primary architectural and creative assistant on this project, Claude will help with the following tasks:

1. **Monorepo Setup** — Configuring `package.json` scripts, Turborepo pipelines, and root-level orchestrations so `npm run dev` starts both the Express server and the Next.js frontend simultaneously.

2. **Express API & Database Schema** — Designing the Prisma schema and migrations, and writing clean, TypeScript-based Express routes for tracking kid progress, saving quiz responses, and fetching localized audio paths.

3. **Prompt Engineering for Content Generation** — Crafting hyper-specific, production-ready prompts for image generators (Midjourney/Gemini) and video models (Veo/Runway) to keep characters completely consistent.

4. **JSON Curriculum Design** — Generating structured JSON code templates for interactive logic puzzles, counting games, and phonetic quizzes that the frontend can dynamically render.

5. **UX/UI Wireframing** — Brainstorming step-by-step layout guides for kid-friendly dashboards, parent settings, and onboarding flows.

---

_Document version: Initial Draft_
