"use client";

import { PARENT_NAMESPACE } from "@kidlearn/i18n";
import type { WeeklyReport } from "@kidlearn/types";
import { cn } from "@kidlearn/ui";
import { cva, type VariantProps } from "class-variance-authority";
import {
  Award,
  BookOpen,
  BookText,
  CalendarCheck,
  Clock,
  Target,
} from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { formatWeekRange } from "@/features/reports/week-range";
import { formatMinutes } from "@/features/screen-time/duration";
import { StatCard } from "@/shared/components/StatCard";

export interface ReportCardProps {
  report: WeeklyReport;
}

export function ReportCard({ report }: ReportCardProps) {
  const { t, i18n } = useTranslation(PARENT_NAMESPACE);
  const { metrics } = report;
  // Generated, not literal, so two cards on one page never share an id for `aria-labelledby`.
  const headingId = useId();

  const range = formatWeekRange(
    report.weekStart,
    report.weekEnd,
    i18n.language,
  );

  const hasNewConcepts =
    metrics.newLetters.length > 0 ||
    metrics.newWords.length > 0 ||
    metrics.newNumbers.length > 0;

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-(--radius) border border-border bg-card p-4 sm:p-5"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2
          id={headingId}
          className="font-semibold text-card-foreground text-lg"
        >
          {/* `dateTime` makes the range machine-readable for screen readers that would read "Aug 17 – 23" as arithmetic. */}
          <time dateTime={report.weekStart.slice(0, 10)}>{range}</time>
        </h2>
        <p className="text-muted-foreground text-xs uppercase tracking-[0.05em]">
          {t("reports.latest")}
        </p>
      </header>

      {/* Two columns on a 360px phone: six single-file cards is a screen to scroll past (design.md §6). */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          tone="featured"
          icon={<CalendarCheck aria-hidden className="size-3.5" />}
          label={t("reports.activeDays")}
          value={t("reports.activeDaysValue", { count: metrics.activeDays })}
        />
        <StatCard
          icon={<Clock aria-hidden className="size-3.5" />}
          label={t("reports.minutes")}
          value={formatMinutes(metrics.learningMinutes, t)}
        />
        <StatCard
          icon={<BookOpen aria-hidden className="size-3.5" />}
          label={t("reports.lessons")}
          value={t("reports.count", { count: metrics.lessonsCompleted })}
        />
        <StatCard
          icon={<BookText aria-hidden className="size-3.5" />}
          label={t("reports.stories")}
          value={t("reports.count", { count: metrics.storiesCompleted })}
        />
        {/* `quizAccuracy` is null, never 0, when nothing was answered, so this renders a different card rather than a misleading "0%". */}
        <StatCard
          icon={<Target aria-hidden className="size-3.5" />}
          label={t("reports.accuracy")}
          value={
            metrics.quizAccuracy === null
              ? t("reports.accuracyNone")
              : t("reports.accuracyValue", { percent: metrics.quizAccuracy })
          }
          hint={
            metrics.quizAccuracy === null
              ? t("reports.accuracyNoneHint")
              : t("reports.accuracyHint", {
                  // The denominator makes a percentage actionable: "9 of 10" is a fact.
                  correct: metrics.quizFirstAttemptsCorrect,
                  total: metrics.quizFirstAttempts,
                })
          }
        />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-medium text-card-foreground text-sm">
          {t("reports.newTitle")}
        </h3>
        {hasNewConcepts ? (
          <ul className="flex flex-col gap-2">
            <ConceptRow
              kind="letter"
              label={t("reports.newLetters")}
              values={metrics.newLetters}
            />
            <ConceptRow
              kind="word"
              label={t("reports.newWords")}
              values={metrics.newWords}
            />
            <ConceptRow
              kind="number"
              label={t("reports.newNumbers")}
              values={metrics.newNumbers}
            />
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t("reports.newEmpty")}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-medium text-card-foreground text-sm">
          {t("reports.badgesTitle")}
        </h3>
        {metrics.badgesEarned.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("reports.badgesEmpty")}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {metrics.badgesEarned.map((badge) => (
              <li
                key={badge.slug}
                className="inline-flex items-center gap-1.5 rounded-(--radius-sm) border border-accent bg-muted px-2 py-1 font-medium text-foreground text-xs"
              >
                <Award aria-hidden="true" className="size-3.5" />
                {badge.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Mascot speech bubble; `aside` because the note is an opinion, not a figure.
          The tail is a rotated square so it inherits the bubble's tokens in either theme. */}
      <aside
        aria-label={t("reports.noteLabel")}
        className="relative mt-1 rounded-(--radius) border border-primary/30 bg-primary/5 p-4 pl-12"
      >
        <span
          aria-hidden="true"
          className="absolute top-4 left-4 text-xl leading-none"
        >
          {/* Generic sparkle stands in for per-world mascot art, which this card has no world for (design.md §9). */}
          ✨
        </span>
        <p className="text-foreground text-sm">
          {t(`reports.notes.${metrics.noteKey}`, metrics.noteParams)}
        </p>
      </aside>
    </section>
  );
}

const chipVariants = cva(
  "inline-flex min-h-6 items-center rounded-(--radius-sm) border px-1.5 font-medium text-xs",
  {
    variants: {
      kind: {
        // Colour distinguishes the three kinds at a glance; the row's own label
        // carries the meaning, so the hue is reinforcement (design.md §2.3).
        letter: "border-primary/40 bg-primary/10 text-foreground",
        word: "border-secondary bg-secondary/40 text-foreground",
        number: "border-accent bg-accent/20 text-foreground",
      },
    },
  },
);

function ConceptRow({
  kind,
  label,
  values,
}: VariantProps<typeof chipVariants> & {
  label: string;
  values: readonly string[];
}) {
  const { t } = useTranslation(PARENT_NAMESPACE);
  if (values.length === 0) return null;

  return (
    <li className="flex flex-col gap-1">
      <p className="text-muted-foreground text-xs">
        {/* One interpolated string, so a locale can change the separator or order. */}
        {t("reports.newRowLabel", { label, count: values.length })}
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <li key={value} className={cn(chipVariants({ kind }))}>
            {value}
          </li>
        ))}
      </ul>
    </li>
  );
}
