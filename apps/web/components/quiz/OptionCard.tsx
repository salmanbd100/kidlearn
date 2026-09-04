"use client";

import type { ImageAssetRef, Locale } from "@kidlearn/types";
import { cn } from "@kidlearn/ui";
import { cva } from "class-variance-authority";
import { Check } from "lucide-react";
import Image from "next/image";

// One answer, as something a child taps (FR-QUIZ-01, FR-QUIZ-04).

const optionCardVariants = cva(
  "relative flex w-full flex-col items-center justify-center gap-2 rounded-lg border-4 bg-card p-3 text-card-foreground shadow-md transition-opacity [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      shape: {
        text: "min-h-24",
        picture: "aspect-square min-h-24",
      },
      state: {
        idle: "border-border",
        correct: "border-success shadow-pop motion-safe:scale-105",
        // Still readable, still there — a card a child can see they have tried
        // tells them more than one that vanished under their finger.
        tried: "border-border opacity-40",
      },
    },
    defaultVariants: { shape: "text", state: "idle" },
  },
);

const IMAGE_PX = 256;

export interface OptionCardProps {
  optionId: string;
  shape: "text" | "picture";
  state: "idle" | "correct" | "tried";
  /** The option's own words, when the payload gives it any. */
  label: string | undefined;
  image: ImageAssetRef | undefined;
  locale: Locale;
  /** Spoken after the label once the option has been tried and set aside. */
  triedLabel: string;
  correctLabel: string;
  /** Names a wordless picture the payload never described — see `alt` below. */
  pictureLabel: string;
  onSelect: () => void;
}

export function OptionCard({
  optionId,
  shape,
  state,
  label,
  image,
  locale,
  triedLabel,
  correctLabel,
  pictureLabel,
  onSelect,
}: OptionCardProps) {
  const isTried = state === "tried";

  return (
    <button
      type="button"
      data-testid={`quiz-option-${optionId}`}
      data-state={state}
      // `aria-disabled` rather than `disabled`: a tried option is still part of
      // the question a screen-reader user is reading back, and a disabled button
      // drops out of the tab order half-way through answering.
      aria-disabled={isTried}
      className={cn(optionCardVariants({ shape, state }))}
      onClick={onSelect}
    >
      {image === undefined ? null : (
        <Image
          src={image.url}
          // The picture is the answer where there are no words for it, and
          // decoration where the card already says the same thing in text.
          alt={label === undefined ? (image.alt?.[locale] ?? pictureLabel) : ""}
          width={IMAGE_PX}
          height={IMAGE_PX}
          className={cn(
            "object-contain",
            shape === "picture" ? "min-h-0 flex-1" : "size-16",
          )}
        />
      )}

      {label === undefined ? null : (
        // 20px floor on a kid surface (design.md §3.2); the words on an MCQ card
        // are the answer itself, so they get the larger end of the scale.
        <span
          className={cn(
            "font-display leading-tight",
            shape === "picture" ? "text-lg" : "text-2xl",
          )}
        >
          {label}
        </span>
      )}

      {state === "correct" ? (
        <>
          <Check
            aria-hidden="true"
            className="absolute top-2 right-2 size-6 text-success"
          />
          <span className="sr-only">{correctLabel}</span>
        </>
      ) : null}

      {isTried ? <span className="sr-only">{triedLabel}</span> : null}
    </button>
  );
}
