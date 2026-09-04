import {
  type ActivityType,
  type ContentStatus,
  Prisma,
  type QuizQuestionFormat,
} from "@kidlearn/db";
import {
  ACTIVITY_SCHEMAS,
  type ActivityDefinition,
  type ActivityType as ActivityPayloadType,
  BADGE_RULE_SCHEMAS,
  type BadgeRule,
  type BadgeRuleType,
  EDITOR_CONTENT_RESOURCES,
  type EditorContentResourceName,
  QUIZ_QUESTION_SCHEMAS,
  type QuizQuestionDefinition,
  type QuizQuestionType,
} from "@kidlearn/types";
import type { z } from "zod";
import { ApiError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { withSerializationRetry } from "../lib/serializable-retry.js";
import type {
  ActivityUpsertBody,
  BadgeCreateBody,
  BadgeUpdateBody,
  QuestionUpsertBody,
  QuizCreateBody,
  QuizUpdateBody,
} from "../schemas/admin-editors.js";
import {
  assertAiPublishable,
  assertEditable,
  assertTransition,
  readQuizAiJobIds,
} from "./contentStatusService.js";

/**
 * The guided editors' data layer (file 33, FR-CMS-03, FR-GAM-04).
 *
 * Three things hold across every write here, and each is the reason the file
 * exists rather than being inlined into the routes:
 *
 * **1. The shared schema is the gate, and it is applied per format.** A payload is
 * parsed with the specific member of `@kidlearn/types`' union that the enum column
 * names, not with the union. That gives an author the field that is actually wrong
 * (`prompt.bn: Required`) instead of Zod's one-line `invalid_union`, and it makes
 * the column/payload agreement check structural: the member carries
 * `type: z.literal("mcq")`, so a `match_pair` payload submitted as `mcq` fails on
 * that literal. This is the same union `routes/content.ts` re-parses before serving
 * a published row — a definition that gets past here cannot make the student API
 * throw its `500 Content unavailable` (`services/contentService.ts`).
 *
 * **2. A published row refuses an edit**, via `assertEditable` applied to the
 * status read inside a Serializable transaction — file 32's reasoning, unchanged:
 * a check made before the transaction can be stale by the time the write lands,
 * which is exactly how a rewrite reaches a live lesson. For a *question*, the
 * status that governs is the quiz's: questions have no status of their own, and a
 * published quiz whose questions could be rewritten would be a published quiz
 * whose content changed without review.
 *
 * **3. Nothing here filters by status for safety.** Same as file 32: these lists
 * exist to show drafts. Student visibility is decided entirely by
 * `routes/content.ts`, which requires the quiz and the activity to be `published`
 * in their own right before serving either.
 */

// --- Compile-time enum mirrors -------------------------------------------

/**
 * The payload unions and the Prisma enums must name the same formats, or a row
 * could carry a `format` no schema can parse.
 *
 * Asserted as bidirectional assignability rather than trusted, matching the
 * `ContentStatus` guard in `openapi/paths/admin-content.ts`: adding a format to
 * `schema.prisma` without adding it to `packages/types` fails `pnpm typecheck`
 * here.
 */
type _FormatsAgree = QuizQuestionFormat extends QuizQuestionType
  ? QuizQuestionType extends QuizQuestionFormat
    ? true
    : never
  : never;
type _ActivityTypesAgree = ActivityType extends ActivityPayloadType
  ? ActivityPayloadType extends ActivityType
    ? true
    : never
  : never;
const _editorEnumMirrorsAreExhaustive: [_FormatsAgree, _ActivityTypesAgree] = [
  true,
  true,
];
void _editorEnumMirrorsAreExhaustive;

/**
 * Parses a payload against the one schema its sibling enum column names, or throws
 * the `400` the route's own validator would have thrown.
 *
 * Issue paths are prefixed with the field the client actually sent —
 * `definition.prompt.bn`, not `prompt.bn` — which is what lets the editor put each
 * message under the input that produced it.
 *
 * Generic over the schema rather than over the payload, so `z.infer` still
 * distributes across the union the caller indexed out of a lookup table: an
 * annotated table would hand back the whole union and the `schemaVersion` read at
 * every call site would lose its type.
 */
function parsePayload<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
  field: "definition" | "rule",
  label: string,
): z.infer<TSchema> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;

  throw new ApiError(
    400,
    "VALIDATION_FAILED",
    `${field} is not a valid ${label} payload`,
    parsed.error.flatten((issue) => ({
      path: [field, ...issue.path].join("."),
      message: issue.message,
    })),
  );
}

