# 01 — Workspace Packages & Test Runner Setup

> **Estimated effort:** 3–4 hours
> **Depends on:** —
> **Requirement IDs:** NFR-SCALE-03, spec §12.8
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal
Turn the placeholder `packages/types` and `packages/config` directories into real pnpm workspace packages, align the existing `packages/ui` package with shared TS config, and stand up Vitest across both apps (`apps/web` with jsdom + React Testing Library, `apps/server` with node env + Supertest) so that `pnpm test` from the repo root runs a green suite via Turborepo. This unblocks the TDD working agreement for every later file.

## Context & Current State
- pnpm 9 + Turborepo monorepo; workspace globs are `apps/*` and `packages/*` (`pnpm-workspace.yaml`).
- `packages/ui` **already exists** with `name: "@kidlearn/ui"`, raw-TS exports (`./src/index.ts`), and a `typecheck` script. It is consumed by `apps/web` (`"@kidlearn/ui": "workspace:*"`).
- `packages/db` **already exists** (covered/verified by file 02 — do not touch it here).
- `packages/types` and `packages/config` are **empty directories** with no `package.json`, so pnpm/Turbo do not see them.
- `apps/server/package.json` still has the placeholder failing script: `"test": "echo \"Error: no test specified\" && exit 1"`.
- `apps/web` has no test script at all. No test runner, no test files anywhere (spec §12.8).
- `turbo.json` has `dev`, `build`, `typecheck`, `db:generate`, `db:migrate` tasks — **no `test` task**.
- Lint/format is Biome from the root (`pnpm lint` / `pnpm format`); per-package lint scripts are deliberately absent.

## Detailed Requirements
1. `packages/config` becomes workspace package `@kidlearn/config` exposing shared `tsconfig` presets (`base.json`, `node.json`, `react-library.json`) as plain JSON files (NFR-SCALE-03 — one repo, one config source).
2. `packages/types` becomes workspace package `@kidlearn/types` with `dev`/`build`/`typecheck` scripts per the Shared Technical Decisions, an `exports` map, and a minimal `src/index.ts` (real schemas land in file 07).
3. `packages/ui` and `packages/types` extend the shared tsconfigs from `@kidlearn/config` instead of duplicating compiler options.
4. Vitest is installed in `apps/web` (environment `jsdom`, React Testing Library, `@testing-library/jest-dom`) and in `apps/server` (environment `node`, `supertest` + `@types/supertest` as dev deps) (spec §12.8; Shared Technical Decisions: "Vitest everywhere").
5. The placeholder failing `test` script in `apps/server` is replaced with `vitest run`; `apps/web` gains a `test` script.
6. `turbo.json` gains a `test` task and the root `package.json` gains `"test": "turbo run test"` so the whole suite runs with one command (NFR-SCALE-03).
7. One smoke test per app proves the runner works: a render test for the web home page, and a Supertest hit on `GET /health` for the server. The server entry must be split so the Express `app` is importable without calling `listen()`.
8. `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` all pass from the root afterwards.

## Technical Approach & Suggestions

**Files to create**
- `packages/config/package.json`
- `packages/config/tsconfig/base.json`, `packages/config/tsconfig/node.json`, `packages/config/tsconfig/react-library.json`
- `packages/types/package.json`, `packages/types/tsconfig.json`, `packages/types/src/index.ts`
- `apps/web/vitest.config.mts`, `apps/web/vitest.setup.ts`, `apps/web/app/page.test.tsx`
- `apps/server/vitest.config.ts`, `apps/server/src/app.ts`, `apps/server/src/app.test.ts`

**Files to modify**
- `apps/server/package.json`, `apps/server/src/index.ts`, `apps/web/package.json`, `packages/ui/tsconfig.json`, `packages/types` consumers later, `turbo.json`, root `package.json`.

`packages/config/package.json` (JSON-only package — no `dev`/`build`/`typecheck` scripts; Turbo skips packages that lack a task, and there is nothing to compile or typecheck):

```json
{
  "name": "@kidlearn/config",
  "version": "0.0.0",
  "private": true,
  "files": ["tsconfig"],
  "exports": { "./tsconfig/*": "./tsconfig/*" }
}
```

`packages/config/tsconfig/base.json` (mirror the strict options already used by `packages/db`):

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

`node.json` extends base and adds `"lib": ["ES2022"]`; `react-library.json` extends base and adds `"lib": ["ES2022", "DOM", "DOM.Iterable"], "jsx": "react-jsx"`.

`packages/types/package.json`:

```json
{
  "name": "@kidlearn/types",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "scripts": {
    "dev": "tsc --watch --preserveWatchOutput",
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": { "@kidlearn/config": "workspace:*", "typescript": "^5" }
}
```

`packages/types/src/index.ts` starts with a single real export so the build emits something: `export const SCHEMA_VERSION = 1;` (file 07 replaces this with Zod schemas — add `zod` there, not now).

