import type { Prisma } from "@kidlearn/db";
import {
  type BatchGenerationRef,
  LOCALES,
  type Locale,
  type NarrationEntity,
} from "@kidlearn/types";
import { z } from "zod";
import { ApiError } from "../../../lib/errors.js";
import { prisma } from "../../../lib/prisma.js";
import {
  registerAsset,
  resourceTypeFor,
  uploadBuffer,
  uploadFolderFor,
} from "../../mediaService.js";
import { generateNarration } from "../google-tts.js";
import { assertWithinDailyCap } from "../rate-guard.js";
import {
  type GenerationJobResult,
  runGenerationJob,
} from "../run-generation-job.js";

// Batch narration (file 36, FR-AI-04, FR-I18N-05, FR-CMS-05).

/** The three tables that hold a narration foreign key. */
const NARRATION_TABLES = [
  "LessonTranslation",
  "StoryPageTranslation",
  "QuizQuestionTranslation",
] as const;
export type NarrationTable = (typeof NARRATION_TABLES)[number];

/** One clip to record. */
interface NarrationTarget {
  table: NarrationTable;
  targetId: string;
  locale: Locale;
  text: string;
}

export interface GenerateNarrationInput {
  entity: NarrationEntity;
  id: string;
}

/** The upload result, which is all an audio "generation" has to validate. */
const NarrationUploadSchema = z.object({ url: z.string().url() }).strict();
type NarrationUpload = z.infer<typeof NarrationUploadSchema>;

/**
 * Job statuses that mean "a clip for this pair already exists or is coming".
 */
const LIVE_JOB_STATUSES = [
  "pending",
  "generating",
  "awaiting_review",
  "approved",
] as const;

export async function generateNarrationBatch(
  input: GenerateNarrationInput,
): Promise<BatchGenerationRef> {
  const candidates = await readNarrationCandidates(input);
  const inFlight = await readInFlightPairs(input.id);

  // `flatMap` rather than `filter`, so the result is `NarrationTarget[]` — a
  // filter on `target !== undefined` narrows nothing the compiler can carry out,
  // and the alternative is a cast asserting what the predicate already checked.
  const missing = candidates.flatMap((candidate) =>
    candidate.target !== undefined &&
    !candidate.hasAudio &&
    !inFlight.has(pairKey(candidate.target))
      ? [candidate.target]
      : [],
  );

  // Before the first provider call, and for the whole batch at once: a cap
  // checked one clip at a time would let a sixteen-clip request spend the last
  // eleven and stop with a story narrated on five pages and silent on three.
  await assertWithinDailyCap("audio", missing.length);

  const jobIds: string[] = [];
  let failed = 0;
  for (const target of missing) {
    // `runNarrationJob` records a provider failure on the job row and resolves;
    // it does not throw. Counting the failures is the only way the batch can
    // report them, since one response covers *n* jobs.
    const { jobId, status } = await runNarrationJob(input, target);
    jobIds.push(jobId);
    if (status === "failed") failed += 1;
  }

  return { jobIds, skipped: candidates.length - missing.length, failed };
}

function pairKey(
  target: Pick<NarrationTarget, "table" | "targetId" | "locale">,
): string {
  return `${target.table}:${target.targetId}:${target.locale}`;
}

function runNarrationJob(
  input: GenerateNarrationInput,
  target: NarrationTarget,
): Promise<GenerationJobResult> {
  return runGenerationJob<NarrationUpload>({
    type: "audio",
    // The text that was spoken, not a reference to it. A reviewer months later
    // needs the words the voice actually read, and the row it came from may have
    // been edited since (FR-AI-08). `charCount` because Google TTS meters
    // characters — it is what this job cost.
    input: {
      entity: input.entity,
      entityId: input.id,
      targetTable: target.table,
      targetId: target.targetId,
      locale: target.locale,
      text: target.text,
      charCount: target.text.length,
    },
    schema: NarrationUploadSchema,
    generate: async () => {
      const audio = await generateNarration(target.text, target.locale);
      const url = await uploadBuffer(audio, {
        folder: uploadFolderFor("audio"),
        resourceType: resourceTypeFor("audio"),
      });

      // Zeroed rather than omitted. `runGenerationJob` totals token usage across
      // attempts for the text generators; Google TTS meters characters, and that
      // figure is in `input.charCount` above. Reporting the character count as
      // "tokens" would corrupt the one number the audit trail sums.
      return { raw: { url }, usage: { inputTokens: 0, outputTokens: 0 } };
    },
    persist: async (parsed, jobId, tx) => {
      const asset = await registerAsset(
        {
          url: parsed.url,
          kind: "audio",
          // The clip's own language, which is what FR-I18N-05 asks for: an asset
          // with a null language here is a clip nobody can tell the language of
          // and a Bangla reader could be served.
          language: target.locale,
          aiJobId: jobId,
        },
        tx,
      );

      return {
        assetId: asset.id,
        url: asset.url,
        targetTable: target.table,
        targetId: target.targetId,
        locale: target.locale,
        charCount: target.text.length,
      };
    },
  });
}

