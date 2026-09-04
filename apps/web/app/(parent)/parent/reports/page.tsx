import { ReportsScreen } from "./ReportsScreen";

/**
 * `/parent/reports` — the weekly report card and its history (FR-DASH-05..06).
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
