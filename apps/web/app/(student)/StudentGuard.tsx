"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useActiveChild } from "@/lib/active-child";
import { STUDENT_NAMESPACE } from "@/lib/i18n";

/**
 * What every student screen that needs a child sits behind.
 *
 * Three states, and no screen underneath has to know about any of them:
 *
 *  - **Signed out.** Nobody has connected this device to an account yet, so the
 *    grown-up is sent to `/parent/login`. A child cannot resolve this.
 *  - **No profile picked.** Back to `/select-profile`. `/home` and `/world/*`
 *    have nothing to render without a child, and — more to the point — the
 *    content API answers `403` without one, since grade and language come from
 *    that row.
 *  - **Waiting.** A mascot line rather than a spinner, and the cold-start message
 *    when the API is asleep (NFR-PERF-04): a five-year-old reads a friendly
 *    sentence as "soon" and a blank screen as "broken".
 *
 * `replace`, not `push`: a redirect the child never asked for must not become a
 * back-button trap.
 */
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
