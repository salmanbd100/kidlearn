import type { GradeLevel, Prisma } from "@kidlearn/db";
import type { Locale } from "@kidlearn/types";
import { ApiError } from "../../../lib/errors.js";
import { prisma } from "../../../lib/prisma.js";
import { slugify } from "../../../lib/slug.js";
import { generateStructured } from "../gemini-text.js";
import { KIDLEARN_SYSTEM_PROMPT } from "../prompts/lesson.js";
import { buildStoryUserPrompt } from "../prompts/story.js";
import { runGenerationJob } from "../run-generation-job.js";
import {
  buildStoryGenerationOutputSchema,
  type StoryGenerationOutput,
} from "../schemas/story.js";

// The AI Story Generator (FR-AI-02).

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

/** Slugified title, suffixed until it is free. */
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
