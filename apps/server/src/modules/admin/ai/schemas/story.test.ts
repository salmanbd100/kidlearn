// The contract the story generator holds the model to (file 35, FR-AI-02).

import { describe, expect, it } from "vitest";
import { buildStoryGenerationOutputSchema } from "./story.js";

const CHARACTERS = [
  {
    name: "Bina",
    kind: "rabbit",
    visualDescription:
      "A small white rabbit with one grey ear and a red scarf.",
  },
  {
    name: "Tuli",
    kind: "turtle",
    visualDescription: "A round green turtle with a yellow-patterned shell.",
  },
];

function page(pageNumber: number, overrides: Record<string, unknown> = {}) {
  return {
    pageNumber,
    text: { en: `Page ${pageNumber}.`, bn: `পৃষ্ঠা ${pageNumber}।` },
    illustrationPrompt: `Cartoon scene: Bina the rabbit on page ${pageNumber}.`,
    ...overrides,
  };
}

function output(overrides: Record<string, unknown> = {}) {
  return {
    title: { en: "Bina Shares", bn: "বিনা ভাগ করে" },
    moral: { en: "Sharing makes play better.", bn: "ভাগ করলে খেলা আরও ভালো হয়।" },
    characterDescriptions: CHARACTERS,
    pages: [1, 2, 3, 4, 5, 6, 7].map((one) => page(one)),
    ...overrides,
  };
}

const SEVEN_PAGES_BOTH = buildStoryGenerationOutputSchema({
  languages: ["en", "bn"],
  pageCount: 7,
});