/**
 * Prisma types a JSONB column as `JsonValue`, which nothing can narrow
 * statically. Every row read here was written through `parsePayload`, and a row
 * that somehow broke that would fail the route test's `assertContract` — the
 * response schemas carry the real payload unions, not `unknown`.
 */
function asQuestionDefinition(value: Prisma.JsonValue): QuizQuestionDefinition {
  return value as unknown as QuizQuestionDefinition;
}

function asActivityDefinition(value: Prisma.JsonValue): ActivityDefinition {
  return value as unknown as ActivityDefinition;
}

function asBadgeRule(value: Prisma.JsonValue): BadgeRule {
  return value as unknown as BadgeRule;
}

/** Archived rows are hidden from admin lists by default, matching file 32. */
const ARCHIVED: ContentStatus = "archived";
const NOT_ARCHIVED = { status: { not: ARCHIVED } };

function visibility(includeArchived: boolean) {
  return includeArchived ? {} : NOT_ARCHIVED;
}

// --- Quizzes --------------------------------------------------------------

export type AdminQuizDto = {
  id: string;
  title: string | null;
  status: ContentStatus;
  questionCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type AdminQuizQuestionDto = {
  id: string;
  quizId: string;
  format: QuizQuestionFormat;
  schemaVersion: number;
  sortOrder: number;
  definition: QuizQuestionDefinition;
};

export type AdminQuizDetailDto = AdminQuizDto & {
  questions: AdminQuizQuestionDto[];
};

const quizSelect = {
  id: true,
  title: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { questions: true } },
} satisfies Prisma.QuizSelect;

type QuizRow = Prisma.QuizGetPayload<{ select: typeof quizSelect }>;

function toAdminQuiz(row: QuizRow): AdminQuizDto {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    questionCount: row._count.questions,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const questionSelect = {
  id: true,
  quizId: true,
  format: true,
  schemaVersion: true,
  sortOrder: true,
  definition: true,
} satisfies Prisma.QuizQuestionSelect;

type QuestionRow = Prisma.QuizQuestionGetPayload<{
  select: typeof questionSelect;
}>;

function toAdminQuestion(row: QuestionRow): AdminQuizQuestionDto {
  return {
    id: row.id,
    quizId: row.quizId,
    format: row.format,
    schemaVersion: row.schemaVersion,
    sortOrder: row.sortOrder,
    definition: asQuestionDefinition(row.definition),
  };
}

export async function createQuiz(input: QuizCreateBody): Promise<AdminQuizDto> {
  const row = await prisma.quiz.create({
    data: { title: input.title ?? null },
    select: quizSelect,
  });
  return toAdminQuiz(row);
}

export function listQuizzes(options: {
  includeArchived: boolean;
}): Promise<AdminQuizDto[]> {
  return prisma.quiz
    .findMany({
      where: visibility(options.includeArchived),
      orderBy: { createdAt: "desc" },
      select: quizSelect,
    })
    .then((rows) => rows.map(toAdminQuiz));
}

/** One quiz with its questions in the order the player will ask them. */
export async function getQuiz(quizId: string): Promise<AdminQuizDetailDto> {
  const row = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: { ...quizSelect, questions: { select: questionSelect } },
  });
  if (!row) throw ApiError.notFound("No such quiz");

  const questions = [...row.questions]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map(toAdminQuestion);

  return { ...toAdminQuiz(row), questions };
}

/** The quiz alone, without its questions — what a transition answers with. */
export async function getQuizSummary(quizId: string): Promise<AdminQuizDto> {
  const row = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: quizSelect,
  });
  if (!row) throw ApiError.notFound("No such quiz");
  return toAdminQuiz(row);
}

