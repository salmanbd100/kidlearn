# M27 — Weekly Reports

> **Estimated effort:** 3–4 hours
> **Depends on:** M26, **web file 30**
> **Requirement IDs:** FR-DASH-05, FR-DASH-06
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Show the parent a week at a time: the newest weekly report as a report card (active days, minutes, lessons, stories, first-attempt quiz accuracy, new letters/words/numbers, badges earned, and the encouraging note) plus a list of past weeks. This is a read-only surface over a report the server generates.

## Blocking dependency

**Web file 30 must be ✅ Done before this file starts.** It creates the reports service, the `WeeklyReport` persistence, `GET /api/children/:id/reports`, and the `reports.notes.*` translation keys. Until then there is no endpoint to read and no note keys to render. If M27 is reached while file 30 is still outstanding, **skip it** — M28 does not depend on it, and the mobile dashboard ships without a reports tab. Do not stub a fake report shape; a placeholder here would be a second, wrong contract.

## Context & Current State

From `document/implementation/30-weekly-reports.md`, the contract this file consumes:

- `GET /api/children/:id/reports` — `requireParent` + `requirePinVerified` + ownership. Returns every report for the child ordered `weekStart desc`, and **lazily generates** the most recent completed week if it is missing. That means the first load after a week ends may be slower than usual — on a free-tier server, plan for it in the loading state.
- A report's `metrics` carries: `activeDays`, `learningMinutes`, `newLetters` / `newWords` / `newNumbers` (distinct prefixed tokens — `"letter:A"`, `"word:apple"`, `"number:7"`), `lessonsCompleted`, `storiesCompleted`, `quizAccuracy` (**`null` when there were no responses — never `NaN` or a defaulted 0**), and `badgesEarned` as `[{ slug, name }]`.
- The encouraging note is a **deterministic template**, stored as `{ noteKey, noteParams }` inside `metrics`, with the rendered English in the `note` column. The client renders `t('reports.notes.' + noteKey, noteParams)` so the note localises to EN/BN. The ordered rule list is `quietWeek → perfectWeek → quizStar → strongWeek → bookworm → steadyProgress → gentleNudge`.
- A week is **Monday 00:00 in `APP_TIMEZONE`**. The server validates that; the client only displays week ranges and must format them in the parent's locale without re-deriving the boundary.
- Unknown token prefixes are ignored by the aggregator, "never fatal" — the client must be equally tolerant: an unrecognised prefix renders as a plain token or is skipped, not as an error.
- Reports are generated server-side only; there is no client-triggered generation and no cron call from the app (that endpoint is bearer-secret protected for an external scheduler).

Also in place: M26's `ChildSwitcher` and the PIN-gated parent area, M03's `lib/format.ts` (locale-safe dates and minutes, Bengali-verified), M05's `Card` / `EmptyState`, M04's `useApi` and network states.

## Detailed Requirements

