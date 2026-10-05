import type { NarrationTimings } from "@kidlearn/types";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { activeSpanIndex, NarratedText } from "./NarratedText";

const TEXT = "The monkey shared the banana.";

const TIMINGS: NarrationTimings = {
  unit: "word",
  spans: [
    { start: 0, end: 3, tMs: 0 }, // "The"
    { start: 4, end: 10, tMs: 300 }, // "monkey"
    { start: 11, end: 17, tMs: 800 }, // "shared"
  ],
};

function highlighted(): string[] {
  return [...document.querySelectorAll("[data-active='true']")].map(
    (node) => node.textContent ?? "",
  );
}

describe("without timings", () => {
  it("renders the page text whole", () => {
    render(<NarratedText text={TEXT} timings={null} />);

    expect(screen.getByTestId("narrated-text")).toHaveTextContent(TEXT);
    expect(highlighted()).toEqual([]);
  });
});

describe("with timings", () => {
  it("renders the same sentence, spaces and punctuation intact", () => {
    render(<NarratedText text={TEXT} timings={TIMINGS} elapsedMs={0} />);

    // The gaps between spans are text too. Rendering only the timed runs would
    // quietly rewrite the story as "Themonkeyshared".
    expect(screen.getByTestId("narrated-text")).toHaveTextContent(TEXT);
  });

  it("highlights the run the narration has reached, and only that one", () => {
    render(<NarratedText text={TEXT} timings={TIMINGS} elapsedMs={350} />);

    expect(highlighted()).toEqual(["monkey"]);
  });

  it("keeps the last-reached run lit in the gap before the next one", () => {
    render(<NarratedText text={TEXT} timings={TIMINGS} elapsedMs={700} />);

    // 700ms is past "monkey" and before "shared". Highlighting nothing there
    // would make the marker blink off between every pair of words.
    expect(highlighted()).toEqual(["monkey"]);
  });

  it("highlights nothing before the first word is spoken", () => {
    render(
      <NarratedText
        text={TEXT}
        timings={{
          unit: "word",
          spans: [{ start: 0, end: 3, tMs: 500 }],
        }}
        elapsedMs={0}
      />,
    );

    expect(highlighted()).toEqual([]);
  });

  it("still shows the whole page when a span points outside the text", () => {
    render(
      <NarratedText
        text={TEXT}
        timings={{
          unit: "word",
          spans: [
            { start: 0, end: 3, tMs: 0 },
            // Nonsense from a bad pipeline run — off the end of the string.
            { start: 900, end: 950, tMs: 100 },
          ],
        }}
        elapsedMs={200}
      />,
    );

    // Bad timing data costs a highlight, never a word of the story.
    expect(screen.getByTestId("narrated-text")).toHaveTextContent(TEXT);
  });

  it("renders sentence-level timings the same way", () => {
    render(
      <NarratedText
        text={TEXT}
        timings={{
          unit: "sentence",
          spans: [{ start: 0, end: TEXT.length, tMs: 0 }],
        }}
        elapsedMs={10}
      />,
    );

    expect(highlighted()).toEqual([TEXT]);
  });
});

describe("activeSpanIndex", () => {
  it("is -1 before the first span is reached", () => {
    expect(
      activeSpanIndex(
        { unit: "word", spans: [{ start: 0, end: 3, tMs: 100 }] },
        50,
      ),
    ).toBe(-1);
  });

  it("holds the last span reached through the gap before the next one", () => {
    // The reader only re-renders when this changes, so a value that flickered
    // between words would bring back the ten-renders-a-second cost.
    expect(activeSpanIndex(TIMINGS, 299)).toBe(0);
    expect(activeSpanIndex(TIMINGS, 300)).toBe(1);
    expect(activeSpanIndex(TIMINGS, 799)).toBe(1);
    expect(activeSpanIndex(TIMINGS, 5000)).toBe(2);
  });
});
