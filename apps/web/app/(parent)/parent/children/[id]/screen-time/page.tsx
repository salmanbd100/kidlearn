import { ScreenTimeScreen } from "./ScreenTimeScreen";

/**
 * `params` is a Promise in Next.js 16 — synchronous access was removed, not just
 * deprecated (see `apps/web/AGENTS.md`). Awaiting it here keeps the client
 * component below free of routing concerns: it receives an id, not a route.
 */
export default async function ParentScreenTimePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ScreenTimeScreen childId={id} />;
}