/**
 * Every pair that could carry narration, flagged with whether it already does.
 */
type NarrationCandidate = {
  hasAudio: boolean;
  /** Absent when there is no text to read — nothing to generate from. */
  target?: NarrationTarget;
};

async function readNarrationCandidates(
  input: GenerateNarrationInput,
): Promise<NarrationCandidate[]> {
  switch (input.entity) {
    case "lesson":
      return readLessonCandidates(input.id);
    case "story":
      return readStoryCandidates(input.id);
    case "quiz":
      return readQuizCandidates(input.id);
  }
}

async function readLessonCandidates(
  lessonId: string,
): Promise<NarrationCandidate[]> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      translations: {
        select: {
          language: true,
          introScript: true,
          introAudioAssetId: true,
        },
      },
    },
  });
  if (!lesson) throw ApiError.notFound("No such lesson");

  return lesson.translations.map((translation) => ({
    hasAudio: translation.introAudioAssetId !== null,
    ...(translation.introScript.trim() === ""
      ? {}
      : {
          target: {
            table: "LessonTranslation" as const,
            targetId: lessonId,
            locale: translation.language,
            text: translation.introScript.trim(),
          },
        }),
  }));
}

async function readStoryCandidates(
  storyId: string,
): Promise<NarrationCandidate[]> {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: {
      pages: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          translations: {
            select: {
              language: true,
              text: true,
              narrationAudioAssetId: true,
            },
          },
        },
      },
    },
  });
  if (!story) throw ApiError.notFound("No such story");

  return story.pages.flatMap((page) =>
    page.translations.map((translation) => ({
      hasAudio: translation.narrationAudioAssetId !== null,
      ...(translation.text.trim() === ""
        ? {}
        : {
            target: {
              table: "StoryPageTranslation" as const,
              targetId: page.id,
              locale: translation.language,
              text: translation.text.trim(),
            },
          }),
    })),
  );
}

/** A quiz's pairs come from the payload, not from a text column. */
async function readQuizCandidates(
  quizId: string,
): Promise<NarrationCandidate[]> {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: {
      questions: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          definition: true,
          translations: { select: { language: true, audioAssetId: true } },
        },
      },
    },
  });
  if (!quiz) throw ApiError.notFound("No such quiz");

  return quiz.questions.flatMap((question) => {
    const prompts = readPrompts(question.definition);

    return LOCALES.flatMap((locale) => {
      const text = prompts[locale];
      if (text === undefined) return [];

      const translation = question.translations.find(
        (one) => one.language === locale,
      );

      return [
        {
          hasAudio: translation?.audioAssetId != null,
          target: {
            table: "QuizQuestionTranslation" as const,
            targetId: question.id,
            locale,
            text,
          },
        },
      ];
    });
  });
}

/** `definition.prompt` as a locale map, or an empty one. */
function readPrompts(
  definition: Prisma.JsonValue,
): Partial<Record<Locale, string>> {
  if (typeof definition !== "object" || definition === null) return {};
  // The JSONB column boundary: Prisma types it as `JsonValue`, and narrowing it
  // to "an object that may have a `prompt` object" is what the two guards above
  // and the per-key check below actually verify.
  const prompt = (definition as Record<string, unknown>).prompt;
  if (typeof prompt !== "object" || prompt === null) return {};

  const prompts: Partial<Record<Locale, string>> = {};
  for (const locale of LOCALES) {
    const text = (prompt as Record<string, unknown>)[locale];
    if (typeof text === "string" && text.trim() !== "") {
      prompts[locale] = text.trim();
    }
  }
  return prompts;
}

/** The pairs a live audio job already covers. */
async function readInFlightPairs(entityId: string): Promise<Set<string>> {
  const jobs = await prisma.aIGenerationJob.findMany({
    where: {
      type: "audio",
      status: { in: [...LIVE_JOB_STATUSES] },
      input: { path: ["entityId"], equals: entityId },
    },
    select: { input: true },
  });

  const pairs = new Set<string>();
  for (const job of jobs) {
    if (typeof job.input !== "object" || job.input === null) continue;
    // Same JSONB boundary as `readPrompts`: the shape was written by
    // `runNarrationJob` above, and every field is re-checked before use.
    const record = job.input as Record<string, unknown>;
    const table = record.targetTable;
    const targetId = record.targetId;
    const locale = record.locale;
    if (
      typeof table === "string" &&
      typeof targetId === "string" &&
      typeof locale === "string"
    ) {
      pairs.add(`${table}:${targetId}:${locale}`);
    }
  }
  return pairs;
}
