"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useActiveChild } from "@/lib/active-child";
import { STUDENT_NAMESPACE } from "@/lib/i18n";

/** What every student screen that needs a child sits behind. */
export function StudentGuard({ children }: { children: ReactNode }) {
  const { t } = useTranslation(STUDENT_NAMESPACE);
  const router = useRouter();
  const { status, child, isWakingUp } = useActiveChild();

  const redirectTo =
    status === "signedOut"
      ? "/parent/login"
      : status === "ready" && child === undefined
        ? "/select-profile"
        : undefined;

  useEffect(() => {
    if (redirectTo !== undefined) router.replace(redirectTo);
  }, [redirectTo, router]);

  if (status === "error") {
    return <StudentStatus tone="alert">{t("status.error")}</StudentStatus>;
  }

  if (status === "loading" || redirectTo !== undefined) {
    return (
      <StudentStatus tone="status">
        {isWakingUp ? t("status.waking") : t("selectProfile.loading")}
      </StudentStatus>
    );
  }

  return <>{children}</>;
}

/**
 * The waiting and failure states, shaped like the screens around them: centred,
 * large, and never below the 20px floor a child reads at (design.md §3.2).
 */
export function StudentStatus({
  tone,
  children,
}: {
  tone: "status" | "alert";
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
      <span aria-hidden="true" className="text-6xl">
        🦉
      </span>
      <p
        role={tone}
        className="text-center font-display text-foreground text-xl"
      >
        {children}
      </p>
    </div>
  );
}
