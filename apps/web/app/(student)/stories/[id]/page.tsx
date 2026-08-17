import { StoryReader } from "@/components/student/story-reader/StoryReader";
import { StudentGuard } from "../../StudentGuard";

/**
 * One story, read a page at a time (FR-STORY-02..03, FR-STORY-06..07).
 *
 * `params` is a Promise in Next 16 and is awaited here, in the Server Component,
 * so the client boundary starts below it with a plain string prop.
 *
 * `StudentGuard` for the reason the lesson page gives: the whole content API
 * answers `403` without an active child profile, so a reader has nothing to fetch
 * and no locale to fetch it in.
 */
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
