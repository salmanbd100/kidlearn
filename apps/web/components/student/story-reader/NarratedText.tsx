"use client";

import type { NarrationTimings } from "@kidlearn/types";
import { cn } from "@kidlearn/ui";

/**
 * A story page's text, following the narration when the recording knows where it
 * is (FR-STORY-02).
 *
 * **One component, two data shapes — never two screens.** Every MVP story arrives
 * with `narrationTimings: null` and renders as plain text; when the voice pipeline
 * (file 36) starts producing spans, the same component highlights the run being
 * read. Writing the highlight later, as a second reading view, is how a feature
 * ends up shipped twice and tested once.
 *
 * The spans are **character offsets into this exact string**, so nothing here
 * re-tokenises the text. That matters beyond tidiness: Bangla does not break on
 * spaces where English does, and a client-side word split would disagree with the
 * pipeline's in one of the two languages the app ships.
 *
 * `text-2xl` is the floor a child reads a story at — well above the 20px kid
 * minimum (design.md §3.2), because this is the one screen whose text is the
 * point rather than a label on something else.
 */

export interface NarratedTextProps {
  text: string;
  /** `null` for every story until the voice pipeline records timings. */
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
      // `max-w-prose` keeps the line length near the ~66 characters design.md §3.3
      // asks for; past that a new reader loses which line they were on.
      className="max-w-prose text-balance font-body text-2xl leading-relaxed text-foreground sm:text-3xl"
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

interface Segment {
  start: number;
  text: string;
  isActive: boolean;
}

/**
 * Splits `text` into the timed runs and the gaps between them, marking the run
 * the narration is inside.
 *
 * The gaps matter: spaces and punctuation sit *between* spans, and dropping them
 * would rewrite the sentence. Anything after the last span is emitted too, so a
 * pipeline that timed only the first half of a page still shows the whole page.
 *
 * A span whose offsets fall outside the string is skipped rather than clamped —
 * bad timing data must cost a highlight, never a word of the story.
 */
function toSegments(
  text: string,
  timings: NarrationTimings,
  elapsedMs: number,
): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;

  // The last span the narration has reached, rather than the span whose range
  // contains `elapsedMs`: a run has no end time, and treating the gap between two
  // words as "nothing is being read" would blink the highlight off between them.
  let activeIndex = -1;
  timings.spans.forEach((span, index) => {
    if (span.tMs <= elapsedMs) activeIndex = index;
  });

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
