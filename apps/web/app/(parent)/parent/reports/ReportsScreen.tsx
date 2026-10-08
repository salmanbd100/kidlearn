"use client";

import { PARENT_NAMESPACE } from "@kidlearn/i18n";
import type { WeeklyReport } from "@kidlearn/types";
import { Button } from "@kidlearn/ui";
import { LineChart } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParentSession } from "@/app/(parent)/context/parent-session";
import { ChildSwitcher } from "@/features/children/ChildSwitcher";
import { PARENT_ROUTES } from "@/features/parent/parent-redirect";
import { ReportCard } from "@/features/reports/ReportCard";
import { ReportHistoryList } from "@/features/reports/ReportHistoryList";
import { getWeeklyReports } from "@/features/reports/reports-api";

export function ReportsScreen({
  selectedChildId,
  selectedWeekStart,
}: {
  selectedChildId: string | undefined;
  selectedWeekStart: string | undefined;
}) {
  const { t } = useTranslation(PARENT_NAMESPACE);
  const { children: profiles } = useParentSession();

  const [reports, setReports] = useState<WeeklyReport[] | undefined>();
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
    // Cleared so switching tabs doesn't show the previous child's report under the new name.
    setReports(undefined);

    void getWeeklyReports(childId, {
      // The API sleeps on its free tier and this call may generate last week's report; say so rather
      // than show a spinner that looks broken.
      onColdStart: () => {
        if (isCurrent) setStatus("waking");
      },
    }).then((result) => {
      if (!isCurrent) return;
      if (result.ok) {
        setReports(result.data.reports);
        setStatus("ready");
        return;
      }
      setStatus("error");
    });

    return () => {
      isCurrent = false;
    };
    // `selectedWeekStart` is deliberately absent: the fetch returns every week.
  }, [childId]);

  // The guard ensures a profile exists; this shows briefly after deleting the last one, before the redirect.
  if (profiles === undefined || child === undefined) {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        {t("children.loading")}
      </p>
    );
  }

  const selected =
    reports?.find((report) => report.weekStart === selectedWeekStart) ??
    reports?.[0];
  const history =
    reports?.filter((report) => report.weekStart !== selected?.weekStart) ?? [];

  return (
    <main className="flex flex-1 flex-col gap-5 py-2">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl text-foreground">
          {t("reports.title", { name: child.firstName })}
        </h1>
        <p className="text-muted-foreground text-sm">{t("reports.subtitle")}</p>
      </header>

      <ChildSwitcher
        profiles={profiles}
        selectedChildId={child.id}
        basePath={PARENT_ROUTES.reports}
      />

      {status === "error" ? (
        <p role="alert" className="text-destructive text-sm">
          {t("errors.generic")}
        </p>
      ) : reports === undefined ? (
        <p role="status" className="text-muted-foreground text-sm">
          {status === "waking" ? t("reports.waking") : t("reports.loading")}
        </p>
      ) : selected === undefined ? (
        <p className="text-muted-foreground text-sm">
          {t("reports.empty", { name: child.firstName })}
        </p>
      ) : (
        <>
          <ReportCard report={selected} />
          <ReportHistoryList
            reports={history}
            basePath={PARENT_ROUTES.reports}
            childId={child.id}
          />
        </>
      )}

      <Button asChild variant="outline" className="self-start">
        <Link
          href={`${PARENT_ROUTES.dashboard}?child=${encodeURIComponent(child.id)}`}
        >
          <LineChart aria-hidden="true" />
          {t("reports.backToDashboard")}
        </Link>
      </Button>
    </main>
  );
}
