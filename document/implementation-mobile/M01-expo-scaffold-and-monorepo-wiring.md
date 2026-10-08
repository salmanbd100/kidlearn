# M01 — Expo Scaffold & Monorepo Wiring

> **Estimated effort:** 3–4 hours
> **Depends on:** —
> **Requirement IDs:** spec §7.1, NFR-SCALE-03
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Create `apps/mobile` as a real workspace of this pnpm + Turborepo monorepo: an Expo app with `expo-router`, TypeScript in strict mode, a Metro config that resolves workspace packages through pnpm's symlinked `node_modules` and pins React to the app's own copy, a Biome override that keeps web-only and admin-only imports out, `typecheck`/`test`/`test:coverage` wired into CI `gates`, `jest-expo` running one real test, and a **development build** installed on a physical phone showing a placeholder screen. Nothing here renders product UI — this file exists so that every file after it has a working edit-save-see loop on a device.

The app is the **Student Portal and Parent Dashboard only**. The Admin CMS, the public `(site)` pages and the AI pipeline stay web-only, permanently.

## Context & Current State

- The repo is pnpm 9.15 (`packageManager: pnpm@9.15.0`) + Turborepo `^2.11.7` on Node 22 (`.nvmrc`, `engines: >=22 <23`). `pnpm-workspace.yaml` declares `apps/*` and `packages/*`, so a new folder under `apps/` becomes a workspace as soon as it has a `package.json` with a `name`.
- `turbo.json` runs `dev`, `build`, `typecheck`, `test` and `test:coverage` per package; `typecheck`, `test` and `test:coverage` all depend on `^build`. Biome `^2.5` runs repo-wide from the root (`biome.json`, no `overrides` yet) — apps have **no** per-package `lint` script.
- Dependencies shared by more than one workspace live in the `catalog:` block of `pnpm-workspace.yaml` (`typescript`, `@types/react`, `@types/node`, `zod`, `vitest`, …). `apps/mobile` names those as `catalog:` rather than pinning its own version. React is deliberately **not** in the catalog: `apps/web` pins `react@19.3.0`, and the Expo SDK dictates its own exact `react` / `react-native` pair. One React per app, not per repo — `apps/mobile` pins exactly what `npx expo install --check` says. `@types/react` is in the catalog at `^19`; if the SDK's React needs a different major, mobile pins its own instead of moving the catalog.
- `.github/workflows/ci.yml` runs one `gates` job on every PR and every push to `main`/`dev`: `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm build` → `pnpm typecheck` → `pnpm test:coverage` (`TURBO_CONCURRENCY=1`) → `pnpm --filter server test:db` → Docker image builds. `gates` is a required check on `main` and `dev`. `apps/mobile` joins it through its `typecheck`, `test` and `test:coverage` scripts; `ci.yml` itself does not change. `pnpm build` runs every package's `build`, so `apps/mobile` gets an echo no-op `build` (the `@kidlearn/tokens` precedent) — an EAS build must never start from Turbo.
- `.github/scripts/coverage-summary.mjs` reads `<pkg>/coverage/coverage-summary.json` from a hard-coded `PACKAGES` list; the artifact upload already globs `apps/*/coverage`.
- `apps/web` is the naming precedent: package name `web`, path alias `@/*` → app root, `test` script running Vitest.
- `@kidlearn/types` **builds** to `dist/` (ESM, `tsc --project tsconfig.build.json`) and its `exports` point at `dist/index.js` — so, like the server, mobile needs `^build` before typecheck and test, and Metro reads compiled JS. It is **one barrel**: admin contracts (`api/admin*.ts`) are exported from the same `"."` entry as everything else, with no subpath.
- `@kidlearn/tokens` and `@kidlearn/i18n` ship **raw TypeScript** (and, for i18n, JSON) through their `exports` maps. Metro must transpile source from outside `apps/mobile`, which the monorepo Metro config below enables. `@kidlearn/i18n` exports `"."` (namespaces `common`, `parent`, `student`, `lesson`) and `"./site"` (the public site's copy — web-only).
- None of `types`, `tokens`, `i18n` has a React dependency; keep it that way so they never pull a second React into either app.
- `packages/db` is Prisma and server-only; `packages/ui` is web-only by design (`mobile-app-plan.md` §4.2). `apps/mobile` depends on neither.
- No mobile code exists yet. No Expo account, no EAS project.

## Detailed Requirements

1. **Workspace package.** `apps/mobile/package.json` named `mobile`, `private: true`, with scripts: `dev` (`expo start --dev-client`), `android` (`expo run:android`), `ios` (`expo run:ios`), `build` (`echo 'mobile builds on EAS, not Turbo - nothing to build'`), `typecheck` (`tsc --noEmit`), `test` (`jest`), `test:coverage` (`jest --coverage`). No `lint` script — Biome runs from the root. Root `pnpm dev` now starts Metro alongside web and server; `pnpm dev --filter=web --filter=server` when not working on mobile.
2. **Expo app with expo-router.** Scaffold with the latest Expo SDK, then delete the template's example screens. `app/_layout.tsx` is the root `Stack`; `app/index.tsx` is a placeholder screen showing the app name and the resolved API base URL, so the device build visibly proves configuration reaches it.
3. **Monorepo Metro.** `apps/mobile/metro.config.js` must watch the repo root and resolve from the app's `node_modules` first, then the root's, with **hierarchical lookup disabled** so `react` / `react-native` can only come from `apps/mobile` — never from `apps/web`'s `react@19.3.0`. Without the watch folders, importing `@kidlearn/types` fails with "Unable to resolve module"; without the pinning, two Reacts in one bundle fail at runtime with an invalid-hook-call error.
4. **TypeScript.** Extends `expo/tsconfig.base`, `strict: true`, path alias `@/*` → `apps/mobile/*`. `@kidlearn/types` added as a workspace dependency and imported once in the placeholder screen to prove resolution works end to end.
5. **App identity.** `app.config.ts` (TypeScript, not `app.json`, so values can be computed) declaring `name: "KidLearn"`, `slug: "kidlearn"`, `scheme: "kidlearn"`, `ios.bundleIdentifier: "net.kidlearn.app"`, `android.package: "net.kidlearn.app"`, `orientation: "default"` (both orientations per design.md §6), `newArchEnabled: true`, and `userInterfaceStyle: "light"` for now — dark mode is parent-theme-only and arrives in M02.
6. **Environment.** `EXPO_PUBLIC_API_URL` read through a single `lib/env.ts` with a documented default of `http://localhost:4000`. Commit `apps/mobile/env.example` with LAN-IP and Android-emulator guidance; gitignore the real local env file.
7. **Turbo, CI & ignore wiring.** `apps/mobile` inherits the root `dev`/`build`/`typecheck`/`test`/`test:coverage` tasks with no `turbo.json` change — the default `build` entry (`dependsOn: ["^build"]`) builds `@kidlearn/types` first and the mobile no-op caches with no outputs. Jest writes `coverage/coverage-summary.json` (`coverageReporters: ["json-summary", "lcov", "text"]`) and `apps/mobile` is added to `PACKAGES` in `.github/scripts/coverage-summary.mjs`. Add `.expo/` and `ios/`/`android/` (in case a prebuild is ever run) to `.gitignore` — Biome uses the VCS ignore file, so they drop out of lint too (`dist/` is already ignored).
8. **Import boundaries (Biome override).** `biome.json` gains an `overrides` entry scoped to `apps/mobile/**` that turns on `style/noRestrictedImports` and `performance/noNamespaceImport`:
   - `@kidlearn/i18n/site` — forbidden; the site namespace is web-only.
   - `@kidlearn/db`, `@kidlearn/ui` — forbidden; server-only and web-only.
   - Admin contracts from `@kidlearn/types` — Biome restricts by module specifier, and by import-name regex within one, but **not by the file an export came from**. Because `@kidlearn/types` is a single barrel, the enforceable rule is an `importNamePattern` on `@kidlearn/types` covering every export of `src/api/admin*.ts`, plus a ban on namespace imports (`import * as T from "@kidlearn/types"` would otherwise bypass the name check). The pattern is a hand-kept list of prefixes, so a jest test (`test/import-boundaries.test.ts`) reads the export names of `packages/types/src/api/admin*.ts`, asserts each matches the pattern in `biome.json`, and asserts no non-admin export does. A new admin export with a new prefix fails that test instead of slipping through.
   - Rule, stated once: **no `/api/admin/*` call, no admin contract, no password sign-in UI in `apps/mobile`.** The same test greps `apps/mobile/{app,features,shared,lib}` for the string `/api/admin` and fails if it finds one.
9. **Tests.** `jest-expo` preset + `@testing-library/react-native`, with one real test: the placeholder screen renders the app name. This proves the harness works before any component depends on it.
10. **Development build on a device.** Install EAS CLI, `eas login`, `eas init` (creates the EAS project and writes `extra.eas.projectId`), then `eas build --profile development --platform android`, install the APK on a physical Android phone, and confirm `pnpm --filter mobile dev` connects with working fast refresh.

## Technical Approach & Suggestions

Scaffold, then reduce — creating in place avoids moving files around afterwards:

```bash
cd /Users/salmanrahman/Documents/Me/kidlearn
pnpm dlx create-expo-app@latest apps/mobile
# then strip the template down to app/_layout.tsx + app/index.tsx
```

`apps/mobile/metro.config.js` — the one piece of monorepo plumbing that is not optional:

```js
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch the whole tree, or Metro misses changes in packages/*.
config.watchFolders = [workspaceRoot];
// apps/web pins its own React; walking up from a shared package could find it.
// Resolving only from these two roots keeps react/react-native the app's own.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
```

`apps/mobile/lib/env.ts`:

```ts
/**
 * `EXPO_PUBLIC_*` values are inlined into the shipped bundle at build time and
 * are readable by anyone who downloads the app. Nothing secret goes here.
 */
const DEFAULT_API_URL = "http://localhost:4000";

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL;
```

`apps/mobile/env.example` (copy to the gitignored local env file):

```
# A physical device cannot reach your machine's loopback. Use your LAN IP.
#   macOS: ipconfig getifaddr en0
# Android emulator reaches the host at 10.0.2.2; the iOS simulator can use localhost.
EXPO_PUBLIC_API_URL=http://192.168.0.10:4000
```

`app/index.tsx` — deliberately proves three things at once (router works, workspace import works, env reaches the device):

```tsx
import { LOCALES } from "@kidlearn/types";
import { Text, View } from "react-native";
import { API_BASE_URL } from "@/lib/env";

export default function Placeholder() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}>
      <Text accessibilityRole="header">KidLearn</Text>
      <Text>{API_BASE_URL}</Text>
      <Text>{LOCALES.join(", ")}</Text>
    </View>
  );
}
```

`apps/mobile/eas.json` with three profiles from the start — `development` is the one this file needs; the others are configured now so later phases do not have to revisit the file:

```json
{
  "cli": { "version": ">= 12.0.0", "appVersionSource": "remote" },
  "build": {
    "development": { "developmentClient": true, "distribution": "internal" },
    "preview": { "distribution": "internal", "android": { "buildType": "apk" } },
    "production": { "autoIncrement": true }
  },
  "submit": { "production": {} }
}
```

If pnpm's isolated layout leaves an Expo transitive dependency unresolvable with hierarchical lookup off, pin `react`/`react-native` through `resolver.resolveRequest` (or `extraNodeModules`) to `apps/mobile/node_modules` instead of re-enabling the lookup — the invariant is one React per app. Confirm it with `pnpm why react --filter mobile` (one version, the SDK's).

