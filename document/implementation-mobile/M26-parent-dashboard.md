# M26 — Parent Dashboard

> **Estimated effort:** 4–5 hours
> **Depends on:** M08, M09, M10, M24
> **Requirement IDs:** FR-DASH-01, FR-DASH-02, FR-DASH-03, FR-DASH-04, FR-AUTH-07 (sign-out entry)
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

The parent's landing screen: a child switcher, learning minutes for today / this week / this month, per-subject progress bars with strongest and weakest highlighted, and a recent-activity timeline — all from **one** request per child, with warm empty states for a brand-new learner. Plus the `(parent)` navigation that mirrors web's `ParentTopBar`: Dashboard / Children / Reports, "Back to kid mode", the language switch and an account menu with sign-out.

## Context & Current State

- `GET /api/children/:id/dashboard` (parent session + ownership; not consent-gated) returns everything the screen needs in one call — `DashboardSummarySchema` / `DashboardData` in `packages/types/src/api/dashboard.ts`:
  - `learningMinutes: { today, week, month }` (FR-DASH-02, from the server's `getLearningMinutes`, in `APP_TIMEZONE`);
  - `subjects[]` — `{ subjectId, slug, name: { en, bn | null }, completed, total (positive), percent (0–100 int) }`, highest percent first, with subjects whose total is 0 **omitted** (FR-DASH-03);
  - `strongestSubjectId` / `weakestSubjectId` — both `null` when fewer than two subjects have `total > 0` or when every percent is 0, because "a brand-new child has no 'weak area'";
  - `recentActivity[]` — newest first, up to `RECENT_ACTIVITY_LIMIT` (20) items `{ type, refId, title: { en, bn | null }, occurredAt }` of `DASHBOARD_ACTIVITY_TYPES` (`lesson_completed`, `story_completed`, `badge_earned`) (FR-DASH-04).
  - Every schema is `.strict()`.
- `GET /api/children/:id/learning-time?range=today|week|month` → `{ range, minutes, from, to }` (`packages/types/src/api/learning-time.ts`) uses the same server function (`getLearningMinutesForRanges`), so the dashboard's three figures equal it by construction. The dashboard does not call it; it is the cross-check in the device pass. Weeks start Monday in `APP_TIMEZONE`.
- The web implementation is `apps/web/app/(parent)/parent/page.tsx` + `DashboardScreen.tsx`, with the pieces in `apps/web/features/children/` (`DashboardSummary`, `ChildSwitcher`, `SubjectProgressCard`, `ActivityTimeline`, `dashboard-api.ts`, `localized-label.ts`) and `shared/components/StatCard.tsx`. Its decisions to carry over: one call per child, **no chart library** (pure layout bars), `Intl.RelativeTimeFormat` for dates via a tested helper (`shared/lib/relative-time.ts`), minutes through `features/screen-time/duration.ts` (`formatMinutes`), a presentational summary component fed fixtures so the test needs no network, and an "Open report" button that carries the selected child to `/parent/reports?child=<id>`. Web's `getDashboard` does not parse the response; mobile does (requirement 1).
- **Web's parent navigation** is `apps/web/app/(parent)/ParentTopBar.tsx`: wordmark, nav links Dashboard / Children / Reports (`nav.dashboard`, `nav.children`, `nav.reports`), a "Back to kid mode" button (→ `/select-profile`, on the bar because nobody found it in the menu), `LanguageSwitch`, and an avatar menu (name, email, Sign out). It renders nothing during onboarding. Sign-out failure keeps the parent where they are with `nav.signOutFailed`, rather than navigating as if it had worked. `document/mobile-app-plan.md` §8 ("parent top bar") maps this to a `Stack.Screen` header plus a bottom tab or segmented control, and an ActionSheet for the account menu. There is **no admin entry** on mobile (D1).
- A 404 on a child route means "not yours or not there" (`loadOwnedChild`) — never distinguish them.
- The parent area is reached from the signed-in Google/Apple session only (M07); M09 provides the child list and `ChildCard`; M03 provides `lib/format.ts` (`formatRelative`, `formatMinutes`, the latter matching web's `duration.ts` — lift it rather than copy if it is not shared yet, D6) — already verified for Bengali on Android. M07 provides `signOut()`; M08 provides the settings screen (language, sign-out, account deletion) that the account menu opens.
- M05 gives `Card`, `EmptyState`, `Spinner`; M04 gives `useApi`, `ColdStartNotice`, `OfflineNotice`.
- The web app keeps the selected child in the URL (`?child=<id>`) so refresh and back work. On mobile the equivalent is a **router param**, and the reason is the same: process death and restore must not lose the selection.

## Detailed Requirements

1. **`lib/dashboard-api.ts`** — `getDashboard(childId)` returning `ApiResult<DashboardData>`, parsed with `DashboardSummarySchema`. This is a screen whose numbers a parent will act on, so parse it rather than trusting the shape.
2. **Dashboard screen** (`app/(parent)/index.tsx`) — the parent landing route. Structure:
   - **Child switcher**: a horizontally scrollable segmented control of avatar + first name; the first child selected by default; the selection held in a router param so it survives a restore. Switching refetches only the dashboard.
   - **Three minute cards** (Today / This week / This month) using `formatMinutes` — "1h 35m" past 60 minutes, matching the web app exactly.
   - **Subject progress card**: one labelled bar per subject rendered as two nested `View`s with a percentage width (no chart library), plus "Strongest" and "Needs practice" chips when the ids are non-null.
   - **Activity timeline**: type icon, localised title, and a relative date from `formatRelative`, newest first, capped at what the server sent.
3. **One request.** The screen makes exactly one dashboard call per selected child, plus the child list it already has from M09's provider. No per-subject or per-activity follow-ups.
4. **Localised titles.** `title[locale] ?? title.en` (both `title` and subject `name` are `{ en, bn | null }` label objects, not resolved strings) through `lib/localized-label.ts`. Subject names likewise — never a slug on screen.
5. **Empty states, per card.** A child with no activity: zero-state minute cards ("No learning time yet" rather than "0m" as a headline), the progress card without highlight chips, and a warm activity empty state naming the child ("No adventures yet — Rina's progress will appear here!"). No `NaN%`, no empty chips, no bare zeros presented as failure.
6. **No children.** A parent with zero children is sent to the first-child onboarding screen by M08's `lib/parent-redirect.ts` (web's `resolveParentRedirect`: 0 children → first child) — never re-derive that rule here. The dashboard only renders a brief loading state until the redirect lands, as web does after the last profile is deleted.
6a. **Report link.** An "Open report" action carries the selected child into M27's reports screen as a route param.
7. **Pull to refresh.** A `RefreshControl` on the scroll view: it is the native idiom, and a parent checking progress mid-afternoon expects to be able to pull. Refetch the dashboard only, not the child list.
8. **Accessibility of the numbers.** Each bar carries an `accessibilityLabel` with the subject name and the percentage as words ("Language, 35 percent complete") and an `accessibilityValue`. A bar that only a sighted user can read is not a report. Chips announce their meaning, not just their colour.
8a. **Parent navigation** (`app/(parent)/_layout.tsx`). Mirror `ParentTopBar`: the three sections (Dashboard / Children / Reports) as bottom tabs or a header segmented control; in the header, "Back to kid mode" (→ the profile picker, M10; a visible labelled control, not buried in the menu), the M03 language switch, and the parent avatar opening an ActionSheet with name, email, Settings (M08) and Sign out (M07's `signOut()`, FR-AUTH-07). Hidden on the onboarding routes. A failed sign-out keeps the parent in place with an error, never navigates. No admin, no link to the public site.
9. **Layout.** Phone: single column, cards stacked, switcher pinned above. Tablet/landscape: two columns (minutes + subjects left, timeline right). Parent surface, so ≥44px targets and Inter — but the parent dashboard "must be fully manageable on a phone" (design.md §6), so the phone layout is the primary case, not the fallback.
10. **Tests** (`app/(parent)/index.test.tsx`, `components/parent/DashboardSummary.test.tsx`, `lib/dashboard-api.test.ts`): the summary renders stat values, bar widths, and both highlight chips from a fixture; a brand-new child renders every empty state with no `NaN` and no chips; switching children refetches and keeps the selection across a remount; a 404 renders a not-found state; the timeline renders one row per item with the right icon and a relative date; minute formatting matches the web app for 5, 59, 60, 95 and 310; a cold start shows the notice; pull-to-refresh refetches; the parent layout shows the three sections and hides them on onboarding routes; "Back to kid mode" routes to the profile picker; Sign out calls `signOut()` and a failure leaves the parent in place.

## Technical Approach & Suggestions

```
apps/mobile/lib/dashboard-api.ts
apps/mobile/lib/dashboard-api.test.ts
apps/mobile/app/(parent)/_layout.tsx                   # nav header, sections, account ActionSheet
apps/mobile/app/(parent)/_layout.test.tsx
apps/mobile/app/(parent)/index.tsx
apps/mobile/app/(parent)/index.test.tsx
apps/mobile/components/parent/ChildSwitcher.tsx
apps/mobile/components/parent/DashboardSummary.tsx      # presentational, fixture-driven
apps/mobile/components/parent/DashboardSummary.test.tsx
apps/mobile/components/parent/StatCard.tsx
apps/mobile/components/parent/SubjectProgressCard.tsx
apps/mobile/components/parent/ActivityTimeline.tsx
```

Keep the summary purely presentational so its test needs no network — the same split the web app uses:

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

Minute formatting must come from `lib/format.ts` (M03) and must agree with `apps/web/features/screen-time/duration.ts` — spot-check the five values in the test rather than trusting two implementations to have drifted the same way.

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
8a. Build the `(parent)` navigation header, sections and account ActionSheet against `ParentTopBar.tsx`, with its test. (~40 min)
9. Device pass: a seeded child and a brand-new child, EN and BN (check Bengali numerals in minutes and relative dates), phone and tablet, TalkBack across every bar and chip, and a spot-check that the minutes match `GET /api/children/:id/learning-time` for the same ranges. (~40 min)
10. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] The screen renders from exactly **one** `GET /api/children/:id/dashboard` call per selected child, plus the child list already in memory.
- [ ] Minutes match `GET /api/children/:id/learning-time` for the same ranges, and format identically to the web app for 5, 59, 60, 95 and 310.
- [ ] Subject bars render with pure layout (no chart library) at the server's percentages; subjects with `total === 0` never appear.
- [ ] Strongest / needs-practice chips appear only when the server sends non-null ids, and are absent for a brand-new child.
- [ ] The activity timeline shows the server's items newest first with the right icon, a localised title and a relative date, capped at `RECENT_ACTIVITY_LIMIT`.
- [ ] A brand-new child renders warm empty states everywhere: no `NaN%`, no bare zeros as headlines, no empty chips.
- [ ] Switching children refetches the dashboard, and the selection survives an app restore.
- [ ] A 404 renders a not-found state and never distinguishes "not yours" from "does not exist".
- [ ] Pull-to-refresh refetches the dashboard.
- [ ] Every bar and chip is announced meaningfully by TalkBack and VoiceOver, with a percentage value.
- [ ] Bengali renders localised numerals in minutes and relative dates (the M03 `Intl` work paying off).
- [ ] The whole screen is usable on a phone; the tablet layout is an enhancement.
- [ ] The parent navigation offers Dashboard / Children / Reports, "Back to kid mode", the language switch and an account menu with Settings and Sign out; it is hidden during onboarding and has no admin entry.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- Weekly reports — M27.
- Screen-time settings — M25, though the child cards link there.
- Charts, per-topic drill-downs and quiz-level analytics. The web plan defers these to Phase 2; mobile does not get ahead of it.
- Exporting or sharing a child's progress. Sharing a child's data needs a privacy decision, not a share sheet.
- Comparison between children or against other families. Against the product's tone and a privacy risk.
- Admin platform analytics — web-only (`apps/web/features/admin/`).
