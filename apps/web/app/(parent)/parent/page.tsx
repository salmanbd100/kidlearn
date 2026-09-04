import { DashboardScreen } from "./DashboardScreen";

/**
 * `/parent` — the dashboard, and where the Google callback lands
 * (`PARENT_POST_LOGIN_PATH`, default `/parent`).
 */
export default async function ParentDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { child } = await searchParams;
  // A repeated `?child=a&child=b` arrives as an array. The first wins rather than
  // the request being rejected — a malformed query parameter is not worth an error
  // screen, and `DashboardScreen` falls back to the first profile for an id it
  // cannot match anyway.
  const selectedChildId = Array.isArray(child) ? child[0] : child;

  return <DashboardScreen selectedChildId={selectedChildId} />;
}
