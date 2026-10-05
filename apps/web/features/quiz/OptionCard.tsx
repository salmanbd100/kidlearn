"use client";

import type { ImageAssetRef, Locale } from "@kidlearn/types";
import { cn } from "@kidlearn/ui";
import { cva } from "class-variance-authority";
import Image from "next/image";
import { StatusMark } from "@/shared/components/kid/StatusMark";

const optionCardVariants = cva(
  "relative flex w-full flex-col items-center justify-center gap-2 rounded-lg border-4 bg-card p-3 text-card-foreground shadow-md transition-opacity touch-manipulation focus-ring",
  {
    variants: {
      shape: {
        text: "min-h-24",
        picture: "aspect-square min-h-24",
      },
      state: {
        idle: "border-border",
        correct: "border-success shadow-pop motion-safe:scale-105",
        // Still readable: a tried card a child can see tells them more than one that vanished.
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
  label: string | undefined;
  image: ImageAssetRef | undefined;
  locale: Locale;
  triedLabel: string;
  correctLabel: string;
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
      // `aria-disabled`, not `disabled`: a disabled button drops out of the tab order mid-answer.
      aria-disabled={isTried}
      className={cn(optionCardVariants({ shape, state }))}
      onClick={onSelect}
    >
      {image === undefined ? null : (
        <Image
          src={image.url}
          // The picture is the answer where there are no words, and decoration where the card says
          // the same in text.
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
        // 20px floor on a kid surface (design.md §3.2); the words are the answer, so the larger end
        // of the scale.
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
          <StatusMark tone="done" />
          <span className="sr-only">{correctLabel}</span>
        </>
      ) : null}

      {isTried ? <span className="sr-only">{triedLabel}</span> : null}
    </button>
  );
}
