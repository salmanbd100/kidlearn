import { AiJobDetailScreen } from "./AiJobDetailScreen";

/**
 * `/admin/ai-queue/[id]` — one generation, read and decided (file 37,
 * FR-CMS-05..06).
 */
export default async function AdminAiJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <AiJobDetailScreen jobId={id} />;
}
