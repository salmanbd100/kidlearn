import { LessonPlayer } from "@/components/lesson/LessonPlayer";
import { StudentGuard } from "../../StudentGuard";

/**
 * One lesson, start to finish (FR-LSN-01..07).
 *
 * `params` and `searchParams` are Promises in Next 16 and are awaited here, in the
 * Server Component, so the client boundary starts below with plain props.
 *
 * `StudentGuard` is what makes the redirect-without-an-active-child requirement
 * hold: it sends a child with no picked profile to `/select-profile`, which the
 * player itself must not do — the whole progress API answers `403` without an active
 * profile, so a lesson has nothing to render and nowhere to save.
 *
 * **`?preview=1` skips that guard, and only that guard** (file 33, FR-CMS-04). An
 * administrator has no child profile and never will, so `StudentGuard` would bounce
 * them to `/select-profile` before the player mounted. Nothing about the skip grants
 * access: the API ignores `preview=1` unless an `AdminUser` row backs the session,
 * so a signed-out visitor or a curious parent typing the parameter here gets the
 * player and then the same `404` a draft lesson always gives them.
 *
 * The route stays inside `(student)` deliberately. The point of the preview is to
 * see what a child sees, and the kid theme, the safe-area padding and the audio
 * provider all come from that layout — a copy of the route under `(admin)` would be
 * a second, drifting arrangement of the thing under review.
 */
export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);

  const isPreview = query.preview === "1";
  const previewLanguage = query.lang === "bn" ? "bn" : "en";

  if (isPreview) {
    return (
      <LessonPlayer lessonId={id} isPreview previewLanguage={previewLanguage} />
    );
  }

  return (
    <StudentGuard>
      <LessonPlayer lessonId={id} />
    </StudentGuard>
  );
}
