import type { GradeLevel, Prisma } from "@kidlearn/db";
import type { Locale } from "@kidlearn/types";
import { prisma } from "../../../../config/prisma.js";
import { ApiError } from "../../../../shared/errors/errors.js";
import { slugify } from "../../../../shared/utils/slug.js";
import { generateStructured } from "../gemini-text.js";
import { KIDLEARN_SYSTEM_PROMPT } from "../prompts/lesson.js";
import { buildStoryUserPrompt } from "../prompts/story.js";
import { runGenerationJob } from "../run-generation-job.js";
import {
  buildStoryGenerationOutputSchema,
  type StoryGenerationOutput,
} from "../schemas/story.js";
import type { GenerationContext } from "../types.js";

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

export interface PreparedStory {
  worldId: string;
  worldName: string;
  worldSlug: string;
  pageCount: number;
  jobInput: Prisma.JsonObject;
}

export async function prepareStory(
  input: GenerateStoryInput,
): Promise<PreparedStory> {
  const world = await prisma.world.findUnique({
    where: { id: input.worldId },
    select: { id: true, name: true, slug: true },
  });
  if (!world) throw ApiError.notFound("No such world");

  const pageCount = input.pageCount ?? DEFAULT_PAGE_COUNT;

  return {
    worldId: world.id,
    worldName: world.name,
    worldSlug: world.slug,
    pageCount,
    jobInput: {
      gradeLevels: input.gradeLevels,
      theme: input.theme,
      worldId: world.id,
      worldName: world.name,
      languages: input.languages,
      pageCount,
    },
  };
}

export async function generateStory(
  input: GenerateStoryInput,
  context: GenerationContext = {},
): Promise<GenerateStoryResult> {
  const prepared = await prepareStory(input);

  const schema = buildStoryGenerationOutputSchema({
    languages: input.languages,
    pageCount: prepared.pageCount,
  });
  const userPrompt = buildStoryUserPrompt({
    gradeLevels: input.gradeLevels,
    theme: input.theme,
    worldName: prepared.worldName,
    worldSlug: prepared.worldSlug,
    languages: input.languages,
    pageCount: prepared.pageCount,
  });

  return runGenerationJob<StoryGenerationOutput>({
    type: "story",
    ...(context.requestedById === undefined
      ? {}
      : { requestedById: context.requestedById }),
    // Params and resolved prompt: the prompt builder will have changed by the time a reviewer reads this.
    input: {
      ...prepared.jobInput,
      systemPrompt: KIDLEARN_SYSTEM_PROMPT,
      userPrompt,
    },
    schema,
    generate: (retryFeedback) =>
      generateStructured({
        system: KIDLEARN_SYSTEM_PROMPT,
        // Second user turn, not a replayed assistant turn (see generators/lesson.ts).
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
      persistStory({ input, parsed, jobId, tx, worldId: prepared.worldId }),
  });
}

export async function persistStory({
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
      // The admin's own words, kept as the authoring label; the child hears the per-locale sentence below.
      theme: input.theme.trim(),
      worldId,
      gradeLevels: input.gradeLevels,
      aiJobId: jobId,
      translations: {
        create: input.languages.map((language) => ({
          language,
          // The schema requires every requested locale; these fall back only if that is loosened.
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
        // Refined to exactly 1..pages.length, so the model's numbering is safe as the unique sortOrder.
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