describe("a well-formed story", () => {
  it("parses", () => {
    const result = SEVEN_PAGES_BOTH.safeParse(output());

    expect(result.success).toBe(true);
  });

  it("keeps the pages in the order the model returned them", () => {
    const parsed = SEVEN_PAGES_BOTH.parse(output());

    expect(parsed.pages.map((one) => one.pageNumber)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
  });
});

describe("locales", () => {
  it("rejects a page missing a requested locale", () => {
    const pages = [1, 2, 3, 4, 5, 6, 7].map((one) =>
      one === 3 ? page(one, { text: { en: "Page 3." } }) : page(one),
    );

    const result = SEVEN_PAGES_BOTH.safeParse(output({ pages }));

    expect(result.success).toBe(false);
    expect(String(result.error)).toContain("bn");
  });

  it("rejects a locale nobody asked for", () => {
    // Strictly, for the reason `./lesson.ts` gives: Bangla page text generated
    // for an English-only story is content no translation row will ever hold, and
    // dropping it silently would bill for words that vanish.
    const englishOnly = buildStoryGenerationOutputSchema({
      languages: ["en"],
      pageCount: 6,
    });

    const result = englishOnly.safeParse(
      output({
        title: { en: "Bina Shares" },
        moral: { en: "Sharing makes play better." },
        pages: [1, 2, 3, 4, 5, 6].map((one) => page(one)),
      }),
    );

    expect(result.success).toBe(false);
    expect(String(result.error)).toContain("bn");
  });

  it("requires the moral in every requested locale", () => {
    // `StoryTranslation.moral` is read aloud on the finish screen (file 26), so
    // an English-only moral would be untranslated child-facing text.
    const result = SEVEN_PAGES_BOTH.safeParse(
      output({ moral: { en: "Sharing makes play better." } }),
    );

    expect(result.success).toBe(false);
  });
});

describe("page numbering", () => {
  it("rejects a gap in the sequence", () => {
    const result = SEVEN_PAGES_BOTH.safeParse(
      output({ pages: [1, 2, 3, 5, 6, 7, 8].map((one) => page(one)) }),
    );

    expect(result.success).toBe(false);
    expect(String(result.error)).toContain("pages");
  });

  it("rejects a repeated page number", () => {
    // `sortOrder` comes from this field and is unique per story, so a repeat
    // would fail the insert and lose the whole generation.
    const result = SEVEN_PAGES_BOTH.safeParse(
      output({ pages: [1, 2, 3, 3, 4, 5, 6].map((one) => page(one)) }),
    );

    expect(result.success).toBe(false);
  });

  it("rejects pages that do not start at one", () => {
    const result = SEVEN_PAGES_BOTH.safeParse(
      output({ pages: [2, 3, 4, 5, 6, 7, 8].map((one) => page(one)) }),
    );

    expect(result.success).toBe(false);
  });

  it("rejects a page count other than the one commissioned", () => {
    const result = SEVEN_PAGES_BOTH.safeParse(
      output({ pages: [1, 2, 3, 4, 5, 6].map((one) => page(one)) }),
    );

    expect(result.success).toBe(false);
  });
});

describe("illustration prompts", () => {
  it("rejects a prompt that names no declared character", () => {
    const pages = [1, 2, 3, 4, 5, 6, 7].map((one) =>
      one === 4
        ? page(one, {
            illustrationPrompt: "Cartoon scene: a small animal hops away.",
          })
        : page(one),
    );

    const result = SEVEN_PAGES_BOTH.safeParse(output({ pages }));

    expect(result.success).toBe(false);
    expect(String(result.error)).toContain("Bina");
  });

  it("accepts any one of the declared characters", () => {
    const pages = [1, 2, 3, 4, 5, 6, 7].map((one) =>
      one === 4
        ? page(one, {
            illustrationPrompt: "Cartoon scene: Tuli the turtle waits.",
          })
        : page(one),
    );

    expect(SEVEN_PAGES_BOTH.safeParse(output({ pages })).success).toBe(true);
  });

  it("does not count a name that is only part of another word", () => {
    // "Bina" inside "binary" is not a character appearing on the page, and a
    // substring match would let an unusable prompt through.
    const pages = [1, 2, 3, 4, 5, 6, 7].map((one) =>
      one === 2
        ? page(one, {
            illustrationPrompt: "Cartoon scene: binary shapes float past.",
          })
        : page(one),
    );

    expect(SEVEN_PAGES_BOTH.safeParse(output({ pages })).success).toBe(false);
  });

  it("matches a character name regardless of case", () => {
    const pages = [1, 2, 3, 4, 5, 6, 7].map((one) =>
      one === 2
        ? page(one, { illustrationPrompt: "Cartoon scene: bina hops away." })
        : page(one),
    );

    expect(SEVEN_PAGES_BOTH.safeParse(output({ pages })).success).toBe(true);
  });
});

describe("characters", () => {
  it("rejects a story with no characters to draw", () => {
    expect(
      SEVEN_PAGES_BOTH.safeParse(output({ characterDescriptions: [] })).success,
    ).toBe(false);
  });

  it("rejects more characters than a six-page story can carry", () => {
    const tooMany = [1, 2, 3, 4, 5].map((one) => ({
      name: `Name${one}`,
      kind: "rabbit",
      visualDescription: "A rabbit.",
    }));

    expect(
      SEVEN_PAGES_BOTH.safeParse(output({ characterDescriptions: tooMany }))
        .success,
    ).toBe(false);
  });

  it("rejects a character with no visual description to draw from", () => {
    const result = SEVEN_PAGES_BOTH.safeParse(
      output({
        characterDescriptions: [
          { name: "Bina", kind: "rabbit", visualDescription: "" },
        ],
      }),
    );

    expect(result.success).toBe(false);
  });
});

describe("strictness", () => {
  it("rejects a field the schema does not declare", () => {
    // `.strict()` everywhere, for the reason `packages/types/src/primitives.ts`
    // sets out: a misspelled or invented key must be an issue a reviewer sees,
    // not a value that vanishes.
    expect(
      SEVEN_PAGES_BOTH.safeParse(output({ coverPrompt: "A rabbit on a hill" }))
        .success,
    ).toBe(false);
  });
});
