"use client";

import type { WeeklyReport } from "@kidlearn/types";
import { cn } from "@kidlearn/ui";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { formatMinutes } from "@/lib/duration";
import { PARENT_NAMESPACE } from "@/lib/i18n";
import { formatWeekRange } from "@/lib/week-range";

/** Every earlier week, one row each (FR-DASH-06). */
export interface ReportHistoryListProps {
  /** The earlier weeks, newest first. */
  reports: readonly WeeklyReport[];
  /** Path the week links hang off — `?week=` is appended to it. */
  basePath: string;
  /** Carried through so switching weeks does not switch child. */
  childId: string;
}

export function ReportHistoryList({
  reports,
  basePath,
  childId,
}: ReportHistoryListProps) {
  const { t, i18n } = useTranslation(PARENT_NAMESPACE);

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius)] border border-border bg-card p-4 sm:p-5">
      <h2 className="font-semibold text-card-foreground text-lg">
        {t("reports.historyTitle")}
      </h2>

      {reports.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("reports.historyEmpty")}
        </p>
      ) : (
        <ul className="flex flex-col">
          {reports.map((report) => {
            const range = formatWeekRange(
              report.weekStart,
              report.weekEnd,
              i18n.language,
            );
            return (
              <li key={report.weekStart}>
                {/* The label is on the link itself, which *replaces* its contents
                    for the accessible name. On the icon it only appended to them,
                    so the week was announced twice — the opposite of what it was
                    there for. */}
                <Link
                  href={`${basePath}?child=${encodeURIComponent(childId)}&week=${encodeURIComponent(report.weekStart)}`}
                  aria-label={t("reports.historyOpen", { range })}
                  className={cn(
                    // 44px minimum touch target on a parent surface (design.md §7).
                    "-mx-2 flex min-h-11 items-center gap-3 rounded-[var(--radius-sm)] px-2 py-2 transition-colors hover:bg-muted",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <time
                      dateTime={report.weekStart.slice(0, 10)}
                      className="font-medium text-card-foreground text-sm"
                    >
                      {range}
                    </time>
                    <span className="text-muted-foreground text-xs">
                      {/* `count`, not `lessons`: it is what selects i18next's
                          plural form, and without it a one-lesson week read
                          "1 lessons" in English. */}
                      {t("reports.historyMeta", {
                        minutes: formatMinutes(
                          report.metrics.learningMinutes,
                          t,
                        ),
                        count: report.metrics.lessonsCompleted,
                      })}
                    </span>
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
