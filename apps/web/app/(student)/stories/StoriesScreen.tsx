"use client";

import type { StorySummaryResponse } from "@kidlearn/types";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BigButton } from "@/components/kid/BigButton";
import { StoryGrid } from "@/components/student/StoryGrid";
import { listStories } from "@/lib/content-api";
import { STUDENT_NAMESPACE } from "@/lib/i18n";
import { useScreenNarration } from "@/lib/use-screen-narration";
import { StudentStatus } from "../StudentGuard";

/** The Story Library (FR-STORY-01). */
export function StoriesScreen() {
  const { t } = useTranslation(STUDENT_NAMESPACE);
  const router = useRouter();
  const [stories, setStories] = useState<StorySummaryResponse[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [isWakingUp, setIsWakingUp] = useState(false);

  useScreenNarration("stories");

  useEffect(() => {
    let isCurrent = true;
    void listStories({
      onColdStart: () => {
        if (isCurrent) setIsWakingUp(true);
      },
    }).then((result) => {
      if (!isCurrent) return;
      setIsWakingUp(false);
      if (result.ok) {
        setStories(result.data.stories);
        setStatus("ready");
        return;
      }
      setStatus("error");
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      {/* Back at the top-left, opposite the parent-corner lock — the two exits
          from a screen are never adjacent enough to mis-tap between. */}
      <div className="pr-14">
        <BigButton
          variant="secondary"
          icon={<ArrowLeft aria-hidden="true" />}
          onPress={() => router.push("/home")}
        >
          {t("stories.back")}
        </BigButton>
      </div>

      <h1 className="font-display text-2xl text-foreground sm:text-3xl">
        {t("stories.title")}
      </h1>

      {status === "loading" ? (
        <StudentStatus tone="status">
          {isWakingUp ? t("status.waking") : t("selectProfile.loading")}
        </StudentStatus>
      ) : status === "error" ? (
        <StudentStatus tone="alert">{t("status.error")}</StudentStatus>
      ) : stories.length === 0 ? (
        <StudentStatus tone="status">{t("stories.empty")}</StudentStatus>
      ) : (
        <>
          <p className="font-display text-foreground text-xl">
            {t("stories.pick")}
          </p>
          <StoryGrid
            stories={stories}
            onOpen={(storyId) => router.push(`/stories/${storyId}`)}
          />
        </>
      )}
    </main>
  );
}
