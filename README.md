# kidlearn

A pnpm + [Turborepo](https://turbo.build) monorepo.

## Structure

```
apps/
  web/      Next.js 16 (App Router) + React 19 + Tailwind CSS v4
  server/   Express 5 + TypeScript API
packages/
  ui/ types/ config/   (placeholders — not wired up yet)
```

## Prerequisites

- [Node.js](https://nodejs.org) 22+
- [pnpm](https://pnpm.io) 9+ (`npm install -g pnpm`)

## Setup

```bash
pnpm install
```

Then create the server's env file:

```bash
cp apps/server/.env.example apps/server/.env
```

## Running

### Everything at once

From the repo root, Turborepo runs every app's `dev` task in parallel:

```bash
pnpm dev
```

- Web → http://localhost:3000
- Server → http://localhost:4000 (e.g. http://localhost:4000/health)

### A single app

```bash
cd apps/web && pnpm dev      # Next.js dev server
cd apps/server && pnpm dev   # Express with hot reload (tsx watch)
```

## Other commands

Run from the repo root (fans out to all apps via Turborepo):

```bash
pnpm build    # production build of every app
pnpm lint     # lint / typecheck every app
```

## Production builds

```bash
# Web
cd apps/web && pnpm build && pnpm start

# Server
cd apps/server && pnpm build && pnpm start   # compiles to dist/, runs node dist/index.js
```
