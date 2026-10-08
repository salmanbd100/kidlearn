import type { BatchGenerationRef } from "@kidlearn/types";
import { z } from "zod";
import { prisma } from "../../../../config/prisma.js";
import { ApiError } from "../../../../shared/errors/errors.js";
import {
  registerAsset,
  resourceTypeFor,
  uploadBuffer,
  uploadFolderFor,
} from "../../media/media.service.js";
import {
  buildIllustrationPrompt,
  type CharacterSheetRef,
  generateIllustration,
} from "../gemini.js";
import { assertWithinDailyCap } from "../rate-guard.js";
import {
  type GenerationJobResult,
  runGenerationJob,
} from "../run-generation-job.js";
import { failStaleJobs } from "../stale-jobs.js";

export interface GenerateIllustrationsInput {
  storyId: string;
}

const IllustrationUploadSchema = z.object({ url: z.string().url() }).strict();
type IllustrationUpload = z.infer<typeof IllustrationUploadSchema>;

const LIVE_JOB_STATUSES = [
  "pending",
  "generating",
  "awaiting_review",
  "approved",
] as const;

export async function generateIllustrationBatch(
  input: GenerateIllustrationsInput,
): Promise<BatchGenerationRef> {
  const story = await prisma.story.findUnique({
    where: { id: input.storyId },
    select: {
      worldId: true,
      pages: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          sortOrder: true,
          illustrationPrompt: true,
          illustrationAssetId: true,
        },
      },
    },
  });
  if (!story) throw ApiError.notFound("No such story");

  // Briefless pages are not candidates, not skips: counting a hand-authored page as "already had a picture" would be untrue.
  const candidates = story.pages.flatMap((page) =>
    page.illustrationPrompt === null || page.illustrationPrompt.trim() === ""
      ? []
      : [{ ...page, illustrationPrompt: page.illustrationPrompt.trim() }],
  );

  // Before the in-flight read, so a page whose job a crash stranded can be drawn again.
  await failStaleJobs();

  const inFlight = await readInFlightPages(input.storyId);
  const missing = candidates.filter(
    (page) => page.illustrationAssetId === null && !inFlight.has(page.id),
  );

  await assertWithinDailyCap("image", missing.length);

  const sheets = await readCharacterSheets(story.worldId);

  const jobIds: string[] = [];
  let failed = 0;
  for (const page of missing) {
    // Jobs record their own failure and resolve; without counting, a wholly failed batch would read as success.
    const { jobId, status } = await runIllustrationJob({
      storyId: input.storyId,
      pageId: page.id,
      sortOrder: page.sortOrder,
      prompt: page.illustrationPrompt,
      sheets,
    });
    jobIds.push(jobId);
    if (status === "failed") failed += 1;
  }

  return { jobIds, skipped: candidates.length - missing.length, failed };
}

async function readCharacterSheets(
  worldId: string,
): Promise<CharacterSheetRef[]> {
  return prisma.characterSheet.findMany({
    where: { OR: [{ worldId }, { worldId: null }] },
    orderBy: [{ worldId: "asc" }, { slug: "asc" }],
    select: { name: true, description: true },
  });
}

function runIllustrationJob(args: {
  storyId: string;
  pageId: string;
  sortOrder: number;
  prompt: string;
  sheets: CharacterSheetRef[];
}): Promise<GenerationJobResult> {
  const resolvedPrompt = buildIllustrationPrompt(args.prompt, args.sheets);

  return runGenerationJob<IllustrationUpload>({
    type: "image",
    // The resolved prompt verbatim: the sheet may be edited later, and a reviewer needs the words the model saw.
    input: {
      entity: "story",
      entityId: args.storyId,
      targetTable: "StoryPage",
      targetId: args.pageId,
      sortOrder: args.sortOrder,
      illustrationPrompt: args.prompt,
      characterNames: args.sheets.map((sheet) => sheet.name),
      resolvedPrompt,
    },
    schema: IllustrationUploadSchema,
    generate: async () => {
      const image = await generateIllustration(args.prompt, args.sheets);
      const url = await uploadBuffer(image, {
        folder: uploadFolderFor("image"),
        resourceType: resourceTypeFor("image"),
      });

      // Zeroed: this provider does not bill in tokens, and the audit trail sums this figure across attempts.
      return { raw: { url }, usage: { inputTokens: 0, outputTokens: 0 } };
    },
    persist: async (parsed, jobId, tx) => {
      const asset = await registerAsset(
        {
          url: parsed.url,
          kind: "image",
          // Null on purpose: a picture has no language, and stamping one would hide it from the other locale's media filter.
          language: null,
          aiJobId: jobId,
        },
        tx,
      );

      return {
        assetId: asset.id,
        url: asset.url,
        targetTable: "StoryPage",
        targetId: args.pageId,
        sortOrder: args.sortOrder,
      };
    },
  });
}

async function readInFlightPages(storyId: string): Promise<Set<string>> {
  const jobs = await prisma.aIGenerationJob.findMany({
    where: {
      type: "image",
      status: { in: [...LIVE_JOB_STATUSES] },
      input: { path: ["entityId"], equals: storyId },
    },
    select: { input: true },
  });

  const pages = new Set<string>();
  for (const job of jobs) {
    if (typeof job.input !== "object" || job.input === null) continue;
    // JSONB boundary: shape written by runIllustrationJob, re-checked before use.
    const targetId = (job.input as Record<string, unknown>).targetId;
    if (typeof targetId === "string") pages.add(targetId);
  }
  return pages;
}
