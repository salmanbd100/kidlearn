"use client";

import type { DashboardSubjectProgress } from "@kidlearn/types";
import { cn } from "@kidlearn/ui";
import { cva, type VariantProps } from "class-variance-authority";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PARENT_NAMESPACE } from "@/lib/i18n";
import { pickLabel } from "@/lib/localized-label";

/** Per-subject completion as labelled bars (FR-DASH-03). */
const barVariants = cva("h-full rounded-full", {
  variants: {
    tone: {
      default: "bg-primary",
      strongest: "bg-success",
      weakest: "bg-warning",
    },
  },
  defaultVariants: { tone: "default" },
});

type BarTone = NonNullable<VariantProps<typeof barVariants>["tone"]>;

export interface SubjectProgressCardProps {
  subjects: readonly DashboardSubjectProgress[];
  strongestSubjectId: string | null;
  weakestSubjectId: string | null;
}

export function SubjectProgressCard({
  subjects,
  strongestSubjectId,
  weakestSubjectId,
}: SubjectProgressCardProps) {
  const { t, i18n } = useTranslation(PARENT_NAMESPACE);

  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius)] border border-border bg-card p-4 sm:p-5">
      <h2 className="font-semibold text-card-foreground text-lg">
        {t("dashboard.subjectsTitle")}
      </h2>

      {subjects.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("dashboard.subjectsEmpty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {subjects.map((subject) => {
            const name = pickLabel(subject.name, i18n.language);
            const tone: BarTone =
              subject.subjectId === strongestSubjectId
                ? "strongest"
                : subject.subjectId === weakestSubjectId
                  ? "weakest"
                  : "default";

            return (
              <li key={subject.subjectId} className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="flex flex-wrap items-center gap-2 font-medium text-card-foreground text-sm">
                    {name}
                    {tone === "strongest" ? (
                      <Chip tone="strongest">
                        <TrendingUp aria-hidden="true" className="size-3" />
                        {t("dashboard.strongest")}
                      </Chip>
                    ) : null}
                    {tone === "weakest" ? (
                      <Chip tone="weakest">
                        <TrendingDown aria-hidden="true" className="size-3" />
                        {t("dashboard.needsPractice")}
                      </Chip>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {t("dashboard.subjectCount", {
                      completed: subject.completed,
                      total: subject.total,
                      percent: subject.percent,
                    })}
                  </span>
                </div>

                <div
                  role="progressbar"
                  aria-label={name}
                  aria-valuenow={subject.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="h-2 w-full overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className={cn(barVariants({ tone }))}
                    style={{ width: `${subject.percent}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** The highlight chips. */
const chipVariants = cva(
  "inline-flex items-center gap-1 rounded-[var(--radius-sm)] border bg-muted px-1.5 py-0.5 font-medium text-foreground text-xs",
  {
    variants: {
      tone: {
        strongest: "border-success/50",
        weakest: "border-warning/60",
      },
    },
  },
);

function Chip({
  tone,
  children,
}: VariantProps<typeof chipVariants> & { children: ReactNode }) {
  return <span className={cn(chipVariants({ tone }))}>{children}</span>;
}
