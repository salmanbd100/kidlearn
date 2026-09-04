"use client";

import type { WeeklyReport } from "@kidlearn/types";
import { Button } from "@kidlearn/ui";
import { LineChart } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useParentGate,
  useParentSession,
} from "@/app/(parent)/context/parent-session";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { ReportCard } from "@/components/parent/ReportCard";
import { ReportHistoryList } from "@/components/parent/ReportHistoryList";
import { PARENT_NAMESPACE } from "@/lib/i18n";
import { PARENT_ROUTES } from "@/lib/parent-redirect";
import { getWeeklyReports } from "@/lib/reports-api";

/** `/parent/reports` — every week this child has had (FR-DASH-05..06). */
export function ReportsScreen({
  selectedChildId,
  selectedWeekStart,
}: {
  selectedChildId: string | undefined;
  selectedWeekStart: string | undefined;
}) {
  const { t } = useTranslation(PARENT_NAMESPACE);
  const { children: profiles } = useParentSession();
  const { guard } = useParentGate();

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
    // Cleared, not kept: without this, switching tabs shows the previous child's
    // report under the new child's name until the request lands.
    setReports(undefined);

    void guard(
      getWeeklyReports(childId, {
        // The API sleeps on its free tier, and this endpoint may also be
        // generating last week's report on the way — so the first request after
        // idle is the slowest one in the app. Saying so beats a spinner that looks
        // broken (NFR-PERF-04).
        onColdStart: () => {
          if (isCurrent) setStatus("waking");
        },
      }),
    ).then((result) => {
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
    // Keyed on the child alone, which is what `guard` being a stable callback
    // buys (see `parent-session.tsx`): were it rebuilt on each lock/unlock, an
    // expiring grant would re-run this effect and leave a 403's error state under
    // the PIN pad. `selectedWeekStart` is deliberately absent — the fetch returns
    // every week, so changing which one is shown must not refetch.
  }, [childId, guard]);

  // `ParentGuard` does not render this screen until the profiles have loaded and
  // there is at least one, but a parent who just deleted their last profile sees
  // this state briefly before the redirect lands.
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
  // Every week except the one on the card, so the list never repeats it.
  const history =
    reports?.filter((report) => report.weekStart !== selected?.weekStart) ?? [];

  return (
    <main className="flex flex-1 flex-col gap-5 py-2">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-semibold text-2xl text-foreground">
            {t("reports.title", { name: child.firstName })}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t("reports.subtitle")}
          </p>
        </div>
        <LanguageSwitch size="default" />
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
