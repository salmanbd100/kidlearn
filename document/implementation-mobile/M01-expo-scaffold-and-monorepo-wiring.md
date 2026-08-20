# M01 — Expo Scaffold & Monorepo Wiring

> **Estimated effort:** 3–4 hours
> **Depends on:** —
> **Requirement IDs:** spec §7.1, NFR-SCALE-03
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Create `apps/mobile` as a real workspace of this pnpm + Turborepo monorepo: an Expo app with `expo-router`, TypeScript in strict mode, a Metro config that can resolve workspace packages through pnpm's symlinked `node_modules`, Biome and `typecheck` wired into the existing root scripts, `jest-expo` running one real test, and a **development build** installed on a physical phone showing a placeholder screen. Nothing here renders product UI — this file exists so that every file after it has a working edit-save-see loop on a device.

## Context & Current State

- The repo is pnpm 9 + Turborepo. `pnpm-workspace.yaml` declares `apps/*` and `packages/*`, so a new folder under `apps/` becomes a workspace as soon as it has a `package.json` with a `name`.
- `turbo.json` runs `dev`, `build`, `typecheck` and `test` per package; `typecheck` depends on `^build`. Biome runs repo-wide from the root — apps have **no** per-package `lint` script.
- `apps/web` is the naming precedent: package name `web`, path alias `@/*` → app root, `test` script running Vitest.
- `packages/types` ships **raw TypeScript** through its `exports` map (no build step). Metro must therefore transpile source from outside `apps/mobile`, which is what the monorepo Metro config below enables.
- `packages/db` is Prisma and server-only. `apps/mobile` must never depend on it.
- No mobile code exists yet. No Expo account, no EAS project.

## Detailed Requirements

1. **Workspace package.** `apps/mobile/package.json` named `mobile`, `private: true`, with scripts: `dev` (`expo start --dev-client`), `android` (`expo run:android`), `ios` (`expo run:ios`), `typecheck` (`tsc --noEmit`), `test` (`jest`). No `lint` script — Biome runs from the root.
2. **Expo app with expo-router.** Scaffold with the latest Expo SDK, then delete the template's example screens. `app/_layout.tsx` is the root `Stack`; `app/index.tsx` is a placeholder screen showing the app name and the resolved API base URL, so the device build visibly proves configuration reaches it.
3. **Monorepo Metro.** `apps/mobile/metro.config.js` must watch the repo root and resolve from both the app's and the root's `node_modules`. Without this, importing `@kidlearn/types` fails with "Unable to resolve module".
4. **TypeScript.** Extends `expo/tsconfig.base`, `strict: true`, path alias `@/*` → `apps/mobile/*`. `@kidlearn/types` added as a workspace dependency and imported once in the placeholder screen to prove resolution works end to end.
5. **App identity.** `app.config.ts` (TypeScript, not `app.json`, so values can be computed) declaring `name: "KidLearn"`, `slug: "kidlearn"`, `scheme: "kidlearn"`, `ios.bundleIdentifier: "net.kidlearn.app"`, `android.package: "net.kidlearn.app"`, `orientation: "default"` (both orientations per design.md §6), `newArchEnabled: true`, and `userInterfaceStyle: "light"` for now — dark mode is parent-theme-only and arrives in M02.
6. **Environment.** `EXPO_PUBLIC_API_URL` read through a single `lib/env.ts` with a documented default of `http://localhost:4000`. Commit `apps/mobile/env.example` with LAN-IP and Android-emulator guidance; gitignore the real local env file.
7. **Turbo & ignore wiring.** `apps/mobile` inherits the root `dev`/`typecheck`/`test` pipelines. Add `.expo/`, `dist/`, and `ios/`/`android/` (in case a prebuild is ever run) to `.gitignore`, and to Biome's ignore list if it tries to format generated output.
8. **Tests.** `jest-expo` preset + `@testing-library/react-native`, with one real test: the placeholder screen renders the app name. This proves the harness works before any component depends on it.
9. **Development build on a device.** Install EAS CLI, `eas login`, `eas init` (creates the EAS project and writes `extra.eas.projectId`), then `eas build --profile development --platform android`, install the APK on a physical Android phone, and confirm `pnpm --filter mobile dev` connects with working fast refresh.

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

// pnpm hoists to the workspace root and symlinks into each package, so Metro has
// to watch the whole tree or it will miss changes in packages/* and fail to
// resolve their dependencies.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
// Keep hierarchical lookup on: pnpm's nested symlinks need it.
config.resolver.disableHierarchicalLookup = false;

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

Test setup — `jest-expo` must be told to transpile the workspace packages, which is what `transformIgnorePatterns` does:

```js
// apps/mobile/jest.config.js
module.exports = {
  preset: "jest-expo",
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg|nativewind|react-native-css-interop|@kidlearn/.*)/)",
  ],
};
```

## Step-by-Step Plan

1. Scaffold with `create-expo-app` into `apps/mobile`, delete the template's example screens and assets, and reduce `app/` to `_layout.tsx` + `index.tsx`. (~30 min)
2. Rewrite `package.json` (name `mobile`, the five scripts, `@kidlearn/types` as `workspace:*`), run `pnpm install` from the repo root, and confirm the workspace is picked up: `pnpm --filter mobile exec node -e "console.log('ok')"`. (~20 min)
3. Add `metro.config.js`, `tsconfig.json` (strict + `@/*` alias), `app.config.ts`, `lib/env.ts` and `env.example`. Import `LOCALES` from `@kidlearn/types` in `app/index.tsx`. (~30 min)
4. Run `pnpm --filter mobile typecheck` and `pnpm lint` from the root; fix Biome complaints and add generated folders to `.gitignore`. (~20 min)
5. Install `jest-expo`, `@testing-library/react-native` and `jest`; add `jest.config.js`; write the placeholder render test; run `pnpm --filter mobile test` and watch it pass. (~30 min)
6. Start the bundler with `pnpm --filter mobile dev` and open the app in a simulator to confirm it boots and resolves `@kidlearn/types`. (~15 min)
7. Install EAS CLI, `eas login`, `eas init`, add `eas.json`, then `eas build --profile development --platform android`; install the APK on a real phone and confirm fast refresh. (~45 min, mostly build-queue waiting)
8. Commit; update `M00-progress-tracker.md`. (~10 min)

## Acceptance Criteria

- [ ] `pnpm install` at the repo root installs `apps/mobile` as a workspace; `pnpm --filter mobile typecheck` and `pnpm lint` both pass.
- [ ] `pnpm --filter mobile test` passes with the placeholder render test.
- [ ] The app boots in a simulator **and** on a physical Android phone via the development build, and fast refresh applies an edit within a few seconds.
- [ ] The placeholder screen displays the value of `EXPO_PUBLIC_API_URL` and the locales imported from `@kidlearn/types` — env and workspace resolution both proven on device.
- [ ] Editing a file in `packages/types` triggers a Metro rebuild without a cache clear.
- [ ] `app.config.ts` declares scheme `kidlearn` and bundle ID / package `net.kidlearn.app`; `eas.json` has `development`, `preview` and `production` profiles.
- [ ] No secret exists in any `EXPO_PUBLIC_*` variable, and the local env file is gitignored.

## Out of Scope

- Design tokens, fonts, NativeWind — M02.
- i18n — M03.
- Any API call beyond displaying the base URL — M04.
- iOS development build (needs the Apple account, phase M9); the simulator plus an Android device is enough to work with.
- `expo prebuild` and committing `ios/`/`android/`. Stay in the managed workflow — config plugins cover the native changes later files need.
