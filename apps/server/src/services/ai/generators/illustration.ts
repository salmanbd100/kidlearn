import type { BatchGenerationRef } from "@kidlearn/types";
import { z } from "zod";
import { ApiError } from "../../../lib/errors.js";
import { prisma } from "../../../lib/prisma.js";
import {
  registerAsset,
  resourceTypeFor,
  uploadBuffer,
  uploadFolderFor,
} from "../../mediaService.js";
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

// Batch illustration (file 36, FR-AI-05, FR-AI-09, FR-CMS-05).

export interface GenerateIllustrationsInput {
  storyId: string;
}

const IllustrationUploadSchema = z.object({ url: z.string().url() }).strict();
type IllustrationUpload = z.infer<typeof IllustrationUploadSchema>;

/** Same reasoning as `narration.ts`: no usable picture means the page is missing one. */
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

  // Pages with no brief are not candidates at all rather than skipped ones: a
  // hand-authored page has nothing to draw from, so counting it as "already had a
  // picture" would tell the admin something untrue.
  const candidates = story.pages.flatMap((page) =>
    page.illustrationPrompt === null || page.illustrationPrompt.trim() === ""
      ? []
      : [{ ...page, illustrationPrompt: page.illustrationPrompt.trim() }],
  );

  const inFlight = await readInFlightPages(input.storyId);
  const missing = candidates.filter(
    (page) => page.illustrationAssetId === null && !inFlight.has(page.id),
  );

  await assertWithinDailyCap("image", missing.length);

  const sheets = await readCharacterSheets(story.worldId);

  const jobIds: string[] = [];
  let failed = 0;
  for (const page of missing) {
    // Same reasoning as `narration.ts`: the job records its own failure and
    // resolves rather than throwing, so a batch that reported only ids would call
    // a wholly failed run a success.
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

/** The sheets that apply to a story: its world's, then the world-less ones. */
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
    // The resolved prompt verbatim, not the page's brief plus a note that sheets
    // were applied. A reviewer looking at a rabbit that came back wrong needs the
    // words the model actually saw, and the sheet may have been edited since
    // (FR-AI-08, FR-AI-09).
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

      // Zeroed for the reason `narration.ts` gives: this provider does not bill
      // in tokens, and reporting anything else as tokens would corrupt the one
      // figure the audit trail sums across attempts.
      return { raw: { url }, usage: { inputTokens: 0, outputTokens: 0 } };
    },
    persist: async (parsed, jobId, tx) => {
      const asset = await registerAsset(
        {
          url: parsed.url,
          kind: "image",
          // Null, and not an oversight: a picture has no language. Stamping one
          // would hide the illustration from the other locale's media filter
          // (FR-I18N-05 is about *narration* being per-language).
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
    // The JSONB column boundary. The shape was written by `runIllustrationJob`
    // above and the field is re-checked before use.
    const targetId = (job.input as Record<string, unknown>).targetId;
    if (typeof targetId === "string") pages.add(targetId);
  }
  return pages;
}
