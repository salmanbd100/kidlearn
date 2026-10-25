"use client";

import { ThemeScope } from "@kidlearn/ui";
import { Award, Check, Clock } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { SITE_ROUTES } from "../site-routes";
import { useIsMotionReducedAfterHydration } from "../use-is-motion-reduced-after-hydration";
import { useSiteTranslation } from "../use-site-translation";
import { Reveal } from "./Reveal";

const POINTS = ["progress", "reports", "limits"] as const;

/** Minutes per day for the sample week, Monday first; heights only, so no axis to translate. */
const SAMPLE_WEEK = [18, 25, 12, 30, 22, 27, 8] as const;
const MAX_MINUTES = Math.max(...SAMPLE_WEEK);

export function ParentPreview() {
  const { t } = useSiteTranslation();

  return (
    <div className="grid items-center gap-10 md:grid-cols-2 md:gap-12">
      <div className="flex flex-col gap-6">
        <Reveal>
          <p className="max-w-[36rem] text-xl leading-relaxed sm:text-2xl">
            {t("home.parentsLead")}
          </p>
        </Reveal>
        <ul className="flex flex-col gap-4">
          {POINTS.map((key, index) => (
            <li key={key}>
              <Reveal delay={0.08 * index} className="flex gap-3">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground">
                  <Check
                    aria-hidden="true"
                    className="size-4"
                    strokeWidth={3}
                  />
                </span>
                <span className="text-lg leading-relaxed">
                  {t(`home.parentsPoints.${key}`)}
                </span>
              </Reveal>
            </li>
          ))}
        </ul>
        <Link
          href={SITE_ROUTES.parentGuide}
          className="focus-ring inline-flex min-h-11 w-fit items-center rounded-sm text-lg font-bold underline decoration-accent decoration-4 underline-offset-8 hover:decoration-foreground"
        >
          {t("home.parentsGuide")}
        </Link>
      </div>
      <DashboardSketch />
    </div>
  );
}

/** A miniature of the real dashboard, in the parent theme, so a visitor sees the calmer half of the app. */
function DashboardSketch() {
  const { t } = useSiteTranslation();
  const isMotionReduced = useIsMotionReducedAfterHydration();

  return (
    <Reveal className="relative mx-auto w-full max-w-md">
      <ThemeScope
        theme="parent"
        aria-hidden="true"
        data-testid="dashboard-sketch"
        className="flex flex-col gap-5 rounded-(--radius) border border-border bg-card p-5 font-ui text-card-foreground shadow-lg sm:p-6"
      >
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground">
            {t("home.preview.child").slice(0, 1)}
          </span>
          <div className="flex flex-col">
            <span className="font-semibold">{t("home.preview.child")}</span>
            <span className="text-muted-foreground text-sm">
              {t("home.preview.week")}
            </span>
          </div>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-4xl tabular-nums">
            {t("home.preview.total")}
          </span>
          <span className="text-muted-foreground">
            {t("home.preview.minutes")}
          </span>
        </div>

        <div
          key={isMotionReduced ? "still" : "moving"}
          className="flex h-28 items-end gap-2"
        >
          {SAMPLE_WEEK.map((minutes, index) => (
            <motion.span
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed sample week; the day is the index.
              key={index}
              className="flex-1 origin-bottom rounded-t-md bg-primary"
              style={{ height: `${(minutes / MAX_MINUTES) * 100}%` }}
              initial={isMotionReduced ? false : { scaleY: 0 }}
              whileInView={{ scaleY: 1 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{
                duration: 0.4,
                delay: 0.2 + 0.06 * index,
                ease: [0.2, 0, 0, 1],
              }}
            />
          ))}
        </div>

        <div className="flex flex-wrap gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 font-medium">
            <Award className="size-4" />
            {t("home.preview.badge")}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 font-medium">
            <Clock className="size-4" />
            {t("home.preview.limit")}
          </span>
        </div>
      </ThemeScope>
    </Reveal>
  );
}
