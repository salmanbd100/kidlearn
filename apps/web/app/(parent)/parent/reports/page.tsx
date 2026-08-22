import { ReportsScreen } from "./ReportsScreen";

/**
 * `/parent/reports` — the weekly report card and its history (FR-DASH-05..06).
 *
 * `searchParams` is a Promise in Next.js 16 — synchronous access was removed, not
 * just deprecated (see `apps/web/AGENTS.md`). Reading `?child=` and `?week=` here
 * rather than with `useSearchParams` below keeps the client component free of
 * routing concerns and needs no Suspense boundary: it receives two ids, not a route.
 */
export default async function ParentReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { child, week } = await searchParams;

  // A repeated `?child=a&child=b` arrives as an array. The first wins rather than
  // the request being rejected — a malformed query parameter is not worth an error
  // screen, and the screen below falls back for a value it cannot match anyway.
  return (
    <ReportsScreen
      selectedChildId={first(child)}
      selectedWeekStart={first(week)}
    />
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
