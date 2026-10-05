import { AiJobDetailScreen } from "./AiJobDetailScreen";

export default async function AdminAiJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <AiJobDetailScreen jobId={id} />;
}
