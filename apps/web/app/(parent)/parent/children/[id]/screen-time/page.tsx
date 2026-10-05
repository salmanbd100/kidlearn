import { ScreenTimeScreen } from "./ScreenTimeScreen";

/** `params` is a Promise in Next.js 16; awaiting here keeps the client component free of routing concerns. */
export default async function ParentScreenTimePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ScreenTimeScreen childId={id} />;
}
