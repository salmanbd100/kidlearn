import { DashboardScreen } from "./DashboardScreen";

/**
 * `/parent` — the dashboard, and where the Google callback lands
 * (`PARENT_POST_LOGIN_PATH`, default `/parent`).
 *
 * It used to forward to the profile list, because there was no dashboard to show.
 * Now there is, and `ParentGuard` still does the deciding for anyone who has not
 * finished onboarding — a signed-out visitor is bounced to login, a half-onboarded
 * one to the step they stopped at.
 *
 * `searchParams` is a Promise in Next.js 16 — synchronous access was removed, not
 * just deprecated (see `apps/web/AGENTS.md`). Reading `?child=` here rather than
 * with `useSearchParams` below keeps the client component free of routing concerns
 * and needs no Suspense boundary: it receives an id, not a route.
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
