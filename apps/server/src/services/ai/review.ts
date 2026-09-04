import type { AIReviewDecision, ContentStatus } from "@kidlearn/db";
// Value import, not `import type`: `Prisma.PrismaClientKnownRequestError` is a
// runtime class the `P2025` check in `attachOrConflict` does an `instanceof` on.
import { Prisma } from "@kidlearn/db";
import type {
  AiEntityResource,
  AiJobAsset,
  AiJobCount,
  AiJobDetail,
  AiJobEntity,
  AiJobList,
  AiJobSummary,
  AiReviewResult,
  GradeLevelValue,
  Locale,
} from "@kidlearn/types";
import { GRADE_LEVELS, LOCALES } from "@kidlearn/types";
import { ApiError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { withSerializationRetry } from "../../lib/serializable-retry.js";
import type { AiJobListQuery } from "../../schemas/admin-ai.js";
import {
  assertAiPublishable,
  readQuizAiJobIds,
  routeToStatus,
} from "../contentStatusService.js";
import { PLACEHOLDER_ASSET_HOST } from "./placeholder-assets.js";

/**
 * The human gate FR-AI-07 makes a hard requirement (file 37, FR-CMS-05..06).
 *
 * Files 34–36 can only produce drafts: every row they write takes the `draft`
 * default and carries `aiJobId`, and the job stops on `awaiting_review`. This
 * file is the only thing that can move any of it further, and it can move it in
 * exactly two directions.
 *
 * **Approve publishes, in one action, because FR-CMS-06 says approved content is
 * published immediately.** There is no separate publish step to forget: the job
 * is decided and every row it created is walked `draft → in_review → approved →
 * published` inside one transaction. The hops are *routed*, not written — the
 * route is read out of the matrix in `contentStatusService.ts` by
 * `routeToStatus`, so the matrix stays the single authority on what a legal move
 * is and this file is only a trusted driver of legal ones. A shortcut that wrote
 * `published` directly would be a second definition of the workflow, and the one
 * that drifts is the one that publishes something the matrix would have refused.
 *
 * **Reject is more than one hop for the same reason.** The matrix has no
 * `draft → rejected` edge — `rejected` is reachable only from `in_review`,
 * because rejecting something nobody reviewed is not a thing the workflow models
 * — so a rejection walks `draft → in_review → rejected`, and a row somebody has
 * since approved or published walks the longer way round through `draft`. Every
 * hop is a real transition with a real audit stamp.
 *
 * **Nothing here can publish without the decision being written first.** The job
 * update is the first statement in the transaction, and every publish hop calls
 * `assertAiPublishable` against the same snapshot. That is what makes the
 * invariant total rather than a convention: `approveJob` and the generic
 * `/transition` handler are the only two writers of `status: "published"` in the
 * product, and both run the same check.
 *
 * **Rejected work is kept, not deleted (FR-AI-08).** The rows stay at `rejected`,
 * the job keeps its `rawOutput`, and `reviewNote` records why. None of it is
 * student-visible — every student query filters `status = published` — and
 * getting any of it live later needs the matrix's re-review path *and* a fresh
 * approving decision, which a rejected job does not have.
 */

// --- Reading the queue ----------------------------------------------------

/**
 * The four content tables a job can create rows in, spelled as CMS path
 * segments so the review screen's "open in editor" links come from the payload.
 *
 * `AI_ENTITY_RESOURCES` rather than a copy: this union *is* the path segment on
 * the wire, so the client, the schema and this file are all talking about the
 * same strings — the reason `admin-content.ts` gives for owning its two.
 *
 * `QuizQuestion` is deliberately absent: a question has no status of its own and
 * is published by its parent quiz, which is the row that appears here instead.
 */
type EntityResource = AiEntityResource;

/** `Quiz.title` is nullable; the queue still has to call the row something. */
const UNTITLED_QUIZ = "Untitled quiz";

type LinkedRow = {
  resource: EntityResource;
  id: string;
  label: string;
  status: ContentStatus;
  /**
   * Every job answerable for the row's contents, not just the one that created
   * it — a quiz answers for its questions' jobs too (`readQuizAiJobIds`).
   */
  aiJobIds: string[];
};

/** The slice of the client a transaction callback and the plain client share. */
type ReviewWriter = Pick<
  typeof prisma,
  | "aIGenerationJob"
  | "lesson"
  | "quiz"
  | "quizQuestion"
  | "activity"
  | "story"
  | "lessonTranslation"
  | "storyPageTranslation"
  | "quizQuestionTranslation"
  | "storyPage"
  | "mediaAsset"
>;

/**
 * Every content row one job is answerable for.
 *
 * Four direct reads plus a fifth that is the interesting one: a quiz job run
 * against a lesson that already had a quiz stamps `aiJobId` on the *questions*
 * only, because the quiz row predates the job. The questions have no status, so
 * approving them means publishing the quiz they belong to — which is found here,
 * through the questions, and deduplicated against a quiz the job created itself.
 *
 * Ordered lessons-first so a `409` naming an offending row names the one an admin
 * recognises.
 */
async function linkedContentRows(
  jobId: string,
  tx: ReviewWriter,
): Promise<LinkedRow[]> {
  const [lessons, quizzes, activities, stories, questions] = await Promise.all([
    tx.lesson.findMany({
      where: { aiJobId: jobId },
      select: { id: true, title: true, status: true, aiJobId: true },
      orderBy: { createdAt: "asc" },
    }),
    tx.quiz.findMany({
      where: { aiJobId: jobId },
      select: { id: true, title: true, status: true, aiJobId: true },
      orderBy: { createdAt: "asc" },
    }),
    tx.activity.findMany({
      where: { aiJobId: jobId },
      select: { id: true, type: true, status: true, aiJobId: true },
      orderBy: { createdAt: "asc" },
    }),
    tx.story.findMany({
      where: { aiJobId: jobId },
      select: { id: true, title: true, status: true, aiJobId: true },
      orderBy: { createdAt: "asc" },
    }),
    tx.quizQuestion.findMany({
      where: { aiJobId: jobId },
      select: {
        quiz: {
          select: { id: true, title: true, status: true, aiJobId: true },
        },
      },
    }),
  ]);

  const rows: LinkedRow[] = [
    ...lessons.map((row) => ({
      resource: "lessons" as const,
      id: row.id,
      label: row.title,
      status: row.status,
      aiJobIds: idList(row.aiJobId),
    })),
    ...quizzes.map((row) => ({
      resource: "quizzes" as const,
      id: row.id,
      label: row.title ?? UNTITLED_QUIZ,
      status: row.status,
      aiJobIds: idList(row.aiJobId),
    })),
    ...activities.map((row) => ({
      resource: "activities" as const,
      id: row.id,
      label: row.type,
      status: row.status,
      aiJobIds: idList(row.aiJobId),
    })),
    ...stories.map((row) => ({
      resource: "stories" as const,
      id: row.id,
      label: row.title,
      status: row.status,
      aiJobIds: idList(row.aiJobId),
    })),
  ];

  const seen = new Set(rows.map((row) => `${row.resource}:${row.id}`));
  for (const { quiz } of questions) {
    if (seen.has(`quizzes:${quiz.id}`)) continue;
    seen.add(`quizzes:${quiz.id}`);
    rows.push({
      resource: "quizzes",
      id: quiz.id,
      label: quiz.title ?? UNTITLED_QUIZ,
      status: quiz.status,
      aiJobIds: idList(quiz.aiJobId),
    });
  }

  // A quiz publishes its questions, so the publish guard has to see their jobs —
  // including questions from a *different* job than the one being reviewed, which
  // is the case a per-job read cannot find (FR-AI-07).
  for (const row of rows) {
    if (row.resource !== "quizzes") continue;
    row.aiJobIds = [
      ...new Set([...row.aiJobIds, ...(await readQuizAiJobIds(row.id, tx))]),
    ];
  }

  return rows;
}

function idList(id: string | null): string[] {
  return id === null ? [] : [id];
}

function toEntity(row: LinkedRow): AiJobEntity {
  return {
    resource: row.resource,
    id: row.id,
    label: row.label,
    status: row.status,
  };
}

/**
 * The job's `input`/`rawOutput` as a plain record, or an empty one.
 *
 * Both are JSONB columns Prisma types as `JsonValue`, and every field read out of
 * them below is re-checked before use — the same defensive treatment
 * `generators/narration.ts` gives the shape it wrote itself. A job whose audit
 * record predates a prompt change must still render in the queue rather than
 * throwing the list.
 */
function asRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  // The JSONB column boundary. Narrowed to "an object with unknown values",
  // which is exactly what the three guards above verify.
  return value as Record<string, unknown>;
}