1. **Check the contract first.** Read `packages/types/src/api/` for the response schema web file 30 added, and use it. If file 30 shipped without a shared response schema, add one there (it is required by `standards/backend.md §7` anyway) rather than declaring a local type in `apps/mobile`.
2. **`lib/reports-api.ts`** — `listReports(childId)` returning `ApiResult<…>` parsed with the shared schema. Give this call a longer timeout than the M04 default: the lazy-generation path does real aggregation work on a cold free-tier server.
3. **Reports screen** (`app/(parent)/reports/index.tsx`) — inside the PIN gate, reusing M26's `ChildSwitcher` with the same router-param selection so switching children behaves identically on both screens.
4. **Report card** (`components/parent/ReportCard.tsx`) — for the newest report:
   - a week-range header formatted in the parent's locale ("12–18 Aug", not an ISO date);
   - a stat grid: active days (out of 7, as a shape row **and** a number), learning minutes via `formatMinutes`, lessons completed, stories completed, first-attempt quiz accuracy;
   - **`quizAccuracy === null` renders "Not enough answers yet", never "0%"** — the server deliberately distinguishes them and the UI must too;
   - new letters / words / numbers as counts with the actual tokens listed beneath (a parent wants to know *which* letters), each token rendered from its prefix with an unknown prefix degrading gracefully;
   - badges earned as chips with their names;
   - the encouraging note in a highlighted mascot speech bubble, rendered through `t('reports.notes.' + noteKey, noteParams)` with a fallback to the stored English `note` if the key is missing from the bundle (a note added server-side before the app's copy catches up must not render a raw key).
5. **Past weeks list** (`components/parent/PastWeeksList.tsx`) — one row per earlier report: week range, minutes, lessons completed. Tapping opens the same `ReportCard` for that week, either on a detail route (`app/(parent)/reports/[weekStart].tsx`) or by swapping the card in place. Prefer the detail route so the back gesture works as a parent expects.
6. **Empty states.** A child with no completed weeks → a warm explanation of when the first report will appear ("Rina's first weekly report arrives next Monday"), computed from the locale-formatted next Monday for display only. A brand-new child mid-first-week is the common case at launch, so this state matters more than the populated one on day one.
7. **Slow first load.** While the lazy generation runs, show a "putting this week together" state rather than a bare spinner, and let M04's cold-start notice handle the free-tier wake-up. Do not add a client-side timeout shorter than the generation takes.
8. **Accessibility.** Every stat has a text label as well as an icon; the active-days row is announced as "5 of 7 days"; the accuracy figure announces its null state in words. Parent surface, so ≥44px targets and Inter.
9. **Entry point.** A ≥44px "Weekly reports" entry on the dashboard (M26) and in the parent settings list.
10. **Tests** (`components/parent/ReportCard.test.tsx`, `PastWeeksList.test.tsx`, `app/(parent)/reports/index.test.tsx`): the card renders every metric from a fixture; `quizAccuracy: null` renders the "not enough answers" copy and never "0%"; an unknown token prefix does not break the token list; a missing `noteKey` falls back to the stored English note; the past-weeks list orders newest first and navigates to the right week; the empty state renders for a child with no reports; switching children refetches.

## Technical Approach & Suggestions

```
apps/mobile/lib/reports-api.ts
apps/mobile/lib/reports-api.test.ts
apps/mobile/app/(parent)/reports/index.tsx
apps/mobile/app/(parent)/reports/index.test.tsx
apps/mobile/app/(parent)/reports/[weekStart].tsx
apps/mobile/components/parent/ReportCard.tsx
apps/mobile/components/parent/ReportCard.test.tsx
apps/mobile/components/parent/PastWeeksList.tsx
apps/mobile/components/parent/ConceptTokens.tsx        # "letter:A" -> "A", grouped
```

The null-accuracy distinction, which is the single easiest thing to get wrong here:

```tsx
// The server returns null when there were no first attempts, precisely so this
// is not shown as a zero. A parent reading "0%" would conclude their child
// answered everything wrong.
{metrics.quizAccuracy === null ? (
  <Text variant="body">{t("parent:reports.accuracyUnavailable")}</Text>
) : (
  <Text variant="title">{formatNumber(metrics.quizAccuracy, locale)}%</Text>
)}
```

Token rendering, tolerant of prefixes the app does not know:

```tsx
const KNOWN = { letter: "letters", word: "words", number: "numbers" } as const;

export function conceptLabel(token: string): string | undefined {
  const [prefix, ...rest] = token.split(":");
  if (!(prefix in KNOWN) || rest.length === 0) return undefined;   // ignore, never throw
  return rest.join(":");
}
```

Note rendering with a safety net for copy drift:

```tsx
const key = `reports.notes.${report.metrics.noteKey}`;
const localised = i18n.exists(key, { ns: "parent" })
  ? t(key, { ns: "parent", ...report.metrics.noteParams })
  : report.note;                 // the server's rendered English fallback
```

Week ranges through `lib/format.ts`, never string-built:

```ts
export function formatWeekRange(weekStart: string, locale: Locale): string {
  const start = new Date(weekStart);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).formatRange(start, end);
}
```

(`formatRange` needs `Intl.DateTimeFormat` support that M03 already verified on Android; if the polyfill path was taken there, confirm `formatRange` exists in it and fall back to two formatted dates joined by an en dash if not.)

## Step-by-Step Plan

1. Confirm web file 30 is ✅ Done and read the response schema it added to `packages/types/src/api/`. If it is not done, stop and skip this file. (~15 min)
2. Write `lib/reports-api.ts` with the shared schema and a longer timeout; call it against the dev server for a child with and without reports. (~25 min)
3. Add `formatWeekRange` to `lib/format.ts` with its test, including the polyfill fallback if M03 took that path. (~25 min)
4. Build `ConceptTokens` with the unknown-prefix tolerance and its test. (~20 min)
5. Build `ReportCard` with the full stat grid, the null-accuracy branch, badge chips and the note bubble with its fallback; test each. (~50 min)
6. Build `PastWeeksList` and the `[weekStart]` detail route. (~30 min)
7. Assemble the reports screen with the child switcher, the "putting this week together" state, cold-start handling and the empty state. (~35 min)
8. Add the entry points on the dashboard and in settings. (~15 min)
9. Device pass: a child with several weeks of seeded data and a brand-new child, EN and BN (check Bengali numerals and the week range), phone and tablet, TalkBack across the stat grid, and one deliberate cold-start load to see the slow-generation state. (~35 min)
10. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] The screen reads `GET /api/children/:id/reports` using the response schema from `packages/types` — no locally declared report shape.
- [ ] `quizAccuracy === null` renders explanatory copy, never "0%".
- [ ] New letters, words and numbers show counts **and** the actual tokens; an unrecognised prefix is skipped without breaking the list.
- [ ] The encouraging note renders localised from `noteKey`/`noteParams`, falling back to the server's English `note` when the key is missing from the bundle.
- [ ] Week ranges are locale-formatted, never ISO strings or string-concatenated dates.
- [ ] Active days render as a shape row **and** a number ("5 of 7"), announced correctly by a screen reader.
- [ ] Past weeks list newest first and each opens that week's card with a working back gesture.
- [ ] A child with no completed weeks sees a warm explanation of when their first report arrives.
- [ ] The slow first load after a week ends shows the generation state rather than appearing broken, and no client timeout cuts it short.
- [ ] Switching children reuses M26's switcher and refetches.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- Generating reports, or calling the cron endpoint. Server-side, bearer-secret protected, and deliberately not reachable from the app.
- LLM-written notes. Web file 30 keeps the note deterministic behind a `selectNote` interface; if that producer is ever swapped, this client needs no change.
- PDF export, email or sharing a report. Sharing a child's data needs a privacy decision first.
- Charts. Same reasoning as M26 — the web plan defers them to Phase 2.
- Push notifications when a new report is ready — out of scope for the plan (§3.2).
