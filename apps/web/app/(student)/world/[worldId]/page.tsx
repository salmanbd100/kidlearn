import { StudentGuard } from "../../StudentGuard";
import { WorldScreen } from "./WorldScreen";

/**
 * Lesson browsing inside one world (FR-PROF-03).
 *
 * `params` is a Promise in Next 16 and is awaited here, in the Server Component,
 * so the client boundary starts below it with a plain string prop.
 */
export default async function WorldPage({
  params,
}: {
  params: Promise<{ worldId: string }>;
}) {
  const { worldId } = await params;

  return (
    <StudentGuard>
      <WorldScreen worldId={worldId} />
    </StudentGuard>
  );
}
