import { ReportsScreen } from "./ReportsScreen";

export default async function ParentReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { child, week } = await searchParams;

  // A repeated `?child=` arrives as an array; first wins rather than erroring on a malformed param.
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