`biome.json` override (verified against Biome 2.5.15 — `importNamePattern` rejects `^`/`$`, the anchors are implicit; the pattern list mirrors `packages/types/src/api/admin*.ts` at the time of writing):

```json
"overrides": [
  {
    "includes": ["apps/mobile/**"],
    "linter": {
      "rules": {
        "performance": { "noNamespaceImport": "error" },
        "style": {
          "noRestrictedImports": {
            "level": "error",
            "options": {
              "paths": {
                "@kidlearn/i18n/site": "The site namespace is web-only.",
                "@kidlearn/db": "Prisma is server-only.",
                "@kidlearn/ui": "Web-only by design (mobile-app-plan.md §4.2)."
              },
              "patterns": [
                {
                  "group": ["@kidlearn/types"],
                  "importNamePattern": "(Admin|Ai[A-Z]|AI_|PlatformOverview|ContentStatus|CONTENT_|ContentResource|ORDERABLE_|Orderable|ALLOWED_CONTENT|nextContentStatuses|isContentEditable|LocalizedName|ReorderedIds|CharacterSheet|PromotedCharacterSheets|EDITOR_|EditorContent|QuestionDeleted|MediaAsset|UploadSignature|GenerationJobRef|BatchGenerationRef|NARRATION_|NarrationEntity|Generate[A-Z]).*",
                  "message": "Admin contracts are web-only — mobile has no admin surface."
                }
              ]
            }
          }
        }
      }
    }
  }
]
```

