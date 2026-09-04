import { StudentGuard } from "../../StudentGuard";
import { WorldScreen } from "./WorldScreen";

/** Lesson browsing inside one world (FR-PROF-03). */
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