/**
 * The grades a job was asked for, read out of its `input`.
 *
 * The lesson generator records one `gradeLevel`, the story generator a
 * `gradeLevels` array, and the media generators neither. All three are folded
 * into one array here so the queue has a single column to render and a single
 * filter to apply.
 */
function readGradeLevels(input: Record<string, unknown>): GradeLevelValue[] {
  const values = Array.isArray(input.gradeLevels)
    ? input.gradeLevels
    : [input.gradeLevel];

  return GRADE_LEVELS.filter((grade) => values.includes(grade));
}

/**
 * The locales a job was asked for.
 *
 * `languages` for the text generators; `locale` for a narration clip, which has
 * exactly one. An illustration job has neither, and that is correct — a picture
 * has no language (FR-I18N-05 is about narration).
 */
function readLanguages(input: Record<string, unknown>): Locale[] {
  const values = Array.isArray(input.languages)
    ? input.languages
    : [input.locale];

  return LOCALES.filter((locale) => values.includes(locale));
}

function readString(
  source: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = source[key];
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

const JOB_SELECT = {
  id: true,
  type: true,
  status: true,
  decision: true,
  input: true,
  rawOutput: true,
  reviewerId: true,
  reviewNote: true,
  createdAt: true,
  updatedAt: true,
  reviewedAt: true,
} satisfies Prisma.AIGenerationJobSelect;

type JobRow = Prisma.AIGenerationJobGetPayload<{ select: typeof JOB_SELECT }>;

/**
 * `AiJobSummary` and `AiJobDetail` type their timestamps as ISO strings, which is
 * the wire format; the rows carry `Date`. `res.json()` does the conversion, so
 * the DTOs here are declared with `Date` in those positions — matching every
 * other admin service — and this is the one place the two descriptions meet.
 */
export type AiJobSummaryDto = Omit<AiJobSummary, "createdAt" | "reviewedAt"> & {
  createdAt: Date;
  reviewedAt: Date | null;
};

export type AiJobDetailDto = Omit<
  AiJobDetail,
  "createdAt" | "reviewedAt" | "updatedAt"
> & { createdAt: Date; reviewedAt: Date | null; updatedAt: Date };

export type AiJobListDto = Omit<AiJobList, "jobs"> & {
  jobs: AiJobSummaryDto[];
};

export type AiReviewResultDto = Omit<AiReviewResult, "job"> & {
  job: AiJobDetailDto;
};

function toSummary(row: JobRow, entityLabel: string | null): AiJobSummaryDto {
  const input = asRecord(row.input);

  return {
    id: row.id,
    type: row.type,
    status: row.status,
    decision: row.decision,
    gradeLevels: readGradeLevels(input),
    languages: readLanguages(input),
    entityLabel,
    createdAt: row.createdAt,
    reviewedAt: row.reviewedAt,
  };
}

/**
 * A page of the queue (requirement 1, FR-CMS-05).
 *
 * **The grade and language filters run against the job's `input` JSON**, because
 * that is where the generator recorded what it was asked for. Prisma's JSON
 * filters are the mechanism, and the two fields need different ones: a lesson
 * job's `gradeLevel` is a scalar and a story job's `gradeLevels` is an array, so
 * "KG1" has to match either an equal string or an array that contains it. `OR` of
 * the two rather than one clever path, because a single filter that covered both
 * would have to reach into an array by index and would silently miss a story
 * whose second grade was the one asked for.
 *
 * Oldest first: this is a work queue, and the job that has waited longest is the
 * one to do next.
 */
export async function listJobs(query: AiJobListQuery): Promise<AiJobListDto> {
  const where: Prisma.AIGenerationJobWhereInput = {
    status: query.status,
    ...(query.type === undefined ? {} : { type: query.type }),
    ...(query.gradeLevel === undefined
      ? {}
      : {
          OR: [
            { input: { path: ["gradeLevel"], equals: query.gradeLevel } },
            {
              input: {
                path: ["gradeLevels"],
                array_contains: [query.gradeLevel],
              },
            },
          ],
        }),
    ...(query.language === undefined
      ? {}
      : {
          AND: [
            {
              OR: [
                { input: { path: ["locale"], equals: query.language } },
                {
                  input: {
                    path: ["languages"],
                    array_contains: [query.language],
                  },
                },
              ],
            },
          ],
        }),
  };

  const [rows, total] = await Promise.all([
    prisma.aIGenerationJob.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: query.take,
      skip: query.skip,
      select: JOB_SELECT,
    }),
    prisma.aIGenerationJob.count({ where }),
  ]);

  // Five reads for the whole page, not five per job: `linkedContentRows` fans out
  // across five tables, and calling it per row turned a 25-row page into 125
  // queries. The label comes from a different table per job type, so the tables
  // are read once each with an `in` and the rows grouped back by job here.
  const labels = await readEntityLabels(rows, prisma);

  return {
    jobs: rows.map((row) => toSummary(row, labels.get(row.id) ?? null)),
    total,
  };
}

