"use client";

import { STUDENT_NAMESPACE } from "@kidlearn/i18n";
import type { StorySummaryResponse } from "@kidlearn/types";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listStories } from "@/features/content/content-api";
import { StoryGrid } from "@/features/stories/StoryGrid";
import { BigButton } from "@/shared/components/kid/BigButton";
import { Retryable } from "@/shared/components/kid/Retryable";
import { StudentStatus } from "@/shared/components/kid/StudentStatus";
import { useScreenNarration } from "@/shared/hooks/use-screen-narration";

export function StoriesScreen() {
  return <Retryable>{(retry) => <StoriesContent onRetry={retry} />}</Retryable>;
}

function StoriesContent({ onRetry }: { onRetry: () => void }) {
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
      {/* Back at top-left, opposite the parent-corner lock, so the two exits can't be mis-tapped. */}
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
        <StudentStatus tone="alert" onRetry={onRetry}>
          {t("status.error")}
        </StudentStatus>
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
