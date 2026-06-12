# 15 — Student Profile Select & Home Screen

> **Estimated effort:** 3–4 hours
> **Depends on:** 12, 13, 14
> **Requirement IDs:** FR-AUTH-06, FR-PROF-03, FR-WORLD-01, FR-WORLD-02, FR-WORLD-03, FR-WORLD-05, FR-GAM-06 (display only), NFR-SAFE-07, Pillars A & C
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Build the child's entry into the product: a `/select-profile` screen of big tappable avatar cards that activates a profile with no PIN (FR-AUTH-06), and the student home — an immersive, world-themed, voice-guided screen where Jungle and Ocean world cards (rendered purely from `GET /api/content/worlds` data, FR-WORLD-05) lead to large picture-tile lesson lists filtered to the child's grade and language (FR-PROF-03). Star/coin counters and the streak chip display server values read-only. A small locked parent-corner icon is the only path out of the student surface, via the PIN gate. No external links exist anywhere (NFR-SAFE-07).

## Context & Current State

- File 13: `(student)` layout (`data-theme="kid"`, full-bleed, `min-h-dvh`), i18next EN/BN, `apiFetch`, `useAudio()`, `BigButton`, `IconTile`.
- File 14: parents exist with children created; `PinGate` component is reusable; `children-api.ts` has typed wrappers.
- File 12 (server): `GET /api/content/worlds` (id, slug, name per-locale, palette JSON, mascot asset URL), `GET /api/content/worlds/:id/topics`, `GET /api/content/topics/:id/lessons` — all published-only and filtered by the **active child's** grade + locale server-side.
- File 11 (server): `POST /api/children/:id/activate` scopes the session to that child (FR-AUTH-06); `GET /api/children/active` returns the active child including `stars`, `coins`, `currentStreak` summary fields (0 when nothing earned yet).
- Reward *values* are server-computed (files 23–24 produce nonzero numbers); this file only renders whatever the API returns.

## Detailed Requirements

1. **`/select-profile`** (FR-AUTH-06): shows all children of the logged-in parent as big avatar cards (avatar image + name ≥20px). Tapping a card calls `POST /api/children/:id/activate` then routes to `/home`. Switching profiles later returns here **without any PIN**. If the parent is unauthenticated, route to `/parent/login`; if zero children exist, show a mascot prompt directing the grown-up to the parent corner.
2. **Voice guidance on mount** (NFR-A11Y-01, Pillar A): every student screen plays a short localized narration on mount via `useAudio` (e.g. select-profile: "Who's learning today?"). Implemented as a reusable `useScreenNarration(key)` hook resolving `/audio/ui/{key}.{locale}.mp3`.
3. **Student home `/home`** (FR-WORLD-01..03): renders one large card per world from the worlds API — background gradient from `palette`, mascot image, localized world name. Jungle and Ocean appear because the data says so, not because the code names them (FR-WORLD-05: adding Space World later is a data change only).
4. **Counters & streak** (FR-GAM-06 display): a top strip showing star count, coin count, and a streak chip ("🔥 3" style with localized label). Values come from `GET /api/children/active`; `0`/no-streak renders gracefully (dimmed chip, no error). Read-only — no client-side mutation ever.
5. **Lesson browsing** (FR-PROF-03): tapping a world →
   `/world/[worldId]` listing its topics, then lessons, as large picture tiles (thumbnail, name ≥20px). Tapping a tile **plays the lesson name aloud** (per-locale audio ref from the API) on first tap and navigates on the same tap (audio continues into navigation — single channel handles it). All content arrives pre-filtered by grade + locale from file 12; the client adds no filtering logic.
6. **Parent corner** (Pillar C): a small lock icon pinned to a top corner (deliberately *not* in the kid thumb zone, design.md §6) labeled for grown-ups; tapping opens the `PinGate` modal and on success navigates to `/parent/children`.
7. **Orientation** (NFR-PERF-01): portrait stacks world cards vertically; landscape places them side-by-side (`grid-cols-1 landscape:grid-cols-2` or `md:` + aspect queries). Lesson tile grids go 2-up portrait phone → 3–4-up tablet/landscape. No dead ends, no horizontal scroll.
8. **No external links** (NFR-SAFE-07): no `<a href>` to any external origin in the `(student)` tree; enforce with a test that walks rendered output of each screen.
9. **Language persistence** (FR-I18N-02 closure from file 13): when the active child's `language` differs from the current i18next locale, switch to the child's preference on activation; the in-app language switch (student settings corner not built yet) is deferred — activation-driven sync only.

## Technical Approach & Suggestions

**Files to create/modify:**

```
apps/web/app/(student)/
├── layout.tsx                       # extend: ActiveChildProvider + parent-corner slot
├── select-profile/page.tsx
├── home/page.tsx
└── world/[worldId]/page.tsx         # topics → lesson tiles (single screen, accordion-style topic sections)
apps/web/components/student/
├── profile-card.tsx                 # big avatar card (≥120px avatar, whole card tappable)
├── world-card.tsx                   # palette-driven gradient + mascot + name
├── lesson-tile.tsx                  # picture tile, speaks name on tap, then navigates
├── reward-strip.tsx                 # stars / coins / streak chip
└── parent-corner.tsx                # lock icon + PinGate + navigate
apps/web/lib/
├── content-api.ts                   # getWorlds / getTopics / getLessons (typed)
├── active-child.tsx                 # ActiveChildProvider + useActiveChild() (fetch /api/children/active, activate())
└── use-screen-narration.ts
apps/web/locales/{en,bn}/student.json
```

**Key contracts:**

