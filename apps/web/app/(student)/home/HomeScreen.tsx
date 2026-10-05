"use client";

import { STUDENT_NAMESPACE } from "@kidlearn/i18n";
import type {
  RewardSummaryResponse,
  WorldSummaryResponse,
} from "@kidlearn/types";
import { BookOpen, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useActiveChild } from "@/features/children/active-child";
import { listWorlds } from "@/features/content/content-api";
import { WorldCard } from "@/features/content/WorldCard";
import { ScreenTimeLock } from "@/features/screen-time/ScreenTimeLock";
import { useScreenTimeGate } from "@/features/screen-time/use-screen-time-gate";
import { RewardStrip } from "@/features/student/RewardStrip";
import { STUDENT_ROUTES } from "@/features/student/student-routes";
import { getRewardsSummary } from "@/shared/api/progress-api";
import { BigButton } from "@/shared/components/kid/BigButton";
import { IconTile } from "@/shared/components/kid/IconTile";
import { Retryable } from "@/shared/components/kid/Retryable";
import { StudentStatus } from "@/shared/components/kid/StudentStatus";
import { useScreenNarration } from "@/shared/hooks/use-screen-narration";

export function HomeScreen() {
  return <Retryable>{(retry) => <HomeContent onRetry={retry} />}</Retryable>;
}

function HomeContent({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation(STUDENT_NAMESPACE);
  const router = useRouter();
  const { child } = useActiveChild();
  const [rewards, setRewards] = useState<RewardSummaryResponse | undefined>(
    undefined,
  );
  const [worlds, setWorlds] = useState<WorldSummaryResponse[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [isWakingUp, setIsWakingUp] = useState(false);

  useScreenNarration("home");
  const screenTime = useScreenTimeGate();

  useEffect(() => {
    let isCurrent = true;
    void listWorlds({
      onColdStart: () => {
        if (isCurrent) setIsWakingUp(true);
      },
    }).then((result) => {
      if (!isCurrent) return;
      setIsWakingUp(false);
      if (result.ok) {
        setWorlds(result.data.worlds);
        setStatus("ready");
        return;
      }
      setStatus("error");
    });
    void getRewardsSummary().then((result) => {
      if (isCurrent && result.ok) setRewards(result.data);
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  // Covers the frame between a profile switch and the guard's redirect.
  if (child === undefined) return null;

  // First: the mascot screen replaces the home screen, so no lesson board is left to tap behind it.
  if (screenTime.block != null) {
    return (
      <ScreenTimeLock
        reason={screenTime.block}
        windowStart={screenTime.windowStart}
      />
    );
  }

  const stats =
    rewards === undefined
      ? child.stats
      : {
          ...child.stats,
          stars: rewards.stars,
          coins: rewards.coins,
          badges: rewards.badgeCount,
          currentStreak: rewards.currentStreak,
        };

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <header className="flex flex-col gap-4">
        {/* Right-padded past the parent-corner lock so a long Bangla name never runs under it. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 pr-14">
          <h1 className="font-display text-2xl text-foreground sm:text-3xl">
            {t("home.greeting", { name: child.firstName })}
          </h1>

          {/* Beside the name: this is "that is not me", not a step back like a world screen's Back. */}
          <BigButton
            variant="secondary"
            icon={<Users aria-hidden="true" />}
            onPress={() => router.push(STUDENT_ROUTES.selectProfile)}
          >
            {t("home.switchProfile")}
          </BigButton>
        </div>
        <RewardStrip stats={stats} />
      </header>

      {/* Outside every status branch: the story library is not part of any lesson flow, so a failed
          curriculum read must not hide it. */}
      {/* Wrapped: `IconTile` sizes itself and a bare flex child would stretch to full width and height. */}
      <div>
        <IconTile
          label={t("stories.title")}
          icon={<BookOpen aria-hidden="true" />}
          size="lg"
          onPress={() => {
            void screenTime.guardStart(() => router.push("/stories"));
          }}
        />
      </div>

      {status === "error" ? (
        <StudentStatus tone="alert" onRetry={onRetry}>
          {t("status.error")}
        </StudentStatus>
      ) : status === "loading" ? (
        <StudentStatus tone="status">
          {isWakingUp ? t("status.waking") : t("selectProfile.loading")}
        </StudentStatus>
      ) : worlds.length === 0 ? (
        <StudentStatus tone="status">{t("home.empty")}</StudentStatus>
      ) : (
        <>
          <p className="font-display text-foreground text-xl">
            {t("home.pickWorld")}
          </p>
          {/* Side by side as soon as there is width, including a landscape phone (design.md §6). */}
          <ul className="grid grid-cols-1 gap-6 landscape:grid-cols-2 sm:grid-cols-2">
            {worlds.map((world) => (
              <li key={world.id} className="contents">
                <WorldCard
                  world={world}
                  onPress={() => {
                    void screenTime.guardStart(() =>
                      router.push(`/world/${world.id}`),
                    );
                  }}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
