"use client";

import { PARENT_NAMESPACE } from "@kidlearn/i18n";
import type { DashboardData } from "@kidlearn/types";
import { Button } from "@kidlearn/ui";
import { CalendarRange } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParentSession } from "@/app/(parent)/context/parent-session";
import { ChildSwitcher } from "@/features/children/ChildSwitcher";
import { DashboardSummary } from "@/features/children/DashboardSummary";
import { getDashboard } from "@/features/children/dashboard-api";
import { PARENT_ROUTES } from "@/features/parent/parent-redirect";

export function DashboardScreen({
  selectedChildId,
}: {
  selectedChildId: string | undefined;
}) {
  const { t } = useTranslation(PARENT_NAMESPACE);
  const { children: profiles } = useParentSession();

  const [loaded, setLoaded] = useState<
    { data: DashboardData; at: Date } | undefined
  >();
  const [status, setStatus] = useState<
    "loading" | "waking" | "ready" | "error"
  >("loading");

  const child =
    profiles?.find((profile) => profile.id === selectedChildId) ??
    profiles?.[0];
  const childId = child?.id;

  useEffect(() => {
    if (childId === undefined) return;

    let isCurrent = true;
    setStatus("loading");
    // Cleared so switching tabs doesn't show the previous child's figures under the new name.
    setLoaded(undefined);

    void getDashboard(childId, {
      // The API sleeps on its free tier; say so rather than show a spinner that looks broken.
      onColdStart: () => {
        if (isCurrent) setStatus("waking");
      },
    }).then((result) => {
      if (!isCurrent) return;
      if (result.ok) {
        setLoaded({ data: result.data, at: new Date() });
        setStatus("ready");
        return;
      }
      setStatus("error");
    });

    return () => {
      isCurrent = false;
    };
  }, [childId]);

  // The guard ensures a profile exists; this shows briefly after deleting the last one, before the redirect.
  if (profiles === undefined || child === undefined) {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        {t("children.loading")}
      </p>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-5 py-2">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl text-foreground">
          {t("dashboard.title", { name: child.firstName })}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t("dashboard.subtitle")}
        </p>
      </header>

      <ChildSwitcher profiles={profiles} selectedChildId={child.id} />

      {status === "error" ? (
        <p role="alert" className="text-destructive text-sm">
          {t("errors.generic")}
        </p>
      ) : loaded === undefined ? (
        <p role="status" className="text-muted-foreground text-sm">
          {status === "waking" ? t("dashboard.waking") : t("dashboard.loading")}
        </p>
      ) : (
        <DashboardSummary
          data={loaded.data}
          childName={child.firstName}
          now={loaded.at}
        />
      )}

      {/* Carries the child across so the report opens for whoever is on screen, not the first profile. */}
      <Button asChild variant="outline" className="self-start">
        <Link
          href={`${PARENT_ROUTES.reports}?child=${encodeURIComponent(child.id)}`}
        >
          <CalendarRange aria-hidden="true" />
          {t("reports.open")}
        </Link>
      </Button>
    </main>
  );
}
