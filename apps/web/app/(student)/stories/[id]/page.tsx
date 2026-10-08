import { StudentGuard } from "@/app/(student)/StudentGuard";
import { StoryReader } from "@/features/stories/reader/StoryReader";

export default async function StoryReaderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <StudentGuard>
      <StoryReader storyId={id} />
    </StudentGuard>
  );
}
