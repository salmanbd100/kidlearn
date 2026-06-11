# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`kidlearn` is a **pnpm + Turborepo monorepo** in an early skeleton state. Most of it is scaffolding — be aware that several pieces are wired structurally but not yet implemented.

## Commands

Run from the repo root (Turborepo fans tasks out to workspaces):

```bash
pnpm install          # install all workspaces (pnpm 9, lockfileVersion 9.0)
pnpm dev              # turbo run dev   — persistent, uncached
pnpm build            # turbo run build — caches .next/** and dist/**
pnpm lint             # biome check .        — lint + format-check + import sort (whole repo, no writes)
pnpm format           # biome check --write .— apply Biome lint fixes + formatting
pnpm typecheck        # turbo run typecheck  — per-package tsc --noEmit
```

**Linting/formatting is Biome** (`@biomejs/biome`, config in root `biome.json`), not ESLint or Prettier — there is no ESLint anywhere. Biome is a single binary that runs over the whole repo at the root (not fanned out via Turbo), so there are no per-package `lint`/`format` scripts. The CSS parser has `tailwindDirectives` enabled for Tailwind v4's `@theme` etc. Biome respects `.gitignore` (`vcs.useIgnoreFile`), so `dist/`, `.next/`, `node_modules/`, and `.turbo/` are excluded.

Per-app work runs inside the app directory, e.g. `apps/web`:

```bash
cd apps/web && pnpm dev        # next dev
cd apps/web && pnpm build      # next build
cd apps/web && pnpm typecheck  # tsc --noEmit (lint/format is repo-wide Biome from the root)
```

There is **no test runner configured** anywhere yet (`apps/server` still has the placeholder `test` script that exits 1).

## Layout & current state

- **`apps/web`** — Next.js 16 (App Router) + React 19 + Tailwind CSS v4. Only the create-next-app scaffold exists (`app/page.tsx`, `app/layout.tsx`, `app/globals.css`). Path alias `@/*` maps to the app root. Tailwind v4 is configured via `postcss.config.mjs` (no `tailwind.config`).
- **`apps/server`** — Express 5 + TypeScript (ESM, `"type": "module"`), run with `tsx` in dev, plus `cors` and `dotenv`. Entry is `src/index.ts`; `tsc` builds to `dist/`. Scripts: `dev` (`tsx watch`), `build` (`tsc`), `start` (`node dist/index.js`), `typecheck` (`tsc --noEmit`). Listens on `PORT` (default 4000); routes `GET /` and `GET /health`. Copy `.env.example` → `.env` for config.
- **`packages/{ui,types,config}`** — empty placeholder directories. They have **no `package.json`**, so they are not yet recognized as workspace packages and nothing imports them. Add a `package.json` (and wire it into consumers) before using one.

The workspace globs (`pnpm-workspace.yaml`) are `apps/*` and `packages/*`.

## When adding to the skeleton

- A new workspace package needs its own `package.json` with a `name` before pnpm/Turbo will pick it up; add matching `dev`/`build`/`typecheck` scripts so the root turbo tasks reach it. (No `lint` script needed — Biome lints the whole repo from the root.)
