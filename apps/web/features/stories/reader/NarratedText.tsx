"use client";

import type { NarrationTimings } from "@kidlearn/types";
import { cn } from "@kidlearn/ui";

export interface NarratedTextProps {
  text: string;
  timings: NarrationTimings | null;
  /** Milliseconds into the current narration clip. Ignored without `timings`. */
  elapsedMs?: number;
}

export function NarratedText({
  text,
  timings,
  elapsedMs = 0,
}: NarratedTextProps) {
  const segments =
    timings === null ? null : toSegments(text, timings, elapsedMs);

  return (
    <p
      data-testid="narrated-text"
      // `max-w-prose` keeps lines near ~66 characters (design.md §3.3); past that a new reader loses their place.
      className="mx-auto max-w-prose text-balance font-body portrait:text-center landscape:mx-0 text-2xl leading-relaxed text-foreground sm:text-3xl"
    >
      {segments === null
        ? text
        : segments.map((segment) => (
            <span
              key={segment.start}
              data-active={segment.isActive ? "true" : undefined}
              className={cn(
                "transition-colors",
                // A background wash rather than a colour swap: the highlight has
                // to be visible without carrying the meaning by colour alone
                // (design.md §2.3), and the word underneath must stay as legible
                // as the rest of the sentence.
                segment.isActive && "rounded-sm bg-accent/40",
              )}
            >
              {segment.text}
            </span>
          ))}
    </p>
  );
}

/** The last span the narration has reached, not the one containing `elapsedMs`: treating a gap as "nothing read" would blink the highlight off between words. `-1` before the first. */
export function activeSpanIndex(
  timings: NarrationTimings,
  elapsedMs: number,
): number {
  let activeIndex = -1;
  timings.spans.forEach((span, index) => {
    if (span.tMs <= elapsedMs) activeIndex = index;
  });
  return activeIndex;
}

interface Segment {
  start: number;
  text: string;
  isActive: boolean;
}

function toSegments(
  text: string,
  timings: NarrationTimings,
  elapsedMs: number,
): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;

  const activeIndex = activeSpanIndex(timings, elapsedMs);

  timings.spans.forEach((span, index) => {
    if (
      span.start < cursor ||
      span.end > text.length ||
      span.end <= span.start
    ) {
      return;
    }
    if (span.start > cursor) {
      segments.push({
        start: cursor,
        text: text.slice(cursor, span.start),
        isActive: false,
      });
    }
    segments.push({
      start: span.start,
      text: text.slice(span.start, span.end),
      isActive: index === activeIndex,
    });
    cursor = span.end;
  });

  if (cursor < text.length) {
    segments.push({ start: cursor, text: text.slice(cursor), isActive: false });
  }

  return segments;
}