`apps/server/src/app.ts` — move everything except `listen()` out of `src/index.ts`:

```ts
import cors from "cors";
import express, { type Request, type Response } from "express";

export const app = express();
app.use(cors());
app.use(express.json());
app.get("/health", (_req: Request, res: Response) => res.json({ status: "ok" }));
app.get("/", (_req: Request, res: Response) => res.json({ message: "kidlearn server" }));
```

`src/index.ts` keeps only `import "dotenv/config"`, the DB-backed routes (left as-is until file 08 restructures them), `import { app } from "./app.js"`, and `app.listen(...)`. Note the `.js` extension — the server is ESM with `moduleResolution: bundler` under tsx; if `tsc` complains, set `"moduleResolution": "NodeNext", "module": "NodeNext"` for the server only.

`apps/server/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", include: ["src/**/*.test.ts"] } });
```

`apps/server/src/app.test.ts`:

```ts
import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "./app.js";

describe("GET /health", () => {
  it("returns ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
```

`apps/web/vitest.config.mts` (`.mts` because the app has no `"type": "module"`):

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next"],
  },
  resolve: { alias: { "@": new URL(".", import.meta.url).pathname } },
});
```

`apps/web/vitest.setup.ts`: `import "@testing-library/jest-dom/vitest";`

`apps/web/app/page.test.tsx` renders `<Home />` from `./page` and asserts something stable in the scaffold markup (e.g. `screen.getByRole("main")` is in the document) — adjust the assertion to whatever `app/page.tsx` currently renders.

**Dependency installs** (run from repo root):

```bash
pnpm add -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom --filter web
pnpm add -D vitest supertest @types/supertest --filter server
```

**Scripts**: `apps/web` gains `"test": "vitest run"`; `apps/server`'s placeholder becomes `"test": "vitest run"`. `turbo.json` gains `"test": { "dependsOn": ["^build"] }`. Root `package.json` gains `"test": "turbo run test"`.

## Step-by-Step Plan
1. Create `packages/config` (`package.json` + three tsconfig JSON files); run `pnpm install` and confirm pnpm lists the workspace (`pnpm ls -r --depth -1`). (~15 min)
2. Create `packages/types` (`package.json`, `tsconfig.json` extending `@kidlearn/config/tsconfig/node.json` with `outDir/rootDir/declaration`, `src/index.ts`); `pnpm install && pnpm --filter @kidlearn/types build` passes. (~20 min)
3. Point `packages/ui/tsconfig.json` at `@kidlearn/config/tsconfig/react-library.json` via `extends`, keeping its local `paths`/`include`; add `"@kidlearn/config": "workspace:*"` to its devDependencies; `pnpm --filter @kidlearn/ui typecheck` passes. (~20 min)
4. Refactor `apps/server/src/index.ts` into `app.ts` + `index.ts`; confirm `pnpm --filter server dev` still serves `GET /health`. (~20 min)
5. Write the failing server smoke test (`src/app.test.ts`), install server test deps, add `vitest.config.ts`, replace the placeholder `test` script — `pnpm --filter server test` goes green. (~25 min)
6. Install web test deps, add `vitest.config.mts` + `vitest.setup.ts`, write `app/page.test.tsx`, add the `test` script — `pnpm --filter web test` goes green. (~30 min)
7. Add the `test` task to `turbo.json` and `"test": "turbo run test"` to the root `package.json`; `pnpm test` runs both suites. (~15 min)
8. Full verification sweep: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`; fix any Biome or tsc fallout (Biome will format new files — run `pnpm format`). (~25 min)

## Acceptance Criteria
- [ ] `pnpm ls -r --depth -1` lists `@kidlearn/config` and `@kidlearn/types` as workspace packages.
- [ ] `pnpm --filter @kidlearn/types build` emits `packages/types/dist/index.js` + `.d.ts`.
- [ ] `packages/ui` and `packages/types` tsconfigs `extend` a preset from `@kidlearn/config`.
- [ ] `pnpm --filter server test` exits 0 with the `/health` Supertest passing (no placeholder `exit 1` anywhere).
- [ ] `pnpm --filter web test` exits 0 with the home-page render test passing.
- [ ] `pnpm test` from the root runs both suites via Turbo and exits 0.
- [ ] `pnpm lint` exits 0; `pnpm typecheck` exits 0; `pnpm build` exits 0.
- [ ] `pnpm dev` still starts web + server together (NFR-SCALE-03).

## Out of Scope
- Real content in `packages/types` (Zod activity/quiz schemas) — file 07.
- Anything inside `packages/db` (verified/completed in file 02).
- Server route restructuring, middleware, validation — file 08.
- UI components beyond what already exists in `packages/ui` — files 13+.
- CI pipeline configuration — file 38.