```ts
// lib/active-child.tsx
export function useActiveChild(): {
  child: ActiveChild | null;          // { id, name, avatar, grade, language, stars, coins, currentStreak }
  loading: boolean;
  activate: (childId: string) => Promise<ApiResult<ActiveChild>>; // POSTs, refreshes, syncs i18n locale
  refresh: () => Promise<void>;
};

// world-card.tsx — data-driven theming (FR-WORLD-05)
export function WorldCard(props: {
  world: World;                       // { id, slug, name, palette: { from: string; to: string }, mascotUrl }
  onPress: () => void;
}): JSX.Element;
// style={{ background: `linear-gradient(160deg, ${world.palette.from}, ${world.palette.to})` }}
// — palette is content data, the one sanctioned exception to the no-raw-hex rule (design.md §2.2 "decorative game art").

// lesson-tile.tsx
export function LessonTile(props: {
  lesson: LessonSummary;              // { id, title, thumbnailUrl, nameAudioUrl }
  onOpen: (lessonId: string) => void;
}): JSX.Element;
// onTap: audio.play(lesson.nameAudioUrl); props.onOpen(lesson.id)
```

**Screen narration:** `useScreenNarration("selectProfile")` runs in `useEffect` on mount, resolves locale from i18next, calls `useAudio().play(url, { interrupt: true })` — single-channel guarantees navigating to a new screen stops the previous narration. Skip silently (no error UI) if the asset 404s — real UI narration assets land with file 36; until then place 1-second placeholder mp3s under `public/audio/ui/`.

**Route guards:** `(student)/layout.tsx` wraps children in `ActiveChildProvider`; `/home` and `/world/*` redirect to `/select-profile` when `child === null` after load. `/select-profile` itself lists via `children-api.listChildren()` (session-authenticated; no PIN — listing names+avatars for selection is the designed FR-AUTH-06 behavior; PIN guards only `/parent/*`).

**Cold start:** all three screens render mascot-illustrated skeletons while `apiFetch` retries; surface the `onColdStart` callback as a "{mascot} is waking up…" message (NFR-PERF-04, localized).

**Counters:** `RewardStrip` renders pill chips using `--brand-sunshine` star icon + coin icon + flame; values straight from `useActiveChild().child`. With `currentStreak === 0` render the flame at reduced opacity with label "Start a streak!" — never hide it (predictability for kids).

## Step-by-Step Plan

1. Add `student.json` locales (EN/BN) and `content-api.ts` typed wrappers; drop placeholder UI audio files into `public/audio/ui/`. (~20 min)
2. Write failing tests for `useActiveChild`/`ActiveChildProvider`: activate POSTs and updates state, locale syncs to child.language (mock i18n), null child before activation. Implement. (~30 min)
3. Implement `useScreenNarration` with a test asserting `play` is called once on mount with the locale-resolved URL. (~15 min)
4. Build `ProfileCard` + `/select-profile` page: card grid, tap → activate → router.push("/home"); empty-state mascot prompt; test activation wiring. (~30 min)
5. Build `RewardStrip` with tests: renders values, 0-state dimmed streak chip. (~20 min)
6. Build `WorldCard` + `/home`: fetch worlds, render data-driven cards, mount narration, reward strip; test that card styling comes from `world.palette` (assert inline style). (~30 min)
7. Build `LessonTile` + `/world/[worldId]`: topic sections with lesson tile grids; test tap plays `nameAudioUrl` then calls `onOpen`. (~30 min)
8. Build `ParentCorner` (lock icon, top corner, opens PinGate, success → `/parent/children`); add to `(student)/layout.tsx`. (~15 min)
9. Add the no-external-links test: render each student screen with mocked data and assert no anchor has an `http(s)://` href to a foreign origin (NFR-SAFE-07). Manual orientation pass at 360×640, 640×360, 768×1024. (~25 min)
10. `pnpm lint && pnpm typecheck && pnpm --filter web test`; update tracker. (~10 min)

## Acceptance Criteria

- [ ] `pnpm lint` and `pnpm typecheck` pass
- [ ] `pnpm --filter web test` passes including: active-child provider, screen narration, profile activation, world card palette-driven styling, lesson tile audio-then-navigate, reward strip 0-state, no-external-links sweep
- [ ] Manual (server files 09–12 running, seeded content): select a child → home shows Jungle + Ocean cards styled from API palette data with mascots and localized names
- [ ] Switching to a second child via `/select-profile` requires **no PIN** (FR-AUTH-06); home content changes to that child's grade/language (FR-PROF-03)
- [ ] A child whose profile language is `bn` sees the whole student surface flip to Bangla on activation
- [ ] Stars/coins/streak show API values; a brand-new child shows 0s and the dimmed streak chip without errors (FR-GAM-06 display)
- [ ] Tapping a lesson tile speaks its name and navigates to `/lesson/[id]` (404/placeholder until file 16 — route push is what's verified)
- [ ] Parent corner opens the PIN modal; correct PIN lands on `/parent/children`; wrong PIN stays locked
- [ ] Every screen usable in portrait and landscape at phone and tablet sizes; all tap targets ≥64px

## Out of Scope

- The lesson player itself — `/lesson/[id]` is built in file 16
- Real reward computation, streak math, badge/character displays beyond the strip (files 23–24)
- Story library entry point on home (file 25 adds its tile)
- Screen-time lockout states on home (file 28)
- A student-surface settings screen with its own language switch (post-15 polish; activation-sync covers FR-I18N-02 for now)
- Real mascot/world art and UI narration audio — placeholders until files 33/36
