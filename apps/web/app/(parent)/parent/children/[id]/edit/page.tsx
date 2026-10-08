import { EditChildScreen } from "./EditChildScreen";

/** `params` is a Promise in Next.js 16; awaiting here keeps the client component free of routing concerns. */
export default async function ParentEditChildPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditChildScreen childId={id} />;
}
