import type { Prisma } from "@kidlearn/db";
import {
  type BatchGenerationRef,
  LOCALES,
  type Locale,
  type NarrationEntity,
} from "@kidlearn/types";
import { z } from "zod";
import { prisma } from "../../../../config/prisma.js";
import { ApiError } from "../../../../shared/errors/errors.js";
import {
  registerAsset,
  resourceTypeFor,
  uploadBuffer,
  uploadFolderFor,
} from "../../media/media.service.js";
import { generateNarration } from "../google-tts.js";
import { assertWithinDailyCap } from "../rate-guard.js";
import {
  type GenerationJobResult,
  runGenerationJob,
} from "../run-generation-job.js";
import { failStaleJobs } from "../stale-jobs.js";

const NARRATION_TABLES = [
  "LessonTranslation",
  "StoryPageTranslation",
  "QuizQuestionTranslation",
] as const;
export type NarrationTable = (typeof NARRATION_TABLES)[number];

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

const NarrationUploadSchema = z.object({ url: z.string().url() }).strict();
type NarrationUpload = z.infer<typeof NarrationUploadSchema>;

// Statuses meaning a clip for this pair exists or is coming.
const LIVE_JOB_STATUSES = [
  "pending",
  "generating",
  "awaiting_review",
  "approved",
] as const;

export async function generateNarrationBatch(
  input: GenerateNarrationInput,
): Promise<BatchGenerationRef> {
  // Before the in-flight read, so a crash-stranded job does not make a pair look "already coming" for good.
  await failStaleJobs();

  const candidates = await readNarrationCandidates(input);
  const inFlight = await readInFlightPairs(input.id);

  // flatMap, not filter: a filter on `!== undefined` narrows nothing, and the alternative is a cast.
  const missing = candidates.flatMap((candidate) =>
    candidate.target !== undefined &&
    !candidate.hasAudio &&
    !inFlight.has(pairKey(candidate.target))
      ? [candidate.target]
      : [],
  );

  // Checked for the whole batch before any provider call: per-clip checks could narrate part of a story and stop.
  await assertWithinDailyCap("audio", missing.length);

  const jobIds: string[] = [];
  let failed = 0;
  for (const target of missing) {
    // runNarrationJob records provider failures on the job and resolves; counting is the only way the batch reports them.
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
    // The spoken text, not a reference: the source row may be edited later. charCount is what Google TTS bills.
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

      // Zeroed: TTS meters characters (input.charCount), and the audit trail sums tokens across attempts.
      return { raw: { url }, usage: { inputTokens: 0, outputTokens: 0 } };
    },
    persist: async (parsed, jobId, tx) => {
      const asset = await registerAsset(
        {
          url: parsed.url,
          kind: "audio",
          // The clip's own language (FR-I18N-05): a null language could be served to a reader of the wrong language.
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

function readPrompts(
  definition: Prisma.JsonValue,
): Partial<Record<Locale, string>> {
  if (typeof definition !== "object" || definition === null) return {};
  // JSONB boundary: Prisma types it as JsonValue; the guards below verify the shape.
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
    // Same JSONB boundary as readPrompts: shape written by runNarrationJob, re-checked.
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
