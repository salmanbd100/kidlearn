"use client";

import { cn } from "@kidlearn/ui";
import { cva } from "class-variance-authority";
import { Apple } from "lucide-react";

/**
 * How far through the quiz the child is, without a number in sight (FR-QUIZ-07).
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