Test setup — `jest-expo` must be told to transpile the raw-TypeScript workspace packages, which is what `transformIgnorePatterns` does; `coverageReporters` gives `coverage-summary.mjs` its JSON:

```js
// apps/mobile/jest.config.js
module.exports = {
  preset: "jest-expo",
  coverageReporters: ["json-summary", "lcov", "text"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg|nativewind|react-native-css-interop|@kidlearn/.*)/)",
  ],
};
```

## Step-by-Step Plan

1. Scaffold with `create-expo-app` into `apps/mobile`, delete the template's example screens and assets, and reduce `app/` to `_layout.tsx` + `index.tsx`. (~30 min)
2. Rewrite `package.json` (name `mobile`, the seven scripts, `@kidlearn/types` as `workspace:*`, `react`/`react-native` at the versions `npx expo install --check` reports), run `pnpm install` from the repo root, and confirm the workspace is picked up: `pnpm --filter mobile exec node -e "console.log('ok')"`. (~20 min)
3. Add `metro.config.js`, `tsconfig.json` (strict + `@/*` alias), `app.config.ts`, `lib/env.ts` and `env.example`. Import `LOCALES` from `@kidlearn/types` in `app/index.tsx`. (~30 min)
4. Run `pnpm build --filter=@kidlearn/types` then `pnpm --filter mobile typecheck` and `pnpm lint` from the root; fix Biome complaints and add generated folders to `.gitignore`. (~20 min)
5. Add the Biome override to `biome.json`; prove it by temporarily importing `AdminWorldSchema` from `@kidlearn/types` and anything from `@kidlearn/i18n/site` in `app/index.tsx` and watching `pnpm lint` fail, then revert. (~20 min)
6. Install `jest-expo`, `@testing-library/react-native` and `jest`; add `jest.config.js`; write the placeholder render test and `test/import-boundaries.test.ts`; run `pnpm --filter mobile test` and watch both pass. Add `apps/mobile` to `.github/scripts/coverage-summary.mjs`. (~40 min)
7. Start the bundler with `pnpm --filter mobile dev` and open the app in a simulator to confirm it boots and resolves `@kidlearn/types`. (~15 min)
8. Install EAS CLI, `eas login`, `eas init`, add `eas.json`, then `eas build --profile development --platform android`; install the APK on a real phone and confirm fast refresh. (~45 min, mostly build-queue waiting)
9. From a clean clone state run the `gates` sequence locally (`pnpm install --frozen-lockfile && pnpm lint && pnpm build && pnpm typecheck && pnpm test:coverage`); open the PR and confirm `gates` is green with `gh pr checks`. Update `M00-progress-tracker.md`. (~20 min)

