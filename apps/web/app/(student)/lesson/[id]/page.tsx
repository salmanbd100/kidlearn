import { LessonPlayer } from "@/components/lesson/LessonPlayer";
import { StudentGuard } from "../../StudentGuard";
import { LessonPreviewGate } from "./LessonPreviewGate";

/** One lesson, start to finish (FR-LSN-01..07). */
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
