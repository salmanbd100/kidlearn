import { AiJobDetailScreen } from "./AiJobDetailScreen";

/**
 * `/admin/ai-queue/[id]` — one generation, read and decided (file 37,
 * FR-CMS-05..06).
 *
 * `params` is a Promise in Next 16 and is awaited here, in the Server Component,
 * so the client boundary starts below it with a plain string prop. The screen
 * itself fetches, for the reason recorded in `frontend.md §2`: the admin session
 * cookie belongs to the API origin.
 */
export default async function AdminAiJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <AiJobDetailScreen jobId={id} />;
}
