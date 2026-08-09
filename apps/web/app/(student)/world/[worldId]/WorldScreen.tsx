"use client";

import type { WorldTopicLessonsResponse } from "@kidlearn/types";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BigButton } from "@/components/kid/BigButton";
import { LessonTile } from "@/components/student/LessonTile";
import { listWorldLessons } from "@/lib/content-api";
import { STUDENT_NAMESPACE } from "@/lib/i18n";
import { useScreenNarration } from "@/lib/use-screen-narration";
import { StudentStatus } from "../../StudentGuard";

/**
 * Everything inside one world, as pictures (FR-PROF-03).
 *
 * One request, and no filtering afterwards. `GET /api/content/worlds/:id/lessons`
 * returns this world's lessons already grouped under their topic headings and
 * already narrowed to the child's grade and language — the server reads both from
 * the active profile, so there is nothing for this screen to decide and no way for
 * it to widen what a child can see.
 *
 * Tapping a tile speaks the lesson's name and navigates on the same tap. That
 * ordering is deliberate and it works because the audio channel is a single
 * element that outlives this tree: the name carries into the lesson that is
 * already loading instead of being cut off by the unmount.
 */
export function WorldScreen({ worldId }: { worldId: string }) {
  const { t } = useTranslation(STUDENT_NAMESPACE);
  const router = useRouter();
  const [topics, setTopics] = useState<WorldTopicLessonsResponse[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "gone">(
    "loading",
  );
  const [isWakingUp, setIsWakingUp] = useState(false);

  useScreenNarration("world");

  useEffect(() => {
    let isCurrent = true;
    void listWorldLessons(worldId, {
      onColdStart: () => {
        if (isCurrent) setIsWakingUp(true);
      },
    }).then((result) => {
      if (!isCurrent) return;
      setIsWakingUp(false);
      if (result.ok) {
        setTopics(result.data.topics);
        setStatus("ready");
        return;
      }
      // A world that was unpublished while the child was looking at the home
      // screen is a `404`, and it is not a failure to apologise for — it is a
      // door that closed. Anything else is a real error.
      setStatus(result.error.code === "NOT_FOUND" ? "gone" : "error");
    });
    return () => {
      isCurrent = false;
    };
  }, [worldId]);

  const hasLessons = topics.some((topic) => topic.lessons.length > 0);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      {/* Back sits at the top-left, opposite the parent lock: the two exits from
          a screen should never be adjacent enough to mis-tap between. */}
      <div className="pr-14">
        <BigButton
          variant="secondary"
          icon={<ArrowLeft aria-hidden="true" />}
          onPress={() => router.push("/home")}
        >
          {t("world.back")}
        </BigButton>
      </div>

      {status === "loading" ? (
        <StudentStatus tone="status">
          {isWakingUp ? t("status.waking") : t("selectProfile.loading")}
        </StudentStatus>
      ) : status === "error" ? (
        <StudentStatus tone="alert">{t("status.error")}</StudentStatus>
      ) : status === "gone" ? (
        <StudentStatus tone="status">{t("world.notFound")}</StudentStatus>
      ) : !hasLessons ? (
        <StudentStatus tone="status">{t("world.empty")}</StudentStatus>
      ) : (
        topics.map((topic) => (
          <section key={topic.id} className="flex flex-col gap-4">
            <h2 className="font-display text-foreground text-xl">
              {topic.name}
            </h2>
            {/* Two up on a phone, wider on a tablet or in landscape. Tiles are
                square, so this scales without any tile dropping below 64px. */}
            <ul className="grid grid-cols-2 gap-4 landscape:grid-cols-3 sm:grid-cols-3 lg:grid-cols-4">
              {topic.lessons.map((lesson) => (
                <li key={lesson.id} className="contents">
                  <LessonTile
                    lesson={lesson}
                    onOpen={(lessonId) => router.push(`/lesson/${lessonId}`)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
