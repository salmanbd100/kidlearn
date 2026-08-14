"use client";

import { cn } from "@kidlearn/ui";
import { cva } from "class-variance-authority";
import { Apple } from "lucide-react";

/**
 * How far through the quiz the child is, without a number in sight (FR-QUIZ-07).
 *
 * One fruit per question: answered ones are filled in, the one being asked
 * bounces, the rest sit faint. A pre-reader cannot read "2 of 5" and a
 * percentage is a score by another name — the strip says *how much is left*,
 * which is the only part of progress a four-year-old asked about.
 *
 * **It says nothing about who was right.** A filled fruit means answered, not
 * answered correctly; every question ends correct anyway (§5.7), and a strip
 * that marked mistakes would be the visible scoring the quiz is built to avoid.
 *
 * Fill and movement carry the state, not hue alone (design.md §2.3). Hidden from
 * assistive technology because the engine announces the same thing in words.
 */

const fruitVariants = cva("size-8 shrink-0", {
  variants: {
    state: {
      done: "fill-current text-success",
      current: "text-primary motion-safe:animate-bounce",
      todo: "text-muted-foreground opacity-30",
    },
  },
  defaultVariants: { state: "todo" },
});

export function ProgressFruit({
  questionIds,
  currentIndex,
}: {
  questionIds: readonly string[];
  currentIndex: number;
}) {
  return (
    <ol
      aria-hidden="true"
      data-testid="quiz-progress-fruit"
      className="flex shrink-0 items-center justify-center gap-2"
    >
      {questionIds.map((questionId, index) => {
        const state =
          index < currentIndex
            ? "done"
            : index === currentIndex
              ? "current"
              : "todo";

        return (
          <li key={questionId} data-state={state} className="flex">
            <Apple className={cn(fruitVariants({ state }))} strokeWidth={2.5} />
          </li>
        );
      })}
    </ol>
  );
}