/**
 * What to call each job in a list, in five queries for the page.
 *
 * The first content row a job created, in the same lessons-first order
 * `linkedContentRows` uses, so a job's label does not depend on whether it was
 * read one at a time or in a page. Falls back to the words a clip narrates or the
 * brief a picture was drawn from, which is all a media job has — and to nothing
 * at all, which is what a `failed` job looks like.
 */
async function readEntityLabels(
  rows: JobRow[],
  tx: ReviewWriter,
): Promise<Map<string, string>> {
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return new Map();

  const where = { aiJobId: { in: ids } };
  const order = { createdAt: "asc" } as const;
  const [lessons, quizzes, activities, stories, questions] = await Promise.all([
    tx.lesson.findMany({
      where,
      select: { aiJobId: true, title: true },
      orderBy: order,
    }),
    tx.quiz.findMany({
      where,
      select: { aiJobId: true, title: true },
      orderBy: order,
    }),
    tx.activity.findMany({
      where,
      select: { aiJobId: true, type: true },
      orderBy: order,
    }),
    tx.story.findMany({
      where,
      select: { aiJobId: true, title: true },
      orderBy: order,
    }),
    tx.quizQuestion.findMany({
      where,
      select: { aiJobId: true, quiz: { select: { title: true } } },
    }),
  ]);

  const labels = new Map<string, string>();
  const claim = (jobId: string | null, label: string): void => {
    if (jobId === null || labels.has(jobId)) return;
    labels.set(jobId, label);
  };

  for (const row of lessons) claim(row.aiJobId, row.title);
  for (const row of quizzes) claim(row.aiJobId, row.title ?? UNTITLED_QUIZ);
  for (const row of activities) claim(row.aiJobId, row.type);
  for (const row of stories) claim(row.aiJobId, row.title);
  for (const row of questions) {
    claim(row.aiJobId, row.quiz.title ?? UNTITLED_QUIZ);
  }

  for (const row of rows) {
    const input = asRecord(row.input);
    const fallback =
      readString(input, "text") ?? readString(input, "illustrationPrompt");
    if (fallback !== undefined) claim(row.id, fallback);
  }

  return labels;
}

