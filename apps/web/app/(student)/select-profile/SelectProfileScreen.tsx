"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useActiveChild } from "@/features/children/active-child";
import { ProfileCard } from "@/features/student/ProfileCard";
import { useScreenNarration } from "@/shared/hooks/use-screen-narration";
import { STUDENT_NAMESPACE } from "@/shared/lib/i18n";
import { StudentStatus } from "../StudentGuard";

/** "Who's learning today?" — the child's front door (FR-AUTH-06). */
export function SelectProfileScreen() {
  const { t } = useTranslation(STUDENT_NAMESPACE);
  const router = useRouter();
  const { status, profiles, avatars, isWakingUp, activate } = useActiveChild();
  const [pendingId, setPendingId] = useState<string | undefined>();
  const [hasFailed, setHasFailed] = useState(false);

  useScreenNarration("selectProfile");

  useEffect(() => {
    if (status === "signedOut") router.replace("/parent/login");
  }, [status, router]);

  const handleSelect = async (childId: string) => {
    if (pendingId !== undefined) return;
    setPendingId(childId);
    setHasFailed(false);

    const result = await activate(childId);
    if (result.ok) {
      // Not `replace`: coming back here is how a child switches profiles, and
      // the back button is the most discoverable way they will find to do it.
      router.push("/home");
      return;
    }

    setPendingId(undefined);
    setHasFailed(true);
  };

  if (status === "error" || hasFailed) {
    return <StudentStatus tone="alert">{t("status.error")}</StudentStatus>;
  }

  if (status !== "ready") {
    return (
      <StudentStatus tone="status">
        {isWakingUp ? t("status.waking") : t("selectProfile.loading")}
      </StudentStatus>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
      <h1 className="text-center font-display text-3xl text-foreground sm:text-4xl">
        {t("selectProfile.title")}
      </h1>

      {profiles.length === 0 ? (
        // Written at the child, not the grown-up, because the child is who is
        // holding the tablet — it tells them what to do about it (design.md §10).
        <div className="flex flex-col items-center gap-3">
          <span aria-hidden="true" className="text-7xl">
            🦉
          </span>
          <p className="text-center font-display text-foreground text-xl">
            {t("selectProfile.emptyTitle")}
          </p>
          <p className="max-w-xs text-center text-lg text-muted-foreground">
            {t("selectProfile.emptyHint")}
          </p>
        </div>
      ) : (
        // Wrapping flex rather than a grid: a grid's unused columns keep their
        // width, so two children on a three-column grid sat hard against the
        // left edge while the title above them stayed centred. A short row of
        // flex items centres itself. The widths below are the column widths a
        // grid would have given — two up on the smallest phone, three from `sm`,
        // in portrait and landscape alike, because the count decides, not the
        // orientation.
        <ul className="flex w-full max-w-3xl flex-wrap justify-center gap-6">
          {profiles.map((child) => (
            <li
              key={child.id}
              className="w-[calc(50%-0.75rem)] sm:w-[calc((100%-3rem)/3)]"
            >
              <ProfileCard
                child={child}
                avatars={avatars}
                isDisabled={pendingId !== undefined}
                onSelect={() => {
                  void handleSelect(child.id);
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
