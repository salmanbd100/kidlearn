# 13 — Web App Foundation, i18n & Theming

> **Estimated effort:** 3–4 hours
> **Depends on:** 01
> **Requirement IDs:** FR-I18N-01, FR-I18N-02, FR-I18N-03, NFR-A11Y-01..06, NFR-PERF-01
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Turn the create-next-app scaffold in `apps/web` into the real application shell: route groups for the three surfaces (student / parent / admin), i18next with English + Bangla resources that switch without a page reload, Tailwind v4 `@theme` tokens implementing the kid/parent dual-theme contract from `document/design.md`, Bangla-capable fonts, an `AudioProvider`/`useAudio()` narration hook, a typed API client with cold-start retry, accessibility CSS hooks (reduced motion, high contrast, dyslexia font), and the first kid-UI primitives (`BigButton`, `IconTile`). Every later frontend file (14–30) builds on what is created here.

## Context & Current State

- `apps/web` is the untouched create-next-app scaffold: `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, Tailwind v4 via `postcss.config.mjs`, path alias `@/*`.
- File 01 is done: Vitest + React Testing Library + jsdom are configured for `apps/web`; `packages/types` and `packages/ui` exist as real workspace packages.
- The Express server (`apps/server`) runs on port 4000 and exposes better-auth Google sign-in, `/api/children`, PIN endpoints, and `/api/content/*` — but **this file does not call them yet**; it only builds the client wrapper they will be called through.
- `document/design.md` defines the binding token contract (semantic colors, radius, type scale, motion tokens, kid ≥64px touch targets, kid text ≥20px).

## Detailed Requirements

1. **Route groups** — three isolated surfaces with their own layouts: `app/(student)`, `app/(parent)`, `app/(admin)`. Student layout applies `data-theme="kid"`; parent and admin apply `data-theme="parent"` (Pillar C; NFR-PERF-01 mobile-first in all three).
2. **i18n EN + BN** (FR-I18N-01): all interface strings come from JSON resource files under `apps/web/locales/{en,bn}/`. No hard-coded user-facing text in components (design.md §10).
3. **Reload-free language switch** (FR-I18N-02, FR-I18N-03): `i18next.changeLanguage()` swaps strings instantly; the choice persists in a `kidlearn_locale` cookie (1 year, `SameSite=Lax`) and — when an active child profile exists — is also written to the profile via `PATCH /api/children/:id` (wired fully in file 15; this file exposes the hook).
4. **Theme tokens** (design.md §2): Tailwind v4 `@theme` block + two `data-theme` blocks providing the full semantic contract (`--background`, `--primary`, `--ring`, radii, shadows, motion durations).
5. **Fonts**: Fredoka (display), Nunito (body), Inter (parent UI) plus **Noto Sans Bengali** via `next/font/google`, with a `:lang(bn)` / `lang="bn"` font-family fallback chain so Bangla glyphs render in both themes (FR-I18N-01).
6. **Audio** (NFR-A11Y-01 groundwork): `AudioProvider` owning a single `HTMLAudioElement` channel; playing a new clip stops the previous one; exposes `play(url)`, `stop()`, `isPlaying`, and respects a global mute.
7. **API client** (NFR-PERF-04): `fetch` wrapper targeting `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`), `credentials: "include"`, typed `{ data } | { error }` envelope, automatic retry with backoff on network failure / 5xx (cold-start), and a `coldStart` flag consumers can use to show a friendly mascot "waking up" loader.
8. **A11y CSS hooks** (NFR-A11Y-03..05): class strategy on `<html>` — `.high-contrast`, `.dyslexia-font`, `.reduced-motion` (in addition to honoring `prefers-reduced-motion`) — persisted in `localStorage` and applied before paint via a tiny inline script to avoid flash.
9. **Kid primitives** (NFR-A11Y-02): `BigButton` (≥64×64px, pill radius, press-bounce, optional audio cue on tap) and `IconTile` (large illustrated square tile, label ≥20px) built on the token contract; keyboard-focusable with visible ring (NFR-A11Y-06).

## Technical Approach & Suggestions

**Files to create/modify:**

```
apps/web/
├── app/
│   ├── layout.tsx                     # root: fonts, <html lang>, a11y class bootstrap script, Providers
│   ├── globals.css                    # @theme tokens + data-theme blocks + a11y classes
│   ├── (student)/layout.tsx           # data-theme="kid", full-bleed, min-h-dvh, AudioProvider active
│   ├── (parent)/layout.tsx            # data-theme="parent", app-shell container
│   ├── (admin)/layout.tsx             # data-theme="parent", denser shell
│   └── page.tsx                       # redirect("/select-profile") (route lands in file 15)
├── locales/
│   ├── en/common.json                 # { "app": { "name": "KidLearn" }, "actions": { "letsGo": "Let's go!", ... } }
│   └── bn/common.json                 # same keys, Bangla values
├── lib/
│   ├── i18n.ts                        # i18next init (resources bundled, lng from cookie, fallbackLng "en")
│   ├── api-client.ts                  # apiFetch<T>() with retry + envelope
│   └── a11y-prefs.ts                  # get/set high-contrast | dyslexia-font | reduced-motion classes
├── components/
│   ├── providers.tsx                  # "use client": I18nextProvider + AudioProvider
│   ├── audio-provider.tsx             # AudioProvider + useAudio()
│   ├── language-switch.tsx            # flag/label toggle EN ⇄ BN
│   └── kid/
│       ├── big-button.tsx
│       └── icon-tile.tsx
└── .env.local.example                 # NEXT_PUBLIC_API_URL=http://localhost:4000
```

**Dependencies to add** (in `apps/web`): `i18next`, `react-i18next`, `i18next-browser-languagedetector` (cookie detection), `js-cookie`. Fonts via `next/font/google` — no extra package.

**Key signatures (binding):**

```ts
// lib/api-client.ts
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
export async function apiFetch<T>(
  path: string,
  init?: RequestInit & { retries?: number; onColdStart?: () => void },
): Promise<ApiResult<T>>;
// retries default 2, backoff 1500ms/4000ms; fires onColdStart before first retry.

// components/audio-provider.tsx
export function useAudio(): {
  play: (url: string, opts?: { interrupt?: boolean }) => Promise<void>; // interrupt defaults true
  stop: () => void;
  isPlaying: boolean;
  muted: boolean;
  setMuted: (m: boolean) => void;
};
```

```tsx
// components/kid/big-button.tsx — cva variants per design.md §8
<BigButton variant="primary" size="lg" audioSrc="/audio/ui/lets-go.en.mp3" onPress={...}>
  {t("actions.letsGo")}
</BigButton>
// sizes: md = min 64px square hit area, lg = min 80px height full-width; radius --radius-pill
```

**globals.css structure:** one `@theme` block declaring `--color-*`, `--radius-*`, `--font-*` tokens mapped to CSS variables; `[data-theme="kid"]` and `[data-theme="parent"]` blocks assigning the values from design.md §2.2/§4.2; `.high-contrast` overrides `--background`/`--foreground`/`--border` to a ≥7:1 pair; `.dyslexia-font` swaps `--font-body` to `OpenDyslexic, var(--font-body)` (font files added under `public/fonts/`, loaded via `@font-face`); `.reduced-motion *, .reduced-motion *::before, .reduced-motion *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }` plus the equivalent `@media (prefers-reduced-motion: reduce)` block.

**i18n init:** bundle resources statically (`import en from "@/locales/en/common.json"`) — two small JSON files, no async loading complexity; detector order `["cookie"]`, `caches: ["cookie"]`, cookie name `kidlearn_locale`. `LanguageSwitch` calls `i18n.changeLanguage(next)` and `document.documentElement.lang = next` — React re-renders, **no navigation** (FR-I18N-03).

## Step-by-Step Plan

1. Write failing Vitest specs for `apiFetch` (envelope shape, retry-on-503 with mocked `fetch`, `onColdStart` fired once) in `apps/web/lib/api-client.test.ts`. (~20 min)
2. Implement `lib/api-client.ts` until tests pass; add `.env.local.example`. (~20 min)
3. Rewrite `globals.css`: `@theme` tokens, `data-theme` blocks, a11y classes, OpenDyslexic `@font-face`. (~30 min)
4. Update root `app/layout.tsx`: `next/font` setup (Fredoka, Nunito, Inter, Noto Sans Bengali → CSS variables), inline pre-paint script reading `localStorage` a11y prefs, mount `<Providers>`. (~25 min)
5. Create `locales/en/common.json` + `locales/bn/common.json` (≥15 starter keys: app name, actions, loading/cold-start messages, a11y setting labels) and `lib/i18n.ts`; wire `I18nextProvider` in `components/providers.tsx`. (~25 min)
6. Write failing tests for `LanguageSwitch` (renders BN strings after toggle without unmount; cookie written) then implement it. (~25 min)
7. Write failing tests for `AudioProvider` (`play` stops previous clip — assert `pause()` called on first mock element; mute suppresses playback) then implement `audio-provider.tsx`. (~30 min)
8. Build `BigButton` + `IconTile` with cva variants; RTL tests assert min-size classes, focus ring presence, and `useAudio().play` called on tap when `audioSrc` given. (~30 min)
9. Create the three route-group layouts + root redirect; verify both themes render by temporarily dropping a `BigButton` into each layout at 360px and 768px viewports. (~20 min)
10. Run `pnpm lint && pnpm typecheck && pnpm --filter web test`; fix fallout; update tracker. (~15 min)

## Acceptance Criteria

- [ ] `pnpm lint` passes with no new diagnostics
- [ ] `pnpm typecheck` passes
- [ ] `pnpm --filter web test` passes, covering: api-client retry/envelope, AudioProvider single-channel, LanguageSwitch reload-free toggle, BigButton/IconTile sizing + audio cue
- [ ] `cd apps/web && pnpm dev` renders; toggling language swaps visible strings to Bangla **without a page navigation** and survives a manual refresh (cookie)
- [ ] Bangla strings render in Noto Sans Bengali (inspect computed font-family with `lang="bn"`)
- [ ] Adding `.high-contrast` / `.dyslexia-font` / `.reduced-motion` to `<html>` in devtools visibly changes the UI; prefs persist across reload with no flash
- [ ] `BigButton` hit area ≥64×64px at 360px viewport; visible focus ring when tabbing (NFR-A11Y-02/06)
- [ ] All three route-group layouts exist and apply the correct `data-theme`

## Out of Scope

- Any real pages/screens (login → 14, profile select/home → 15, lesson player → 16)
- Calling auth/children/content endpoints (14, 15) — only the client wrapper ships here
- Persisting language to the child profile via API (wired in 15 when an active profile exists)
- Story, quiz, activity components (18–26); parent dashboard shell content (29); admin CMS (31)
- Narration *content* — real audio assets come with the AI pipeline (36); this file only ships the playback machinery