/** What to call a job whose content rows are already in hand. */
function entityLabel(row: JobRow, linked: LinkedRow[]): string | null {
  if (linked.length > 0) return linked[0].label;

  const input = asRecord(row.input);
  return (
    readString(input, "text") ?? readString(input, "illustrationPrompt") ?? null
  );
}

export async function getJob(id: string): Promise<AiJobDetailDto> {
  const row = await prisma.aIGenerationJob.findUnique({
    where: { id },
    select: JOB_SELECT,
  });
  if (!row) throw ApiError.notFound("No such generation job");

  return buildDetail(row, prisma);
}

async function buildDetail(
  row: JobRow,
  tx: ReviewWriter,
): Promise<AiJobDetailDto> {
  const linked = await linkedContentRows(row.id, tx);
  const assets = await readJobAssets(row, tx);

  return {
    ...toSummary(row, entityLabel(row, linked)),
    input: row.input,
    rawOutput: row.rawOutput,
    reviewerId: row.reviewerId,
    reviewNote: row.reviewNote,
    updatedAt: row.updatedAt,
    entities: linked.map(toEntity),
    assets,
    blockers: await readBlockers(row, linked, tx),
  };
}

/**
 * The unattached media a job produced, and where approving it will attach them.
 *
 * The target is read from the job's `input` rather than from the asset row,
 * because the asset row does not know: `MediaAsset` holds a URL and a language,
 * and which lesson translation or story page it belongs to is exactly the fact
 * that generation deliberately did not write (file 36). `isAttached` is checked
 * against the live foreign key, so a job re-opened after approval shows the
 * attachment rather than offering it again.
 */
