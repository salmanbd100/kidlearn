import { ActivityEditorScreen } from "./ActivityEditorScreen";

export default async function AdminActivityPage({
  params,
}: {
  params: Promise<{ activityId: string }>;
}) {
  const { activityId } = await params;

  return <ActivityEditorScreen activityId={activityId} />;
}
