import { ActivityEditorScreen } from "./ActivityEditorScreen";

/**
 * `/admin/curriculum/activity/[activityId]` — the activity editor (FR-ACT-06).
 */
export default async function AdminActivityPage({
  params,
}: {
  params: Promise<{ activityId: string }>;
}) {
  const { activityId } = await params;

  return <ActivityEditorScreen activityId={activityId} />;
}
