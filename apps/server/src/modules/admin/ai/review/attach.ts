// Value import, not `import type`: `Prisma.PrismaClientKnownRequestError` is a
// runtime class the `P2025` check in `attachOrConflict` does an `instanceof` on.
import { Prisma } from "@kidlearn/db";
import type { AiJobAsset, Locale } from "@kidlearn/types";
import { LOCALES } from "@kidlearn/types";
import { ApiError } from "../../../../shared/errors/errors.js";
import {
  asRecord,
  JOB_SELECT,
  type JobRow,
  type ReviewWriter,
  readString,
} from "./job.js";

/**
 * The attach target is read from the job's `input`, not the asset row: a
 * `MediaAsset` holds a URL and a language, and which translation or story page it
 * belongs to is exactly the fact generation deliberately did not write (file 36).
 * `isAttached` checks the live foreign key, so a job re-opened after approval shows
 * the attachment rather than offering it again.
 */
export async function readJobAssets(
  row: JobRow,
  tx: ReviewWriter,
): Promise<AiJobAsset[]> {
  const assets = await tx.mediaAsset.findMany({
    where: { aiJobId: row.id },
    select: { id: true, url: true, kind: true, language: true },
    orderBy: { createdAt: "asc" },
  });
  if (assets.length === 0) return [];

  const target = readAttachTarget(row);

  return Promise.all(
    assets.map(async (asset) => ({
      id: asset.id,
      url: asset.url,
      kind: asset.kind,
      language: asset.language,
      targetTable: target?.table ?? null,
      targetId: target?.id ?? null,
      sourceText:
        readString(asRecord(row.input), "text") ??
        readString(asRecord(row.input), "resolvedPrompt") ??
        null,
      isAttached: target === undefined ? false : await isAttached(target, tx),
    })),
  );
}

/** The four foreign keys a media approval can write (file 36). */
const ATTACH_TABLES = [
  "LessonTranslation",
  "StoryPageTranslation",
  "QuizQuestionTranslation",
  "StoryPage",
] as const;

type AttachTable = (typeof ATTACH_TABLES)[number];

type AttachTarget = { table: AttachTable; id: string; locale?: Locale };

/**
 * Read from `input` rather than `rawOutput.entities`: both carry it, but `input`
 * is written *before* the provider is called, so a job that failed mid-generation
 * still says what it was for. Every field is re-checked — the JSONB boundary.
 */
function readAttachTarget(row: JobRow): AttachTarget | undefined {
  const input = asRecord(row.input);
  const table = input.targetTable;
  const id = input.targetId;
  if (typeof table !== "string" || typeof id !== "string") return undefined;

  const known = ATTACH_TABLES.find((one) => one === table);
  if (known === undefined) return undefined;

  const locale = LOCALES.find((one) => one === input.locale);
  return { table: known, id, ...(locale === undefined ? {} : { locale }) };
}

async function isAttached(
  target: AttachTarget,
  tx: ReviewWriter,
): Promise<boolean> {
  switch (target.table) {
    case "LessonTranslation": {
      if (target.locale === undefined) return false;
      const row = await tx.lessonTranslation.findUnique({
        where: {
          lessonId_language: { lessonId: target.id, language: target.locale },
        },
        select: { introAudioAssetId: true },
      });
      return row?.introAudioAssetId != null;
    }
    case "StoryPageTranslation": {
      if (target.locale === undefined) return false;
      const row = await tx.storyPageTranslation.findUnique({
        where: {
          storyPageId_language: {
            storyPageId: target.id,
            language: target.locale,
          },
        },
        select: { narrationAudioAssetId: true },
      });
      return row?.narrationAudioAssetId != null;
    }
    case "QuizQuestionTranslation": {
      if (target.locale === undefined) return false;
      const row = await tx.quizQuestionTranslation.findUnique({
        where: {
          questionId_language: {
            questionId: target.id,
            language: target.locale,
          },
        },
        select: { audioAssetId: true },
      });
      return row?.audioAssetId != null;
    }
    case "StoryPage": {
      const row = await tx.storyPage.findUnique({
        where: { id: target.id },
        select: { illustrationAssetId: true },
      });
      return row?.illustrationAssetId != null;
    }
  }
}

/**
 * Writes the foreign key an audio or image job recorded but deliberately did not
 * set (FR-CMS-05) — this is what "publish" means for a media job, since a
 * `MediaAsset` is reachable only through the row that points at it.
 */
export async function attachAssets(
  tx: ReviewWriter,
  jobId: string,
): Promise<string[]> {
  const job = await tx.aIGenerationJob.findUnique({
    where: { id: jobId },
    select: JOB_SELECT,
  });
  if (!job) return [];

  const target = readAttachTarget(job);
  if (target === undefined) return [];

  const assets = await tx.mediaAsset.findMany({
    where: { aiJobId: jobId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (assets.length === 0) return [];

  // One asset per media job by construction (file 36), so the newest wins if that
  // ever changes.
  const assetId = assets[assets.length - 1].id;

  switch (target.table) {
    case "LessonTranslation": {
      const { locale } = target;
      if (locale === undefined) return [];
      await attachOrConflict(target, () =>
        tx.lessonTranslation.update({
          where: {
            lessonId_language: { lessonId: target.id, language: locale },
          },
          data: { introAudioAssetId: assetId },
        }),
      );
      break;
    }
    case "StoryPageTranslation": {
      const { locale } = target;
      if (locale === undefined) return [];
      await attachOrConflict(target, () =>
        tx.storyPageTranslation.update({
          where: {
            storyPageId_language: { storyPageId: target.id, language: locale },
          },
          data: { narrationAudioAssetId: assetId },
        }),
      );
      break;
    }
    case "QuizQuestionTranslation":
      if (target.locale === undefined) return [];
      await tx.quizQuestionTranslation.upsert({
        where: {
          questionId_language: {
            questionId: target.id,
            language: target.locale,
          },
        },
        create: {
          questionId: target.id,
          language: target.locale,
          audioAssetId: assetId,
        },
        update: { audioAssetId: assetId },
      });
      break;
    case "StoryPage":
      await attachOrConflict(target, () =>
        tx.storyPage.update({
          where: { id: target.id },
          data: { illustrationAssetId: assetId },
        }),
      );
      break;
  }

  return [assetId];
}

/**
 * Prisma raises `P2025` from the `update`, which would otherwise reach the error
 * handler as an unrecognised client error. The request is well formed; what is
 * wrong is a state an admin can fix by regenerating.
 */
async function attachOrConflict<T>(
  target: AttachTarget,
  write: () => Promise<T>,
): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw ApiError.conflict(
        "The row this clip was generated for no longer exists, so there is nothing to attach it to",
        { code: "ATTACH_TARGET_MISSING", table: target.table, id: target.id },
      );
    }
    throw error;
  }
}