## Acceptance Criteria

- [ ] `pnpm install` at the repo root installs `apps/mobile` as a workspace; `pnpm --filter mobile typecheck` and `pnpm lint` both pass.
- [ ] `pnpm build` runs the mobile `build` no-op and never starts an EAS build; `pnpm typecheck`, `pnpm test` and `pnpm test:coverage` include `mobile`, and its coverage row appears in the CI run summary.
- [ ] `gates` is green on the PR (`gh pr checks`) with `ci.yml` unchanged.
- [ ] `pnpm --filter mobile test` passes with the placeholder render test and the import-boundaries test.
- [ ] In `apps/mobile`, importing from `@kidlearn/i18n/site`, `@kidlearn/db` or `@kidlearn/ui`, importing any admin contract from `@kidlearn/types`, or `import * as` anything fails `pnpm lint`; the same imports in `apps/web` still pass.
- [ ] `pnpm why react --filter mobile` shows exactly one React — the version the Expo SDK pins, not `apps/web`'s `19.3.0` unless the two coincide.
- [ ] The app boots in a simulator **and** on a physical Android phone via the development build, and fast refresh applies an edit within a few seconds.
- [ ] The placeholder screen displays the value of `EXPO_PUBLIC_API_URL` and the locales imported from `@kidlearn/types` — env and workspace resolution both proven on device.
- [ ] Editing a file in `packages/types` triggers a Metro rebuild without a cache clear.
- [ ] `app.config.ts` declares scheme `kidlearn` and bundle ID / package `net.kidlearn.app`; `eas.json` has `development`, `preview` and `production` profiles.
- [ ] No secret exists in any `EXPO_PUBLIC_*` variable, and the local env file is gitignored.

## Out of Scope

- Design tokens, fonts, NativeWind — M02.
- i18n — M03.
- Any API call beyond displaying the base URL — M04.
- Admin CMS, public site, AI pipeline, password sign-in — web-only, never on mobile.
- iOS development build (needs the Apple account, phase M9); the simulator plus an Android device is enough to work with.
- `expo prebuild` and committing `ios/`/`android/`. Stay in the managed workflow — config plugins cover the native changes later files need.
