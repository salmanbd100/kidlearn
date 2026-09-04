import type { GradeLevel } from "@kidlearn/db";
import type { Locale } from "@kidlearn/types";
import { GRADE_LABELS, LOCALE_LABELS } from "./labels.js";

/**
 * The prompt behind the AI Story Generator (FR-AI-02).
 *
 * The system prompt is the shared file-34 persona, unchanged — a safety rule
 * tightened there tightens here. This adds only what a story needs: the world it
 * belongs to, the moral it has to demonstrate, and the two rules the schema's
 * refinements enforce, stated in prose as well because a model told the rule
 * beforehand costs one call rather than two.
 *
 * The JSON shape is not restated. The request's `responseJsonSchema` is generated
 * from the Zod object the answer is validated against (`schemas/story.ts`), so
 * describing the fields here would be a second source of truth.
 */

export interface StoryPromptInput {
  gradeLevels: readonly GradeLevel[];
  theme: string;
  worldName: string;
  worldSlug: string;
  languages: readonly Locale[];
  pageCount: number;
}

export function buildStoryUserPrompt(input: StoryPromptInput): string {
  const gradeLevels = input.gradeLevels
    .map((grade) => GRADE_LABELS[grade])
    .join(", ");
  const languages = input.languages
    .map((language) => LOCALE_LABELS[language])
    .join(", ");

  return `Write an illustrated children's story.

Grade levels: ${gradeLevels}
Theme / moral to teach: ${input.theme}
World: ${input.worldName} (${input.worldSlug}) — the setting, characters, and atmosphere must belong
to this world (e.g. jungle animals for jungle, sea creatures for ocean).
Languages: ${languages}
Page count: exactly ${input.pageCount} pages.

Produce:
1. title — a short, playful story title, per language.
2. moral — one sentence stating the lesson of the story, per language. It is read aloud on
   the finish screen, so keep it warm and plain.
3. characterDescriptions — for every character that appears: name, kind (animal/creature),
   and a visualDescription precise enough that an illustrator who has never seen the
   character draws it the same way every time (colours, size, clothing/accessories,
   distinctive features). These descriptions will be reused across many illustrations.
4. pages — for each page: pageNumber (1-based, sequential, no gaps or repeats), text per
   language (1–3 short sentences a 3–6 year old follows when read aloud), and
   illustrationPrompt (English, cartoon style, describing the scene and naming which
   characters appear — by the names given above, so their visualDescription can be applied).

Every illustrationPrompt must name at least one of the characters you declared. "A small
animal hops away" cannot be drawn consistently; "Bina the rabbit hops away" can.

The story must end warmly, with the moral demonstrated through the characters' actions —
never stated as a lecture.`;
}
