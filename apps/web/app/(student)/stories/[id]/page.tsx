import { StoryReader } from "@/components/student/story-reader/StoryReader";
import { StudentGuard } from "../../StudentGuard";

/** One story, read a page at a time (FR-STORY-02..03, FR-STORY-06..07). */
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
