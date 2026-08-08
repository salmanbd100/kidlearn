import { EditChildScreen } from "./EditChildScreen";

/**
 * `params` is a Promise in Next.js 16 — synchronous access was removed, not just
 * deprecated (see `apps/web/AGENTS.md` and the version-16 upgrade guide). Awaiting
 * it here keeps the client component below free of routing concerns: it receives an
 * id, not a route.
 */
export default async function ParentEditChildPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditChildScreen childId={id} />;
}
