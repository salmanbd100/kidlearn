"use client";

import { LESSON_STEPS, type LessonStep } from "@kidlearn/types";
import { cn } from "@kidlearn/ui";
import { cva } from "class-variance-authority";
import { X } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LESSON_NAMESPACE } from "@/lib/i18n";

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
    // `min-h-dvh` and the safe-area insets are repeated here rather than inherited:
    // the player is the one student screen that fills the viewport itself, and a
    // step's own content is what must clear a notch (design.md §6).
    <div className="relative flex min-h-dvh flex-1 flex-col bg-background pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
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
          className="inline-flex size-16 shrink-0 items-center justify-center rounded-pill text-muted-foreground transition-colors [touch-action:manipulation] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
