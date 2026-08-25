import { LessonPlayer } from "@/components/lesson/LessonPlayer";
import { StudentGuard } from "../../StudentGuard";
import { LessonPreviewGate } from "./LessonPreviewGate";

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
 * **`?preview=1` asks for the administrator preview; it does not grant it** (file
 * 33, FR-CMS-04). The parameter only chooses which client component renders:
 * `LessonPreviewGate` confirms an admin session against the API before skipping
 * the guard or suppressing a single write, and hands anyone else the ordinary
 * guarded player. The check cannot be made here — the admin session cookie belongs
 * to the API origin, so a Server Component asking would send no credentials.
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

  if (query.preview === "1") {
    return (
      <LessonPreviewGate
        lessonId={id}
        previewLanguage={query.lang === "bn" ? "bn" : "en"}
      />
    );
  }

  return (
    <StudentGuard>
      <LessonPlayer lessonId={id} />
    </StudentGuard>
  );
}
