"use client";

import type { DashboardData } from "@kidlearn/types";
import { CalendarDays, CalendarRange, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatMinutes } from "@/lib/duration";
import { PARENT_NAMESPACE } from "@/lib/i18n";
import { ActivityTimeline } from "./ActivityTimeline";
import { StatCard } from "./StatCard";
import { SubjectProgressCard } from "./SubjectProgressCard";

/**
 * The whole dashboard for one child, from one payload (FR-DASH-01..04).
 *
 * Purely presentational, which is what makes the empty states testable: the
 * fixture *is* the state. There is no fetching here and no clock read — the screen
 * above owns both, and passes `now` in so a rendered relative date is a function of
 * its inputs.
 */
export interface DashboardSummaryProps {
  data: DashboardData;
  childName: string;
  now: Date;
}

export function DashboardSummary({
  data,
  childName,
  now,
}: DashboardSummaryProps) {
  const { t } = useTranslation(PARENT_NAMESPACE);

  const { today, week, month } = data.learningMinutes;
  // Per window rather than "has this child ever learned": a parent looking at
  // Monday morning has a real month and an empty day, and one blanket note would
  // be wrong about both.
  const nothingYet = t("dashboard.noTimeYet");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <StatCard
          tone="featured"
          icon={<Clock aria-hidden className="size-3.5" />}
          label={t("dashboard.today")}
          value={formatMinutes(today, t)}
          hint={today === 0 ? nothingYet : undefined}
        />
        <StatCard
          icon={<CalendarDays aria-hidden className="size-3.5" />}
          label={t("dashboard.week")}
          value={formatMinutes(week, t)}
          hint={week === 0 ? nothingYet : undefined}
        />
        <StatCard
          icon={<CalendarRange aria-hidden className="size-3.5" />}
          label={t("dashboard.month")}
          value={formatMinutes(month, t)}
          hint={month === 0 ? nothingYet : undefined}
        />
      </div>

      <SubjectProgressCard
        subjects={data.subjects}
        strongestSubjectId={data.strongestSubjectId}
        weakestSubjectId={data.weakestSubjectId}
      />

      <ActivityTimeline
        items={data.recentActivity}
        childName={childName}
        now={now}
      />
    </div>
  );
}
