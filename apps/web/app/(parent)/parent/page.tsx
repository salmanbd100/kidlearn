import { DashboardScreen } from "./DashboardScreen";

export default async function ParentDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { child } = await searchParams;
  // A repeated `?child=` arrives as an array; first wins rather than erroring on a malformed param.
  const selectedChildId = Array.isArray(child) ? child[0] : child;

  return <DashboardScreen selectedChildId={selectedChildId} />;
}
