"use client";

import { LESSON_NAMESPACE } from "@kidlearn/i18n";
import { LESSON_STEPS, type LessonStep } from "@kidlearn/types";
import { cn } from "@kidlearn/ui";
import { cva } from "class-variance-authority";
import { X } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { IconControl } from "@/shared/components/kid/IconControl";
import { useFocusWhenDropped } from "@/shared/hooks/use-focus-when-dropped";

// Every dot is ringed and the ring carries the step: sky, sunshine and the muted wash are under the
// 3:1 non-text floor on cream (design.md §2.3), so a child reads filled versus hollow.
const dotVariants = cva(
  "block size-4 rounded-pill border-2 transition-[background-color,transform]",
  {
    variants: {
      state: {
        done: "border-foreground bg-primary",
        current:
          "border-foreground bg-accent scale-125 motion-safe:animate-pulse",
        todo: "border-muted-foreground bg-background",
      },
    },
  },
);

export interface StepContainerProps {
  step: LessonStep;
  mascotUrl?: string;
  onExit: () => void;
  children: ReactNode;
}

const MASCOT_PX = 96;

export function StepContainer({
  step,
  mascotUrl,
  onExit,
  children,
}: StepContainerProps) {
  const { t } = useTranslation(LESSON_NAMESPACE);
  const currentIndex = LESSON_STEPS.indexOf(step);
  const headingRef = useFocusWhenDropped<HTMLHeadingElement>(step);

  return (
    // `flex-1`, not viewport height plus safe-area insets: the student layout already applies both,
    // and repeating them doubled the insets on a notched phone.
    <div className="relative flex flex-1 flex-col bg-background">
      <header className="flex items-start justify-between gap-4 p-4">
        <ol
          // One `progressbar` for the strip; the dots are `aria-hidden` and the label carries the
          // meaning.
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={LESSON_STEPS.length}
          aria-valuenow={currentIndex + 1}
          aria-label={t("progress.label", {
            current: currentIndex + 1,
            total: LESSON_STEPS.length,
          })}
          className="flex items-center gap-3 pt-3"
        >
          {LESSON_STEPS.map((candidate, index) => {
            const state =
              index < currentIndex
                ? "done"
                : index === currentIndex
                  ? "current"
                  : "todo";
            return (
              <li key={candidate} className="flex">
                <span
                  aria-hidden="true"
                  // `data-dot`, not `data-step`: the step component carries `data-step`, and tests
                  // must not match a dot that names one.
                  data-dot={candidate}
                  data-state={state}
                  className={cn(dotVariants({ state }))}
                />
              </li>
            );
          })}
        </ol>

        {/*
          64px: a child uses this control (design.md §7), unlike the deliberately small parent-
          corner lock.
        */}
        <IconControl label={t("exit.open")} tone="quiet" onPress={onExit}>
          <X aria-hidden="true" className="size-8" />
        </IconControl>
      </header>

      <main className="flex flex-1 flex-col px-6 pb-6">
        {/* Named for assistive technology only, and where focus lands on a new step. */}
        <h1 ref={headingRef} tabIndex={-1} className="sr-only">
          {t(`steps.${step}`)}
        </h1>
        {children}
      </main>

      {mascotUrl === undefined ? null : (
        // Bottom corner, behind the content and non-interactive. Hidden in landscape on a short
        // viewport.
        <Image
          src={mascotUrl}
          alt=""
          width={MASCOT_PX}
          height={MASCOT_PX}
          aria-hidden="true"
          className="pointer-events-none absolute bottom-2 left-2 h-16 w-auto opacity-80 sm:h-24 landscape:max-sm:hidden"
        />
      )}
    </div>
  );
}