/**
 * Renames a quiz (FR-CMS-03).
 *
 * Read-then-write inside one Serializable transaction, for the reason file 32's
 * `editWithinTransaction` gives: two admins, one publishing and one editing, must
 * not both see `draft` and both succeed. Checking editability in a transaction of
 * its own would commit the read before the update began, which is exactly the
 * staleness Serializable is here to prevent.
 */
export async function updateQuiz(
  quizId: string,
  input: QuizUpdateBody,
): Promise<AdminQuizDto> {
  const row = await withSerializationRetry(() =>
    prisma.$transaction(
      async (tx) => {
        assertEditable(await readEditorStatus(tx, "quizzes", quizId));
        return tx.quiz.update({
          where: { id: quizId },
          data: {
            ...(input.title === undefined ? {} : { title: input.title }),
          },
          select: quizSelect,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
  return toAdminQuiz(row);
}

/**
 * Appends a question (FR-CMS-03).
 *
 * `sortOrder` is the current count, which is also `max + 1` because deletes
 * renumber the survivors contiguously — see `deleteQuestion`. Taken inside the
 * same transaction as the status check so two questions added at once cannot both
 * claim the tail index and violate `@@unique([quizId, sortOrder])`.
 */
export async function createQuestion(
  quizId: string,
  input: QuestionUpsertBody,
): Promise<AdminQuizQuestionDto> {
  const definition = parsePayload(
    QUIZ_QUESTION_SCHEMAS[input.format],
    input.definition,
    "definition",
    `${input.format} question`,
  );

  const row = await withSerializationRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const quiz = await tx.quiz.findUnique({
          where: { id: quizId },
          select: { status: true },
        });
        if (!quiz) throw ApiError.notFound("No such quiz");
        assertEditable(quiz.status);

        const sortOrder = await tx.quizQuestion.count({ where: { quizId } });

        return tx.quizQuestion.create({
          data: {
            quizId,
            format: input.format,
            schemaVersion: definition.schemaVersion,
            definition,
            sortOrder,
          },
          select: questionSelect,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );

  return toAdminQuestion(row);
}

/**
 * Replaces a question's payload whole — there is no partial edit, for the reason
 * `QuestionUpsertSchema` gives.
 *
 * `format` may change with it: switching an `mcq` to a `picture_select` is a
 * legitimate authoring move, and the column follows the payload rather than
 * pinning it.
 */
export async function replaceQuestion(
  quizId: string,
  questionId: string,
  input: QuestionUpsertBody,
): Promise<AdminQuizQuestionDto> {
  const definition = parsePayload(
    QUIZ_QUESTION_SCHEMAS[input.format],
    input.definition,
    "definition",
    `${input.format} question`,
  );

  const row = await withSerializationRetry(() =>
    prisma.$transaction(
      async (tx) => {
        await assertQuestionEditable(tx, quizId, questionId);

        return tx.quizQuestion.update({
          where: { id: questionId },
          data: {
            format: input.format,
            schemaVersion: definition.schemaVersion,
            definition,
          },
          select: questionSelect,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );

  return toAdminQuestion(row);
}

/**
 * Removes a question and closes the gap it left.
 *
 * The renumbering is not cosmetic: `@@unique([quizId, sortOrder])` and the
 * player's `orderBy: sortOrder` mean a hole is harmless but a duplicate is not,
 * and the next `createQuestion` derives its index from the *count* — so leaving a
 * hole would make the next append collide with an existing row.
 *
 * Assigned in ascending order, which is what makes it safe under the unique
 * index: each target index is vacated by the row below it before being claimed.
 */
export async function deleteQuestion(
  quizId: string,
  questionId: string,
): Promise<{ id: string; remainingIds: string[] }> {
  return withSerializationRetry(() =>
    prisma.$transaction(
      async (tx) => {
        await assertQuestionEditable(tx, quizId, questionId);
        await tx.quizQuestion.delete({ where: { id: questionId } });

        const survivors = await tx.quizQuestion.findMany({
          where: { quizId },
          orderBy: { sortOrder: "asc" },
          select: { id: true, sortOrder: true },
        });

        for (const [index, question] of survivors.entries()) {
          if (question.sortOrder === index) continue;
          await tx.quizQuestion.update({
            where: { id: question.id },
            data: { sortOrder: index },
          });
        }

        return {
          id: questionId,
          remainingIds: survivors.map((question) => question.id),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

/** The slice of the client a transaction callback and the plain client share. */
type EditorWriter = Pick<
  typeof prisma,
  "quiz" | "quizQuestion" | "activity" | "badge"
>;

/**
 * `404` unless the question exists **and belongs to the quiz in the path**, then
 * the quiz's own editability.
 *
 * The ownership check is what stops `/quizzes/A/questions/<a question of B>` from
 * editing B's question through A's — a mismatch is a `404` rather than a `400`,
 * because from this caller's point of view that question does not exist under that
 * quiz.
 */
async function assertQuestionEditable(
  tx: EditorWriter,
  quizId: string,
  questionId: string,
): Promise<void> {
  const question = await tx.quizQuestion.findUnique({
    where: { id: questionId },
    select: { quizId: true, quiz: { select: { status: true } } },
  });
  if (!question || question.quizId !== quizId) {
    throw ApiError.notFound("No such question in this quiz");
  }
  assertEditable(question.quiz.status);
}

// --- Activities -----------------------------------------------------------

export type AdminActivityDto = {
  id: string;
  type: ActivityType;
  schemaVersion: number;
  status: ContentStatus;
  definition: ActivityDefinition;
  createdAt: Date;
  updatedAt: Date;
};

const activitySelect = {
  id: true,
  type: true,
  schemaVersion: true,
  status: true,
  definition: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ActivitySelect;

type ActivityRow = Prisma.ActivityGetPayload<{ select: typeof activitySelect }>;

function toAdminActivity(row: ActivityRow): AdminActivityDto {
  return {
    id: row.id,
    type: row.type,
    schemaVersion: row.schemaVersion,
    status: row.status,
    definition: asActivityDefinition(row.definition),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createActivity(
  input: ActivityUpsertBody,
): Promise<AdminActivityDto> {
  const definition = parsePayload(
    ACTIVITY_SCHEMAS[input.type],
    input.definition,
    "definition",
    `${input.type} activity`,
  );

  const row = await prisma.activity.create({
    data: {
      type: input.type,
      schemaVersion: definition.schemaVersion,
      definition,
    },
    select: activitySelect,
  });
  return toAdminActivity(row);
}

export function listActivities(options: {
  includeArchived: boolean;
  type?: ActivityType;
}): Promise<AdminActivityDto[]> {
  return prisma.activity
    .findMany({
      where: {
        ...(options.type ? { type: options.type } : {}),
        ...visibility(options.includeArchived),
      },
      orderBy: { createdAt: "desc" },
      select: activitySelect,
    })
    .then((rows) => rows.map(toAdminActivity));
}

export async function getActivity(id: string): Promise<AdminActivityDto> {
  const row = await prisma.activity.findUnique({
    where: { id },
    select: activitySelect,
  });
  if (!row) throw ApiError.notFound("No such activity");
  return toAdminActivity(row);
}

export async function updateActivity(
  id: string,
  input: ActivityUpsertBody,
): Promise<AdminActivityDto> {
  const definition = parsePayload(
    ACTIVITY_SCHEMAS[input.type],
    input.definition,
    "definition",
    `${input.type} activity`,
  );

  const row = await withSerializationRetry(() =>
    prisma.$transaction(
      async (tx) => {
        assertEditable(await readEditorStatus(tx, "activities", id));
        return tx.activity.update({
          where: { id },
          data: {
            type: input.type,
            schemaVersion: definition.schemaVersion,
            definition,
          },
          select: activitySelect,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
  return toAdminActivity(row);
}

// --- Badges ---------------------------------------------------------------

export type AdminBadgeDto = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  ruleType: BadgeRuleType;
  rule: BadgeRule;
  iconAssetId: string | null;
  iconUrl: string | null;
  status: ContentStatus;
};

const badgeSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  ruleType: true,
  rule: true,
  iconAssetId: true,
  iconAsset: { select: { url: true } },
  status: true,
} satisfies Prisma.BadgeSelect;

type BadgeRow = Prisma.BadgeGetPayload<{ select: typeof badgeSelect }>;

/**
 * `Badge.ruleType` is a plain `String` column — the engine looks a rule up by it
 * and warns on an unknown one (`lib/badge-rules.ts`), so the database
 * deliberately does not constrain it. Every row this API writes went through
 * `BadgeRuleTypeSchema`, and the cast asserts that rather than narrowing unknown
 * data; a legacy row naming something else would fail the route test's
 * `assertContract`.
 */
function toAdminBadge(row: BadgeRow): AdminBadgeDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    ruleType: row.ruleType as BadgeRuleType,
    rule: asBadgeRule(row.rule),
    iconAssetId: row.iconAssetId,
    iconUrl: row.iconAsset?.url ?? null,
    status: row.status,
  };
}

/** Validates a rule payload against the schema its `ruleType` names. */
function parseBadgeRule(ruleType: BadgeRuleType, rule: unknown): BadgeRule {
  return parsePayload(BADGE_RULE_SCHEMAS[ruleType], rule, "rule", ruleType);
}

export async function createBadge(
  input: BadgeCreateBody,
): Promise<AdminBadgeDto> {
  const rule = parseBadgeRule(input.ruleType, input.rule);

  const row = await asSlugConflict(() =>
    prisma.badge.create({
      data: {
        slug: input.slug,
        name: input.name,
        description: input.description ?? null,
        ruleType: input.ruleType,
        rule,
        iconAssetId: input.iconAssetId ?? null,
      },
      select: badgeSelect,
    }),
  );
  return toAdminBadge(row);
}

export function listBadges(options: {
  includeArchived: boolean;
}): Promise<AdminBadgeDto[]> {
  return prisma.badge
    .findMany({
      where: visibility(options.includeArchived),
      orderBy: { slug: "asc" },
      select: badgeSelect,
    })
    .then((rows) => rows.map(toAdminBadge));
}

export async function getBadge(id: string): Promise<AdminBadgeDto> {
  const row = await prisma.badge.findUnique({
    where: { id },
    select: badgeSelect,
  });
  if (!row) throw ApiError.notFound("No such badge");
  return toAdminBadge(row);
}

export async function updateBadge(
  id: string,
  input: BadgeUpdateBody,
): Promise<AdminBadgeDto> {
  // The schema guarantees the pair travels together, so validating on `ruleType`
  // alone covers both.
  const rule =
    input.ruleType === undefined
      ? undefined
      : parseBadgeRule(input.ruleType, input.rule);

  const row = await withSerializationRetry(() =>
    prisma.$transaction(
      async (tx) => {
        assertEditable(await readEditorStatus(tx, "badges", id));

        return asSlugConflict(() =>
          tx.badge.update({
            where: { id },
            data: {
              ...(input.slug === undefined ? {} : { slug: input.slug }),
              ...(input.name === undefined ? {} : { name: input.name }),
              ...(input.description === undefined
                ? {}
                : { description: input.description }),
              ...(input.iconAssetId === undefined
                ? {}
                : { iconAssetId: input.iconAssetId }),
              ...(input.ruleType === undefined
                ? {}
                : { ruleType: input.ruleType, rule }),
            },
            select: badgeSelect,
          }),
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
  return toAdminBadge(row);
}

/**
 * `Badge.slug` is unique, and an admin retyping one that exists is ordinary
 * rather than exceptional — it should read as "that slug is taken", not as a
 * server error. Same reasoning and same `details.code` as file 32's
 * `asSlugConflict`.
 */
async function asSlugConflict<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw ApiError.conflict("A badge with that slug already exists", {
        code: "DUPLICATE_SLUG",
      });
    }
    throw error;
  }
}

// --- Transitions ----------------------------------------------------------

/**
 * The three resources this module publishes, spelled as a path segment.
 *
 * Re-exported from `@kidlearn/types` rather than declared here, for the reason
 * file 32 gives about `CONTENT_RESOURCES`: the CMS speaks the same three strings,
 * and one definition is what stops the two from drifting. See that module for why
 * they are a separate union from the curriculum hierarchy's.
 */
export { EDITOR_CONTENT_RESOURCES as EDITOR_RESOURCES };
export type EditorResource = EditorContentResourceName;

const READ_BY_RESOURCE: Record<
  EditorResource,
  (id: string) => Promise<AdminQuizDto | AdminActivityDto | AdminBadgeDto>
> = {
  quizzes: getQuizSummary,
  activities: getActivity,
  badges: getBadge,
};

export type AdminEditorDto = AdminQuizDto | AdminActivityDto | AdminBadgeDto;

/**
 * Moves a quiz, activity or badge through the publishing workflow (FR-CMS-06).
 *
 * The same matrix, the same Serializable read-then-write and the same reasoning as
 * `transitionContent` in file 32 — the hop has to be judged against the status the
 * row *actually* holds, or two admins approving and rejecting at once both succeed.
 *
 * Publishing an activity or a quiz has a second effect worth stating: the student
 * lesson API gates `Lesson.activity` and `Lesson.quiz` on their own `status`, so a
 * published lesson shows neither until its parts are published in their own right
 * — and unpublishing one removes it from a live lesson without taking the lesson
 * down.
 *
 * **The publish hop carries the FR-AI-07 guard (file 37)**, for the reason
 * `transitionContent` gives: a quiz the generator wrote is a `draft` like any
 * other, and the matrix alone cannot tell it from one an author typed.
 */
export async function transitionEditorContent(
  resource: EditorResource,
  id: string,
  to: ContentStatus,
): Promise<AdminEditorDto> {
  await withSerializationRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const current = await readEditorGuardFields(tx, resource, id);
        assertTransition(current.status, to);
        if (to === "published") await assertAiPublishable(current.aiJobIds, tx);
        await writeEditorStatus(tx, resource, id, to);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );

  return READ_BY_RESOURCE[resource](id);
}

/**
 * The status a transition is judged against, and every job answerable for the
 * row's contents.
 *
 * `Badge` has no `aiJobId` and reports nothing: nothing generates badges, and a
 * badge is not lesson content — it is a reward rule an admin writes. Quizzes and
 * activities do carry one.
 *
 * A quiz reports its questions' jobs as well as its own. The generator appends to
 * a quiz that already exists and stamps only the questions, so the quiz row's
 * `aiJobId` is null for exactly the case where unreviewed model output is what
 * would go live (file 37, FR-AI-07).
 */
async function readEditorGuardFields(
  tx: EditorWriter,
  resource: EditorResource,
  id: string,
): Promise<{ status: ContentStatus; aiJobIds: string[] }> {
  const select = { status: true, aiJobId: true } as const;
  const row = await (resource === "quizzes"
    ? tx.quiz.findUnique({ where: { id }, select })
    : resource === "activities"
      ? tx.activity.findUnique({ where: { id }, select })
      : tx.badge.findUnique({ where: { id }, select: { status: true } }));

  if (!row) throw ApiError.notFound(`No such ${SINGULAR[resource]}`);

  const own = "aiJobId" in row && row.aiJobId !== null ? [row.aiJobId] : [];
  const fromQuestions =
    resource === "quizzes" ? await readQuizAiJobIds(id, tx) : [];

  return { status: row.status, aiJobIds: [...own, ...fromQuestions] };
}

async function readEditorStatus(
  tx: EditorWriter,
  resource: EditorResource,
  id: string,
): Promise<ContentStatus> {
  return (await readEditorGuardFields(tx, resource, id)).status;
}

/** `"quizzes".slice(0, -1)` is `"quizze"` — the names are spelled out instead. */
const SINGULAR: Record<EditorResource, string> = {
  quizzes: "quiz",
  activities: "activity",
  badges: "badge",
};

async function writeEditorStatus(
  tx: EditorWriter,
  resource: EditorResource,
  id: string,
  status: ContentStatus,
): Promise<void> {
  const args = { where: { id }, data: { status } };
  if (resource === "quizzes") await tx.quiz.update(args);
  else if (resource === "activities") await tx.activity.update(args);
  else await tx.badge.update(args);
}
