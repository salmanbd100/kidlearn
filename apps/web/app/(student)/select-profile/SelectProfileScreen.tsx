"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ProfileCard } from "@/components/student/ProfileCard";
import { useActiveChild } from "@/lib/active-child";
import { STUDENT_NAMESPACE } from "@/lib/i18n";
import { useScreenNarration } from "@/lib/use-screen-narration";
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
        // Two up on the smallest phone, wider as the screen allows. Portrait and
        // landscape both work because the count, not the orientation, decides.
        <ul className="grid w-full max-w-3xl grid-cols-2 gap-6 sm:grid-cols-3">
          {profiles.map((child) => (
            <li key={child.id} className="contents">
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
