import type { Locale } from "@kidlearn/types";
import { z } from "zod";
import { localized } from "./localized.js";

// What the story generator's answer must be shaped like (FR-AI-02).

/** The spec's bounds: 6–8 pages, 1–4 characters. */
export const STORY_PAGE_BOUNDS = { min: 6, max: 8 } as const;
export const CHARACTER_BOUNDS = { min: 1, max: 4 } as const;

/** `StoryTranslation.title` shares the column cap the admin story body uses. */
const TITLE_MAX = 200;

const CharacterDescriptionSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .describe(
        "The character's name as it appears in the story text and in every illustration prompt.",
      ),
    kind: z
      .string()
      .min(1)
      .describe("What the character is — a rabbit, a turtle, a small cloud."),
    visualDescription: z
      .string()
      .min(1)
      .describe(
        "Colours, size, clothing or accessories and distinctive features, precise enough that an illustrator who has never seen the character draws it the same way every time. Reused across every illustration.",
      ),
  })
  .strict();

export function buildStoryGenerationOutputSchema({
  languages,
  pageCount,
}: {
  languages: readonly Locale[];
  pageCount: number;
}): z.ZodType<StoryGenerationOutput, z.ZodTypeDef, unknown> {
  return z
    .object({
      title: localized(
        languages,
        "The child-facing story title, short and playful, written for the language it is in rather than translated from English.",
        TITLE_MAX,
      ),
      moral: localized(
        languages,
        "One sentence naming what the story teaches, read aloud on the finish screen. Warm, never a lecture.",
      ),
      characterDescriptions: z
        .array(CharacterDescriptionSchema)
        .min(CHARACTER_BOUNDS.min)
        .max(CHARACTER_BOUNDS.max)
        .describe("Every character who appears in the story."),
      pages: z
        .array(
          z
            .object({
              pageNumber: z
                .number()
                .int()
                .positive()
                .describe("1-based and sequential, with no gaps or repeats."),
              text: localized(
                languages,
                "One to three short sentences a 3–6 year old follows when they are read aloud.",
              ),
              illustrationPrompt: z
                .string()
                .min(1)
                .describe(
                  "English. The scene in cartoon style, naming which characters appear so their visualDescription can be applied.",
                ),
            })
            .strict(),
        )
        .length(pageCount),
    })
    .strict()
    .superRefine((value, ctx) => {
      addPageNumberIssues(ctx, value.pages);
      addUnnamedCharacterIssues(ctx, value);
    });
}

function addPageNumberIssues(
  ctx: z.RefinementCtx,
  pages: ReadonlyArray<{ pageNumber: number }>,
): void {
  pages.forEach((page, index) => {
    if (page.pageNumber === index + 1) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["pages", index, "pageNumber"],
      message: `expected ${index + 1} — pages must be numbered 1 to ${pages.length} in order, with no gaps or repeats`,
    });
  });
}

/** A prompt that names no declared character, reported per page. */
function addUnnamedCharacterIssues(
  ctx: z.RefinementCtx,
  value: {
    characterDescriptions: ReadonlyArray<{ name: string }>;
    pages: ReadonlyArray<{ illustrationPrompt: string }>;
  },
): void {
  const names = value.characterDescriptions
    .map((one) => one.name.trim())
    .filter((one) => one.length > 0);
  if (names.length === 0) return;

  value.pages.forEach((page, index) => {
    const named = names.some((name) => mentions(page.illustrationPrompt, name));
    if (named) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["pages", index, "illustrationPrompt"],
      message: `must name at least one of the declared characters (${names.join(", ")}) so the illustrator can apply its visualDescription`,
    });
  });
}

function mentions(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`,
    "iu",
  ).test(text);
}

/**
 * The parsed shape, widened to every locale as optional — see the same note on
 * `LessonGenerationOutput` for why the static type cannot be exact.
 */
export interface StoryGenerationOutput {
  title: Partial<Record<Locale, string>>;
  moral: Partial<Record<Locale, string>>;
  characterDescriptions: Array<{
    name: string;
    kind: string;
    visualDescription: string;
  }>;
  pages: Array<{
    pageNumber: number;
    text: Partial<Record<Locale, string>>;
    illustrationPrompt: string;
  }>;
}