async function readJobAssets(
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
 * Which foreign key this job's asset belongs on.
 *
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

// --- Approve --------------------------------------------------------------

/**
 * Why this job cannot be approved right now (requirement 4).
 *
 * Computed rather than discovered at approval time so the review screen can
 * disable the button and say why — and computed by the *same* function the
 * approval runs, so the button and the `409` cannot disagree.
 *
 * Two blockers, and both are content-safety rather than tidiness:
 *
 *  - **A `pending://`-era placeholder asset.** The generators rewrite every asset
 *    URL a text model invents onto a reserved `.invalid` host, so a question
 *    still carrying one has an image or a clip that does not exist. Publishing it
 *    puts a broken picture in front of a child mid-quiz.
 *  - **A row that is no longer `draft`.** Somebody has moved it since the job
 *    was created — withdrawn it, archived it, published it by hand. Chaining
 *    `draft → in_review → approved → published` over the top of that would either
 *    fail halfway through the matrix or drive a row somewhere nobody asked for.
 *
 * **A decided job has no blockers, it has a decision.** `readDecidableJob` is
 * what refuses a second decision, and it does so before this runs. Reporting
 * "this job is approved, not awaiting review" as a *blocker* would be the same
 * fact wearing the wrong hat: `finish` rebuilds the detail after the decision
 * lands, so the payload of a successful approval would carry a blocker and the
 * review screen would raise "this cannot be approved yet" directly beneath its
 * own success notice.
 */
async function readBlockers(
  row: JobRow,
  linked: LinkedRow[],
  tx: ReviewWriter,
): Promise<string[]> {
  if (row.status !== "awaiting_review") return [];

  const blockers: string[] = [];

  const moved = linked.filter((one) => one.status !== "draft");
  for (const one of moved) {
    blockers.push(
      `${one.label} is ${one.status}, not draft — it has been changed since this job was generated.`,
    );
  }

  for (const label of await readPlaceholderQuestions(row.id, tx)) {
    blockers.push(
      `${label} still points at a generated placeholder asset that was never replaced.`,
    );
  }

  return blockers;
}

/**
 * The generated questions still holding a placeholder asset URL.
 *
 * Matched on `PLACEHOLDER_ASSET_HOST` rather than on `pending://`, which is what
 * this file's spec described: the scheme was never viable because
 * `AssetRefSchema.url` requires `https://`, so file 35 settled on a reserved
 * `.invalid` host instead. One spelling, imported from the module that defines
 * it, is what makes this check and the rewriting agree.
 *
 * The definition is searched as serialised JSON rather than walked: the URL can
 * sit under `options[].image`, `promptAudio[locale]` or a format-specific key,
 * and a walker that knew the shapes would be a fourth place the payload union is
 * described.
 */
async function readPlaceholderQuestions(
  jobId: string,
  tx: ReviewWriter,
): Promise<string[]> {
  const questions = await tx.quizQuestion.findMany({
    where: { aiJobId: jobId },
    select: { id: true, sortOrder: true, definition: true },
    orderBy: { sortOrder: "asc" },
  });

  return questions
    .filter((one) =>
      JSON.stringify(one.definition).includes(PLACEHOLDER_ASSET_HOST),
    )
    .map((one) => `Question ${one.sortOrder}`);
}

/**
 * Approve and publish, in one transaction (requirement 3, FR-CMS-06).
 *
 * **Order matters and is the point.** The job is decided first, then the rows are
 * walked. The publish hop calls `assertAiPublishable`, which reads the job — so
 * the check passes here because the decision is already written, and fails
 * everywhere else because it is not. Making the invariant hold is not a matter of
 * this function being careful; it is a matter of this function being the only one
 * that writes the decision.
 *
 * **`decision` is `job.decision ?? "approve"`**, so an `edit_then_approve`
 * recorded when the reviewer saved an edit survives publication. Overwriting it
 * would erase the only record that the model's words are not the words that went
 * live.
 *
 * Serializable, and the retry wrapper for the reason `transitionContent` gives:
 * two admins deciding the same job at once must not both read `awaiting_review`.
 */
export async function approveJob(
  jobId: string,
  reviewerId: string,
): Promise<AiReviewResultDto> {
  return withSerializationRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const job = await readDecidableJob(tx, jobId);
        const linked = await linkedContentRows(jobId, tx);

        const blockers = await readBlockers(job, linked, tx);
        if (blockers.length > 0) {
          throw ApiError.conflict(
            "This job cannot be approved yet — see details.blockers",
            { code: "APPROVAL_BLOCKED", jobId, blockers },
          );
        }

        const decision: AIReviewDecision = job.decision ?? "approve";
        await tx.aIGenerationJob.update({
          where: { id: jobId },
          data: {
            status: "approved",
            decision,
            reviewerId,
            reviewedAt: new Date(),
          },
        });

        const published = await walkChain(tx, linked, "published", reviewerId);
        const attachedAssetIds = await attachAssets(tx, jobId);

        return finish(tx, jobId, {
          publishedEntities: published,
          rejectedEntities: [],
          attachedAssetIds,
        });
      },
      { isolationLevel: "Serializable" },
    ),
  );
}

