import type { GradeLevel, Prisma } from "@kidlearn/db";
import type { Locale } from "@kidlearn/types";
import { ApiError } from "../../../lib/errors.js";
import { prisma } from "../../../lib/prisma.js";
import { slugify } from "../../../lib/slug.js";
import { generateStructured } from "../claude.js";
import { KIDLEARN_SYSTEM_PROMPT } from "../prompts/lesson.js";
import { buildStoryUserPrompt } from "../prompts/story.js";
import { runGenerationJob } from "../run-generation-job.js";
import {
  buildStoryGenerationOutputSchema,
  type StoryGenerationOutput,
} from "../schemas/story.js";

/**
 * The AI Story Generator (FR-AI-02).
 *
 * An admin picks the grades, a moral, a world and the languages; this builds the
 * prompt, runs it through `runGenerationJob`, and writes what comes back as a
 * **draft** `Story` with its pages in order and text in every requested language.
 *
 * **Nothing here can publish, and that is structural rather than careful.** The
 * `story.create` below omits `status`, so the column takes its `draft` default,
 * and no branch in this file writes any other value. The student library filters
 * `status: "published"`, so a generated story answers `404` to a child until an
 * administrator moves it through review (file 37, FR-AI-07). The row carries
 * `aiJobId`, which is what lets that file refuse to publish generated content no
 * human approved.
 *
 * **The story has two titles and two morals, for the reason the lesson has two
 * titles.** `Story.title` and `Story.theme` are the admin labels the CMS lists and
 * an audit trail names; `StoryTranslation.title` and `.moral` are what a child
 * reads and hears, so they are generated per locale (FR-I18N-01). The slug comes
 * from the English title where English was asked for, and from the admin's theme
 * line otherwise — a Bangla title transliterates into a slug nobody can search.
 *
 * **`characterDescriptions` is not persisted here.** It stays in the job's
 * `rawOutput`, where file 36's image pipeline reads it for illustration
 * consistency and file 37 promotes it into `CharacterSheet` rows on approval.
 * Writing those rows now would create character records for a story that may yet
 * be rejected.
 */

const TOOL_NAME = "submit_story";

/** The spec's default: seven pages, the middle of the 6–8 range. */
export const DEFAULT_PAGE_COUNT = 7;

export interface GenerateStoryInput {
  gradeLevels: GradeLevel[];
  theme: string;
  worldId: string;
  languages: Locale[];
  pageCount?: number;
}

export interface GenerateStoryResult {
  jobId: string;
  status: "awaiting_review" | "failed";
}

export async function generateStory(
  input: GenerateStoryInput,
): Promise<GenerateStoryResult> {
  const world = await prisma.world.findUnique({
    where: { id: input.worldId },
    select: { id: true, name: true, slug: true },
  });
  if (!world) throw ApiError.notFound("No such world");

  const pageCount = input.pageCount ?? DEFAULT_PAGE_COUNT;
  const schema = buildStoryGenerationOutputSchema({
    languages: input.languages,
    pageCount,
  });
  const userPrompt = buildStoryUserPrompt({
    gradeLevels: input.gradeLevels,
    theme: input.theme,
    worldName: world.name,
    worldSlug: world.slug,
    languages: input.languages,
    pageCount,
  });

  return runGenerationJob<StoryGenerationOutput>({
    type: "story",
    // The admin's parameters *and* the resolved prompt. A reviewer reading a
    // generation months later needs the words the model actually saw, and the
    // prompt builder will have changed by then (FR-AI-08).
    input: {
      gradeLevels: input.gradeLevels,
      theme: input.theme,
      worldId: world.id,
      worldName: world.name,
      languages: input.languages,
      pageCount,
      systemPrompt: KIDLEARN_SYSTEM_PROMPT,
      userPrompt,
    },
    schema,
    generate: (retryFeedback) =>
      generateStructured({
        system: KIDLEARN_SYSTEM_PROMPT,
        // A second *user* turn rather than replaying the rejected attempt as an
        // assistant turn — see `generators/lesson.ts` for why.
        messages:
          retryFeedback === undefined
            ? [{ role: "user", content: userPrompt }]
            : [
                { role: "user", content: userPrompt },
                { role: "user", content: retryFeedback },
              ],
        toolName: TOOL_NAME,
        outputSchema: schema,
      }),
    persist: (parsed, jobId, tx) =>
      persistStory({ input, parsed, jobId, tx, worldId: world.id }),
  });
}

async function persistStory({
  input,
  parsed,
  jobId,
  tx,
  worldId,
}: {
  input: GenerateStoryInput;
  parsed: StoryGenerationOutput;
  jobId: string;
  tx: Prisma.TransactionClient;
  worldId: string;
}): Promise<Prisma.JsonObject> {
  const internalTitle = parsed.title.en ?? input.theme.trim();
  const slug = await uniqueSlug(tx, internalTitle);

  const story = await tx.story.create({
    data: {
      slug,
      title: internalTitle,
      // The admin's own words, kept as the authoring label for the moral — the
      // sentence a child hears is the per-locale one below.
      theme: input.theme.trim(),
      worldId,
      gradeLevels: input.gradeLevels,
      aiJobId: jobId,
      translations: {
        create: input.languages.map((language) => ({
          language,
          // The schema requires every requested locale, so these fall back only
          // if that contract is ever loosened.
          title: parsed.title[language] ?? internalTitle,
          moral: parsed.moral[language] ?? null,
        })),
      },
    },
    select: { id: true },
  });

  const pageIds: string[] = [];
  for (const page of parsed.pages) {
    const row = await tx.storyPage.create({
      data: {
        storyId: story.id,
        // The schema has already refined these to exactly 1..pages.length, which
        // is what makes it safe to use the model's numbering as the unique
        // `sortOrder` rather than the array index.
        sortOrder: page.pageNumber,
        illustrationPrompt: page.illustrationPrompt,
        translations: {
          create: input.languages.map((language) => ({
            language,
            text: page.text[language] ?? "",
          })),
        },
      },
      select: { id: true },
    });
    pageIds.push(row.id);
  }

  return { storyId: story.id, pageIds };
}

/**
 * Slugified title, suffixed until it is free.
 *
 * `Story.slug` is unique across the whole table rather than per parent, so the
 * collision this walks around is any story ever written — two "The Kind Rabbit"s
 * generated a month apart are the normal case, not an admin mistake.
 */
async function uniqueSlug(
  tx: Prisma.TransactionClient,
  title: string,
): Promise<string> {
  const base = slugify(title) || "story";

  for (let suffix = 0; suffix < 50; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
    const taken = await tx.story.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  throw new Error(`Could not find a free slug for "${title}"`);
}
