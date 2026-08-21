"use client";

import type { DashboardSubjectProgress } from "@kidlearn/types";
import { cn } from "@kidlearn/ui";
import { cva, type VariantProps } from "class-variance-authority";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PARENT_NAMESPACE } from "@/lib/i18n";
import { pickLabel } from "@/lib/localized-label";

/**
 * Per-subject completion as labelled bars (FR-DASH-03).
 *
 * **No chart library.** A percentage bar is a div inside a div, and the one thing
 * a library would add here is 40 kB on a screen a parent opens on a phone. The
 * inline `width` is the only inline style in this component and it is the datum —
 * a Tailwind class cannot express an arbitrary percentage. It is deliberately not
 * transitioned: design.md §5 allows `transform` and `opacity` only, and animating
 * a width would be a layout animation on every render.
 *
 * **The bar is not the only carrier of the number.** "9 of 26" is beside it,
 * because a bar cannot be read by a screen reader and a rounded percentage cannot
 * be turned back into a count (design.md §2.3 — meaning is never colour-only, and
 * never geometry-only either).
 *
 * The highlight chips render only when the server sent an id. It decides that:
 * a brand-new child, a single subject, or two subjects on the same percentage all
 * arrive with both ids `null`, and there is nothing here to second-guess.
 */
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

/**
 * The highlight chips.
 *
 * Colour is on the border only, and both chips share `bg-muted` /
 * `text-foreground`. A tinted background under `text-xs` is where these normally
 * fail AA — emerald-600 on its own 15% tint is about 2:1 — and the icon plus the
 * word already carry the meaning, so the hue is redundant reinforcement rather
 * than the signal (design.md §2.3).
 */
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