/**
 * Reject, with a mandatory reason (requirement 6, FR-AI-08).
 *
 * The rows end at `rejected` and stay there. Nothing student-facing reads a
 * non-`published` row, so a rejection removes the content from every child's
 * reach the moment it lands — and, unlike a delete, leaves the whole audit trail
 * behind: the prompt, both model attempts, the token cost, and now the sentence
 * saying what was wrong with the result.
 *
 * Unlike `approveJob` this does **not** refuse a row that has moved off `draft`.
 * A rejection is the safe direction: whatever state somebody has left a generated
 * row in, taking it out of circulation is not a change anyone needs protecting
 * from, and refusing would mean an admin could not reject the one job most likely
 * to need it. Hops that the matrix genuinely forbids still throw.
 */
export async function rejectJob(
  jobId: string,
  reviewerId: string,
  reason: string,
): Promise<AiReviewResultDto> {
  return withSerializationRetry(() =>
    prisma.$transaction(
      async (tx) => {
        await readDecidableJob(tx, jobId);
        const linked = await linkedContentRows(jobId, tx);

        await tx.aIGenerationJob.update({
          where: { id: jobId },
          data: {
            status: "rejected",
            decision: "reject",
            reviewNote: reason,
            reviewerId,
            reviewedAt: new Date(),
          },
        });

        const rejected = await walkChain(tx, linked, "rejected", reviewerId);

        return finish(tx, jobId, {
          publishedEntities: [],
          rejectedEntities: rejected,
          attachedAssetIds: [],
        });
      },
      { isolationLevel: "Serializable" },
    ),
  );
}

async function readDecidableJob(
  tx: ReviewWriter,
  jobId: string,
): Promise<JobRow> {
  const job = await tx.aIGenerationJob.findUnique({
    where: { id: jobId },
    select: JOB_SELECT,
  });
  if (!job) throw ApiError.notFound("No such generation job");

  if (job.status !== "awaiting_review") {
    throw ApiError.conflict("This job is not awaiting review", {
      code: "JOB_NOT_AWAITING_REVIEW",
      jobId,
      status: job.status,
    });
  }
  return job;
}

/**
 * Walks every linked row to a destination status, one legal hop at a time.
 *
 * The route comes from `routeToStatus`, which reads it out of the matrix — so
 * this file drives legal hops without holding an opinion about which they are,
 * and a row an admin has moved is routed from where it actually is rather than
 * from where a written-down chain assumed it would be. `assertAiPublishable` runs
 * on the `published` hop for the same reason the generic endpoint runs it — one
 * guard, both callers.
 *
 * A row already at the destination is skipped rather than re-stamped: the
 * diagonal is empty in the matrix precisely so an audit trail cannot claim a
 * review step nobody performed.
 */
async function walkChain(
  tx: ReviewWriter,
  rows: LinkedRow[],
  destination: ContentStatus,
  reviewerId: string,
): Promise<AiJobEntity[]> {
  const moved: AiJobEntity[] = [];

  for (const row of rows) {
    let status = row.status;
    for (const to of routeToStatus(status, destination)) {
      if (to === "published") await assertAiPublishable(row.aiJobIds, tx);
      await writeStatus(tx, row, to, reviewerId);
      status = to;
    }
    moved.push({ ...toEntity(row), status });
  }

  return moved;
}

/**
 * `updatedBy` is stamped only where the column exists.
 *
 * File 32 added it to the curriculum hierarchy; `Quiz`, `Activity` and `Story`
 * predate it and carry no such column, so their audit trail for this decision is
 * the job's own `reviewerId`/`reviewedAt` rather than a stamp on the row.
 */
