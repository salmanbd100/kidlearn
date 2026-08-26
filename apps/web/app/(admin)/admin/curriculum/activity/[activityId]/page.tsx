import { ActivityEditorScreen } from "./ActivityEditorScreen";

/**
 * `/admin/curriculum/activity/[activityId]` — the activity editor (FR-ACT-06).
 *
 * `params` is a Promise in Next 16 and is awaited here, so the client boundary
 * starts below with a plain string prop. The screen fetches its own data — see
 * the recorded exception in `frontend.md §2`.
 */
export default async function AdminActivityPage({
  params,
}: {
  params: Promise<{ activityId: string }>;
}) {
  const { activityId } = await params;

  return <ActivityEditorScreen activityId={activityId} />;
}
