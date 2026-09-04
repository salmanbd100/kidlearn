"use client";

import { useId } from "react";

// A one-of-N choice as a native radio group.

export interface SegmentedFieldProps {
  label: string;
  /** Radio `name` — must be unique among groups rendered together. */
  name: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
  /** Rendered under the group, e.g. what the choice will do. */
  hint?: string;
}

export function SegmentedField({
  label,
  name,
  value,
  options,
  onChange,
  hint,
}: SegmentedFieldProps) {
  const groupId = useId();
  const hintId = `${groupId}-hint`;

  return (
    <div className="flex flex-col gap-2">
      <span id={groupId} className="font-medium text-foreground text-sm">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={groupId}
        aria-describedby={hint === undefined ? undefined : hintId}
        className="flex flex-wrap gap-2"
      >
        {options.map((option) => (
          <label key={option.value} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            {/* 44px minimum on the parent surface (design.md §7). */}
            <span className="inline-flex h-11 items-center justify-center rounded-[var(--radius)] border-2 border-input bg-card px-5 font-medium text-foreground text-sm transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2">
              {option.label}
            </span>
          </label>
        ))}
      </div>
      {hint === undefined ? null : (
        <p id={hintId} className="text-muted-foreground text-sm">
          {hint}
        </p>
      )}
    </div>
  );
}
