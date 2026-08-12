import { LessonPlayer } from "@/components/lesson/LessonPlayer";
import { StudentGuard } from "../../StudentGuard";

/**
 * One lesson, start to finish (FR-LSN-01..07).
 *
 * `params` is a Promise in Next 16 and is awaited here, in the Server Component, so
 * the client boundary starts below it with a plain string prop.
 *
 * `StudentGuard` is what makes the redirect-without-an-active-child requirement
 * hold: it sends a child with no picked profile to `/select-profile`, which the
 * player itself must not do — the whole progress API answers `403` without an active
 * profile, so a lesson has nothing to render and nowhere to save.
 */
export default async function LessonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <StudentGuard>
      <LessonPlayer lessonId={id} />
    </StudentGuard>
  );
}
