"use client";

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
import { formatMinutes } from "@/lib/duration";
import { PARENT_NAMESPACE } from "@/lib/i18n";
import { formatWeekRange } from "@/lib/week-range";
import { StatCard } from "./StatCard";

/** One week, as the card at the top of `/parent/reports` (FR-DASH-05). */
export interface ReportCardProps {
  report: WeeklyReport;
}

export function ReportCard({ report }: ReportCardProps) {
  const { t, i18n } = useTranslation(PARENT_NAMESPACE);
  const { metrics } = report;
  // Generated rather than a literal, so a future comparison view rendering two
  // cards does not produce two elements with the same id and an
  // `aria-labelledby` pointing at whichever the browser saw first.
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
      className="flex flex-col gap-4 rounded-[var(--radius)] border border-border bg-card p-4 sm:p-5"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2
          id={headingId}
          className="font-semibold text-card-foreground text-lg"
        >
          {/* A `<time>` pair rather than a heading full of prose: the range is the
              week's identity, and `dateTime` makes it machine-readable for a
              screen reader that would otherwise read "Aug 17 – 23" as arithmetic. */}
          <time dateTime={report.weekStart.slice(0, 10)}>{range}</time>
        </h2>
        <p className="text-muted-foreground text-xs uppercase tracking-[0.05em]">
          {t("reports.latest")}
        </p>
      </header>

      {/* Two columns on a 360px phone, not one: six single-file cards is a screen
          a parent has to scroll past rather than read (design.md §6). */}
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
        {/* `quizAccuracy` is null, never 0, for a week with nothing answered — so
            this renders a different card rather than "0%", which would tell a
            parent their child got everything wrong. */}
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
                  // The denominator is what makes a percentage actionable: "9 of
                  // 10" is a fact, where 90% alone hides how much it rests on.
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
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-accent bg-muted px-2 py-1 font-medium text-foreground text-xs"
              >
                <Award aria-hidden="true" className="size-3.5" />
                {badge.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/*
        The mascot's speech bubble. `aside`, not a paragraph in the flow: the note
        is the one thing on this card that is an opinion rather than a figure, and
        it reads as one only if it is visibly set apart.

        The tail is a rotated square rather than a border trick, so it inherits the
        bubble's own tokens and stays correct in either theme.
      */}
      <aside
        aria-label={t("reports.noteLabel")}
        className="relative mt-1 rounded-[var(--radius)] border border-primary/30 bg-primary/5 p-4 pl-12"
      >
        <span
          aria-hidden="true"
          className="absolute top-4 left-4 text-xl leading-none"
        >
          {/* The world mascot art is per-world and this card belongs to no world,
              so a generic sparkle stands in until file 33 gives the parent surface
              a mascot of its own (design.md §9). */}
          ✨
        </span>
        <p className="text-foreground text-sm">
          {t(`reports.notes.${metrics.noteKey}`, metrics.noteParams)}
        </p>
      </aside>
    </section>
  );
}

/** One kind of concept, with the tokens themselves listed under the count. */
const chipVariants = cva(
  "inline-flex min-h-6 items-center rounded-[var(--radius-sm)] border px-1.5 font-medium text-xs",
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
        {/* One interpolated string, separator included: a locale that wants a
            different separator — or the other order — cannot change a character
            sitting in the markup. */}
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
