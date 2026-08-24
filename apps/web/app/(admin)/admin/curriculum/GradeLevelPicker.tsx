"use client";

import { GRADE_LEVELS, type GradeLevelValue } from "@kidlearn/types";
import { Button, cn } from "@kidlearn/ui";

/**
 * Which grades a piece of content appears for — the same fieldset on the subject,
 * topic and lesson forms (FR-CURR-04).
 *
 * One component rather than the copy each form used to hold: the two had already
 * drifted apart in their empty-state wording, which is what a duplicated widget
 * does first.
 *
 * The hint is `aria-describedby`-linked rather than merely adjacent, because it
 * carries the reason the submit button is disabled and colour is not the only
 * signal an error is showing (design.md §2.3).
 */
const LABELS: Record<GradeLevelValue, string> = {
  NURSERY: "Nursery",
  KG1: "KG-1",
  KG2: "KG-2",
};

const HINT_ID = "grade-levels-hint";

export function GradeLevelPicker({
  value,
  onChange,
  isBusy,
}: {
  value: GradeLevelValue[];
  onChange: (next: GradeLevelValue[]) => void;
  isBusy: boolean;
}) {
  const isEmpty = value.length === 0;

  return (
    <fieldset className="flex flex-col gap-1.5" aria-describedby={HINT_ID}>
      <legend className="font-medium text-foreground text-sm">
        Grade levels
      </legend>
      <div className="flex flex-wrap gap-2">
        {GRADE_LEVELS.map((grade) => {
          const isOn = value.includes(grade);
          return (
            <Button
              key={grade}
              type="button"
              variant={isOn ? "default" : "outline"}
              aria-pressed={isOn}
              disabled={isBusy}
              onClick={() =>
                onChange(
                  isOn
                    ? value.filter((one) => one !== grade)
                    : [...value, grade],
                )
              }
            >
              {LABELS[grade]}
            </Button>
          );
        })}
      </div>
      <p
        id={HINT_ID}
        className={cn(
          "text-xs",
          isEmpty ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {isEmpty
          ? "Pick at least one — content no grade can see is content nobody can see."
          : "Which learners this appears for."}
      </p>
    </fieldset>
  );
}
