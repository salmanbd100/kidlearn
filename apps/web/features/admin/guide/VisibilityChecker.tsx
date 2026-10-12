"use client";

import { cn, useIsMotionReduced } from "@kidlearn/ui";
import { cva } from "class-variance-authority";
import { Check, Eye, EyeOff, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { swapTransition } from "./guide-sections";

type GateId = "lesson" | "parents" | "world" | "grades";

const GATES: { id: GateId; label: string; failure: string }[] = [
  {
    id: "lesson",
    label: "The lesson is published",
    failure: "The lesson itself is not published.",
  },
  {
    id: "parents",
    label: "Its topic and that topic's subject are published",
    failure:
      "A parent in the tree is unpublished, so everything under it is hidden.",
  },
  {
    id: "world",
    label: "Its world is published",
    failure:
      "The world is unpublished — the most common miss, because it lives in its own column.",
  },
  {
    id: "grades",
    label: "The child's grade is ticked on the lesson, topic and subject",
    failure:
      "The child's grade is missing on at least one level. All three must include it.",
  },
];

const gateVariants = cva(
  cn(
    "flex min-h-11 w-full items-center gap-3 rounded-(--radius) border px-3 py-2 text-left text-sm transition-colors",
    "focus-ring",
  ),
  {
    variants: {
      isMet: {
        true: "border-success/40 bg-success/10 text-foreground",
        false: "border-border bg-card text-muted-foreground hover:bg-accent",
      },
    },
  },
);

const resultVariants = cva(
  "flex h-full flex-col gap-3 rounded-(--radius) border p-4",
  {
    variants: {
      isVisible: {
        true: "border-success/40 bg-success/10",
        false: "border-destructive/40 bg-destructive/10",
      },
    },
  },
);

/** Starts with the world unpublished: the mistake this section exists to prevent. */
export function VisibilityChecker() {
  const [met, setMet] = useState<Record<GateId, boolean>>({
    lesson: true,
    parents: true,
    world: false,
    grades: true,
  });
  const isMotionReduced = useIsMotionReduced();
  const failures = GATES.filter((gate) => !met[gate.id]);
  const isVisible = failures.length === 0;

  return (
    <div className="grid gap-4 rounded-(--radius) border border-border bg-card p-4 md:grid-cols-2 md:p-6">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-muted-foreground text-xs">
          Toggle each condition to see what a child gets.
        </legend>
        {GATES.map((gate) => (
          <button
            key={gate.id}
            type="button"
            aria-pressed={met[gate.id]}
            onClick={() =>
              setMet((current) => ({
                ...current,
                [gate.id]: !current[gate.id],
              }))
            }
            className={gateVariants({ isMet: met[gate.id] })}
          >
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full",
                met[gate.id]
                  ? "bg-success text-primary-foreground"
                  : "border border-border",
              )}
            >
              {met[gate.id] ? (
                <Check aria-hidden="true" className="size-3.5" />
              ) : null}
            </span>
            {gate.label}
          </button>
        ))}
      </fieldset>

      <div aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={isVisible ? "visible" : failures.map((one) => one.id).join()}
            initial={{ opacity: 0, scale: isMotionReduced ? 1 : 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: isMotionReduced ? 1 : 0.98 }}
            transition={swapTransition(isMotionReduced)}
            className={resultVariants({ isVisible })}
          >
            <p className="flex items-center gap-2 font-semibold text-foreground text-sm">
              {isVisible ? (
                <Eye aria-hidden="true" className="size-4 text-success" />
              ) : (
                <EyeOff
                  aria-hidden="true"
                  className="size-4 text-destructive"
                />
              )}
              {isVisible
                ? "A child in that grade sees this lesson."
                : "Hidden from every child."}
            </p>
            {isVisible ? (
              <p className="text-muted-foreground text-sm">
                Its activity and quiz appear too — but only the ones that are
                themselves published. An unpublished one is left out silently,
                and the lesson plays without it.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-foreground text-sm">
                {failures.map((gate) => (
                  <li key={gate.id} className="flex gap-2">
                    <X
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-destructive"
                    />
                    {gate.failure}
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