async function writeStatus(
  tx: ReviewWriter,
  row: LinkedRow,
  status: ContentStatus,
  reviewerId: string,
): Promise<void> {
  switch (row.resource) {
    case "lessons":
      await tx.lesson.update({
        where: { id: row.id },
        data: { status, updatedBy: reviewerId },
      });
      return;
    case "quizzes":
      await tx.quiz.update({ where: { id: row.id }, data: { status } });
      return;
    case "activities":
      await tx.activity.update({ where: { id: row.id }, data: { status } });
      return;
    case "stories":
      await tx.story.update({ where: { id: row.id }, data: { status } });
      return;
  }
}

/**
 * Writes the foreign key an audio or image job recorded but deliberately did not
 * set (requirement 3, FR-CMS-05).
 *
 * **This is what "publish" means for a media job.** A `MediaAsset` has no status
 * and no student-facing query of its own: it is reachable only through the row
 * that points at it, so writing the key is the moment the clip becomes playable —
 * and only through a parent the same review already published.
 *
 * `upsert` on `QuizQuestionTranslation` alone, because that row may not exist: it
 * is created when a question gains audio, and a question that never had any has
 * no translation row to update (file 36). The other two are *updated* rather than
 * upserted because the clip was generated from their text — a created-from-nothing
 * `LessonTranslation` would be a row with narration and no words. If one has been
 * deleted since generation, `attachOrConflict` turns Prisma's `P2025` into a `409`
 * naming what is missing, rather than letting a raw client error surface as a 500.
 */
async function attachAssets(
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

  // One asset per media job by construction — one clip or one picture is what a
  // reviewer approves (file 36) — so the newest wins if that ever changes.
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
 * The row a clip was generated from has been deleted since — a `409`, not a 500.
 *
 * Prisma raises `P2025` from the `update`, which without this reaches the error
 * handler as an unrecognised client error. It is the same class of thing as a row
 * an admin moved: the request is well formed, and what is wrong is a state that
 * an admin can fix by regenerating.
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

async function finish(
  tx: ReviewWriter,
  jobId: string,
  outcome: Omit<AiReviewResultDto, "job">,
): Promise<AiReviewResultDto> {
  const job = await tx.aIGenerationJob.findUniqueOrThrow({
    where: { id: jobId },
    select: JOB_SELECT,
  });

  return { job: await buildDetail(job, tx), ...outcome };
}

// --- Edit-then-approve ----------------------------------------------------

/**
 * Records that a reviewer rewrote a job's content before deciding on it
 * (requirement 5).
 *
 * Called from the file-33 editors and the lesson form when they are opened from
 * the queue — `?jobId=…` on the save request — so the fact and the edit land in
 * the same request rather than as two the client has to sequence.
 *
 * **A no-op rather than an error when the job is not awaiting review.** The
 * `jobId` is a breadcrumb the queue put in a URL, and the save it rides on is
 * real work an admin has just done: losing it because a colleague decided the job
 * a moment earlier would be the wrong trade. Nothing is weakened by the leniency
 * — writing `edit_then_approve` does not publish anything, because
 * `assertAiPublishable` also requires the job to *be* `approved`, which only
 * `approveJob` writes.
 *
 * **`reviewedAt` is deliberately not written here.** It is the timestamp of the
 * *decision*, and an edit is not one — the job is still `awaiting_review` and
 * still unpublishable. Stamping it would make the queue read "Decision: Edited by
 * a reviewer, then approved · 2 minutes ago" on a job nobody has approved, which
 * is the one sentence that would get a second admin to skip it. `approveJob`
 * writes it when the approval actually happens.
 *
 * `updateMany` rather than `update` because that is what makes the status a
 * condition of the write instead of a check before it.
 */
export async function recordEditDecision(
  jobId: string,
  reviewerId: string,
): Promise<void> {
  await prisma.aIGenerationJob.updateMany({
    where: { id: jobId, status: "awaiting_review" },
    data: { decision: "edit_then_approve", reviewerId },
  });
}

/** The sidebar badge's one number (requirement 8). */
export async function countAwaitingReview(): Promise<AiJobCount> {
  return {
    awaitingReview: await prisma.aIGenerationJob.count({
      where: { status: "awaiting_review" },
    }),
  };
}
