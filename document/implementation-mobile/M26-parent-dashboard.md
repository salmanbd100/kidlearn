# M26 — Parent Dashboard

> **Estimated effort:** 3–4 hours
> **Depends on:** M09, M24
> **Requirement IDs:** FR-DASH-01, FR-DASH-02, FR-DASH-03, FR-DASH-04
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

The parent's landing screen: a child switcher, learning minutes for today / this week / this month, per-subject progress bars with strongest and weakest highlighted, and a recent-activity timeline — all from **one** request per child, with warm empty states for a brand-new learner.

## Context & Current State

- `GET /api/children/:id/dashboard` (`requirePinVerified` + `loadOwnedChild`) returns everything the screen needs in one call — `DashboardSummarySchema` / `DashboardData` in `packages/types`:
  - `learningMinutes: { today, week, month }` (FR-DASH-02, from the server's `getLearningMinutes`, in `APP_TIMEZONE`);
  - `subjects[]` — `{ subjectId, slug, name (localised), completed, total, percent }`, with subjects whose `total === 0` **omitted** (FR-DASH-03);
  - `strongestSubjectId` / `weakestSubjectId` — both `null` when fewer than two subjects have `total > 0` or when every percent is 0, because "a brand-new child has no 'weak area'";
  - `recentActivity[]` — up to `RECENT_ACTIVITY_LIMIT` (20) merged items of `DASHBOARD_ACTIVITY_TYPES` (`lesson_completed`, `story_completed`, `badge_earned`) with a localised `title` and `occurredAt` (FR-DASH-04).
- The web implementation is `document/implementation/29-parent-dashboard.md` and `apps/web/app/(parent)/parent/page.tsx` + `components/parent/`. Its decisions to carry over: one call per child, **no chart library** (pure layout bars), `Intl.RelativeTimeFormat` for dates via a tested helper, and a presentational summary component fed fixtures so the test needs no network.
- A 404 on a child route means "not yours or not there" (`loadOwnedChild`) — never distinguish them.
- M08 puts this whole area behind `PinGate`; M09 provides the child list and `ChildCard`; M03 provides `lib/format.ts` (`formatRelative`, `formatMinutes`) — already verified for Bengali on Android, which is exactly why that check was done in phase M0.
- M05 gives `Card`, `EmptyState`, `Spinner`; M04 gives `useApi`, `ColdStartNotice`, `OfflineNotice`.
- The web app keeps the selected child in the URL (`?child=<id>`) so refresh and back work. On mobile the equivalent is a **router param**, and the reason is the same: process death and restore must not lose the selection.

## Detailed Requirements

1. **`lib/dashboard-api.ts`** — `getDashboard(childId)` returning `ApiResult<DashboardData>`, parsed with `DashboardSummarySchema`. This is a screen whose numbers a parent will act on, so parse it rather than trusting the shape.
2. **Dashboard screen** (`app/(parent)/index.tsx`) — the PIN-gated landing route. Structure:
   - **Child switcher**: a horizontally scrollable segmented control of avatar + first name; the first child selected by default; the selection held in a router param so it survives a restore. Switching refetches and must not drop the PIN grant.
   - **Three minute cards** (Today / This week / This month) using `formatMinutes` — "1h 35m" past 60 minutes, matching the web app exactly.
   - **Subject progress card**: one labelled bar per subject rendered as two nested `View`s with a percentage width (no chart library), plus "Strongest" and "Needs practice" chips when the ids are non-null.
   - **Activity timeline**: type icon, localised title, and a relative date from `formatRelative`, newest first, capped at what the server sent.
3. **One request.** The screen makes exactly one dashboard call per selected child, plus the child list it already has from M09's provider. No per-subject or per-activity follow-ups.
4. **Localised titles.** `title[locale] ?? title.en` through `lib/localized-label.ts`. Subject names likewise — never a slug on screen.
5. **Empty states, per card.** A child with no activity: zero-state minute cards ("No learning time yet" rather than "0m" as a headline), the progress card without highlight chips, and a warm activity empty state naming the child ("No adventures yet — Rina's progress will appear here!"). No `NaN%`, no empty chips, no bare zeros presented as failure.
6. **No children.** A parent with zero children is routed to the children screen (M09) — M08's onboarding flow guarantees one exists, but guard anyway, exactly as the web file does.
7. **Pull to refresh.** A `RefreshControl` on the scroll view: it is the native idiom, and a parent checking progress mid-afternoon expects to be able to pull. Refetch the dashboard only, not the child list.
8. **Accessibility of the numbers.** Each bar carries an `accessibilityLabel` with the subject name and the percentage as words ("Language, 35 percent complete") and an `accessibilityValue`. A bar that only a sighted user can read is not a report. Chips announce their meaning, not just their colour.
9. **Layout.** Phone: single column, cards stacked, switcher pinned above. Tablet/landscape: two columns (minutes + subjects left, timeline right). Parent surface, so ≥44px targets and Inter — but the parent dashboard "must be fully manageable on a phone" (design.md §6), so the phone layout is the primary case, not the fallback.
10. **Tests** (`app/(parent)/index.test.tsx`, `components/parent/DashboardSummary.test.tsx`, `lib/dashboard-api.test.ts`): the summary renders stat values, bar widths, and both highlight chips from a fixture; a brand-new child renders every empty state with no `NaN` and no chips; switching children refetches and keeps the selection across a remount; a 404 renders a not-found state; the timeline renders one row per item with the right icon and a relative date; minute formatting matches the web app for 5, 59, 60, 95 and 310; a cold start shows the notice; pull-to-refresh refetches.

## Technical Approach & Suggestions

```
apps/mobile/lib/dashboard-api.ts
apps/mobile/lib/dashboard-api.test.ts
apps/mobile/app/(parent)/index.tsx
apps/mobile/app/(parent)/index.test.tsx
apps/mobile/components/parent/ChildSwitcher.tsx
apps/mobile/components/parent/DashboardSummary.tsx      # presentational, fixture-driven
apps/mobile/components/parent/DashboardSummary.test.tsx
apps/mobile/components/parent/StatCard.tsx
apps/mobile/components/parent/SubjectProgressCard.tsx
apps/mobile/components/parent/ActivityTimeline.tsx
```

Keep the summary purely presentational so its test needs no network — the same split the web file uses:

```tsx
// The screen owns fetching, the summary owns rendering. That is what lets one
// test cover populated and empty states from fixtures.
export function DashboardSummary({ data, childName }: { data: DashboardData; childName: string }) {
  return (
    <>
      <View className="flex-row gap-3">
        <StatCard label={t("parent:today")} minutes={data.learningMinutes.today} />
        <StatCard label={t("parent:thisWeek")} minutes={data.learningMinutes.week} />
        <StatCard label={t("parent:thisMonth")} minutes={data.learningMinutes.month} />
      </View>
      <SubjectProgressCard
        subjects={data.subjects}
        strongestId={data.strongestSubjectId}
        weakestId={data.weakestSubjectId}
      />
      <ActivityTimeline items={data.recentActivity} childName={childName} />
    </>
  );
}
```

Bars are two views — no chart library at MVP, matching the web decision:

```tsx
<View
  accessibilityRole="progressbar"
  accessibilityLabel={t("parent:subjectProgressLabel", { subject: name, percent })}
  accessibilityValue={{ min: 0, max: 100, now: percent }}
  className="h-4 w-full overflow-hidden rounded-full bg-muted"
>
  <View style={{ width: `${percent}%` }} className="h-full rounded-full bg-primary" />
</View>
```

Hold the selected child in the route so a restore keeps it:

```tsx
const { child: childParam } = useLocalSearchParams<{ child?: string }>();
const selectedId = childParam ?? children[0]?.id;

function selectChild(id: string) {
  router.setParams({ child: id });     // survives process death + restore
}
```

Minute formatting must come from `lib/format.ts` (M03) and must agree with `apps/web/lib/duration.ts` — spot-check the five values in the test rather than trusting two implementations to have drifted the same way.

For the timeline icons, map `DASHBOARD_ACTIVITY_TYPES` to a `lucide-react-native` icon in one record, and give each row a text label as well: an icon-only timeline is unreadable to a screen reader and ambiguous to everyone else.

## Step-by-Step Plan

1. Write `lib/dashboard-api.ts` with `DashboardSummarySchema` parsing and its test; check the endpoint against the dev server with a seeded child and a brand-new one. (~30 min)
2. Build `StatCard` using `formatMinutes`; test the five formatting cases against the web app's output. (~25 min)
3. Build `SubjectProgressCard` with layout bars, chips and accessibility labels; test bar widths and chip suppression at all-zero. (~40 min)
4. Build `ActivityTimeline` with the icon map, localised titles and `formatRelative`; test row rendering and ordering. (~35 min)
5. Compose `DashboardSummary` and test it from fixtures in both populated and empty forms. (~30 min)
6. Build `ChildSwitcher` with the router-param selection; test that switching refetches and that the selection survives a remount. (~30 min)
7. Assemble the screen: fetch, loading, cold start, offline, 404, no-children redirect, pull-to-refresh. (~35 min)
8. Add the tablet/landscape two-column layout. (~20 min)
9. Device pass: a seeded child and a brand-new child, EN and BN (check Bengali numerals in minutes and relative dates), phone and tablet, TalkBack across every bar and chip, and a spot-check that the minutes match `GET /api/children/:id/learning-time` for the same ranges. (~40 min)
10. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] The screen renders from exactly **one** `GET /api/children/:id/dashboard` call per selected child, plus the child list already in memory.
- [ ] Minutes match `GET /api/children/:id/learning-time` for the same ranges, and format identically to the web app for 5, 59, 60, 95 and 310.
- [ ] Subject bars render with pure layout (no chart library) at the server's percentages; subjects with `total === 0` never appear.
- [ ] Strongest / needs-practice chips appear only when the server sends non-null ids, and are absent for a brand-new child.
- [ ] The activity timeline shows the server's items newest first with the right icon, a localised title and a relative date, capped at `RECENT_ACTIVITY_LIMIT`.
- [ ] A brand-new child renders warm empty states everywhere: no `NaN%`, no bare zeros as headlines, no empty chips.
- [ ] Switching children refetches without dropping the PIN grant, and the selection survives an app restore.
- [ ] A 404 renders a not-found state and never distinguishes "not yours" from "does not exist".
- [ ] Pull-to-refresh refetches the dashboard.
- [ ] Every bar and chip is announced meaningfully by TalkBack and VoiceOver, with a percentage value.
- [ ] Bengali renders localised numerals in minutes and relative dates (the M03 `Intl` work paying off).
- [ ] The whole screen is usable on a phone; the tablet layout is an enhancement.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- Weekly reports — M27 (and blocked on web file 30).
- Screen-time settings — M25, though the child cards link there.
- Charts, per-topic drill-downs and quiz-level analytics. The web plan defers these to Phase 2; mobile does not get ahead of it.
- Exporting or sharing a child's progress. Sharing a child's data needs a privacy decision, not a share sheet.
- Comparison between children or against other families. Against the product's tone and a privacy risk.
- Admin platform analytics — web-only (file 31).
