"use client";

import type { StoryPageResponse } from "@kidlearn/types";
import { BookOpen } from "lucide-react";
import Image from "next/image";
import { NarratedText } from "./NarratedText";

/**
 * One page of a story: the picture and the words (FR-STORY-02).
 *
 * **The layout adapts to the device's orientation in CSS alone.** Portrait stacks
 * the illustration over the text; landscape puts them side by side, which is the
 * only way a phone held sideways — about 240px of usable height — shows both a
 * picture and a sentence at a size a child can read. No resize listener and no
 * `matchMedia` hook: an orientation is a media query, and reading it in JavaScript
 * means the first paint after a rotation is always wrong.
 *
 * The illustration is capped by viewport height rather than given a fixed box, so
 * the words are never pushed off the bottom of a short screen.
 */

const ILLUSTRATION_PX = 720;

export interface StoryPageViewProps {
  page: StoryPageResponse;
  /** Milliseconds into this page's narration, for the follow-along highlight. */
  elapsedMs: number;
}

export function StoryPageView({ page, elapsedMs }: StoryPageViewProps) {
  return (
    <div
      data-testid="story-page"
      data-page-number={page.pageNumber}
      className="grid flex-1 grid-cols-1 content-center items-center gap-4 landscape:grid-cols-2 landscape:gap-8"
    >
      {page.illustrationUrl === null ? (
        <div className="flex items-center justify-center rounded-xl bg-muted p-8 landscape:h-full">
          <BookOpen
            aria-hidden="true"
            className="size-16 text-muted-foreground"
          />
        </div>
      ) : (
        <Image
          // `alt=""`: the picture illustrates the sentence beside it, which is
          // read aloud and rendered in full. Describing it again would make a
          // screen reader announce the page twice.
          alt=""
          src={page.illustrationUrl}
          width={ILLUSTRATION_PX}
          height={ILLUSTRATION_PX}
          priority
          className="mx-auto h-auto max-h-[45dvh] w-auto max-w-full rounded-xl object-contain landscape:max-h-[70dvh]"
        />
      )}

      <NarratedText
        text={page.text}
        timings={page.narrationTimings}
        elapsedMs={elapsedMs}
      />
    </div>
  );
}
