import { StudentGuard } from "@/app/(student)/StudentGuard";
import { WorldScreen } from "./WorldScreen";

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
