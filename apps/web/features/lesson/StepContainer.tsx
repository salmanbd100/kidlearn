"use client";

import { LESSON_STEPS, type LessonStep } from "@kidlearn/types";
import { cn } from "@kidlearn/ui";
import { cva } from "class-variance-authority";
import { X } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LESSON_NAMESPACE } from "@/shared/lib/i18n";

// The frame every lesson step is rendered inside (Pillar A, design.md §6).

const dotVariants = cva(
  "block size-4 rounded-pill transition-[background-color,transform]",
  {
    variants: {
      state: {
        done: "bg-primary",
        current: "bg-accent scale-125 motion-safe:animate-pulse",
        todo: "bg-muted",
      },
    },
  },
);

export interface StepContainerProps {
  step: LessonStep;
  /** The world's mascot, from `lesson.world.mascot`. Decorative. */
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

  return (
    // `flex-1`, not a viewport height and the safe-area insets: the student layout
    // already applies both, and repeating them doubled the insets on a notched
    // phone and scrolled the lesson by their height.
    <div className="relative flex flex-1 flex-col bg-background">
      <header className="flex items-start justify-between gap-4 p-4">
        <ol
          // One `progressbar` for the strip, not five bare dots. The dots
          // themselves are `aria-hidden` — their meaning is in the label below.
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
                  // `data-dot`, not `data-step`: the step *component* carries
                  // `data-step`, and a test asking "which step is on screen?"
                  // must not match a dot that merely names one.
                  data-dot={candidate}
                  data-state={state}
                  className={cn(dotVariants({ state }))}
                />
              </li>
            );
          })}
        </ol>

        <button
          type="button"
          // 64px, because this is a control a *child* uses (design.md §7) —
          // unlike the parent-corner lock, which is deliberately small.
          className="inline-flex size-16 shrink-0 items-center justify-center rounded-pill text-muted-foreground transition-colors touch-manipulation hover:text-foreground focus-ring"
          aria-label={t("exit.open")}
          onClick={onExit}
        >
          <X aria-hidden="true" className="size-8" />
        </button>
      </header>

      <main className="flex flex-1 flex-col px-6 pb-6">{children}</main>

      {mascotUrl === undefined ? null : (
        // Bottom corner, behind the step's content and non-interactive: company for
        // the child, never something to tap. Hidden in landscape on a short
        // viewport, where the step needs every pixel of height it can get.
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
