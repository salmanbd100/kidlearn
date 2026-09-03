import {
  type ContentStatus,
  type GradeLevel,
  type Language,
  Prisma,
} from "@kidlearn/db";
import {
  CONTENT_RESOURCES,
  type ContentResourceName,
  ORDERABLE_CONTENT_RESOURCES,
  type OrderableContentResourceName,
} from "@kidlearn/types";
import { ApiError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { withSerializationRetry } from "../lib/serializable-retry.js";
import { asSlugConflict } from "../lib/slug-conflict.js";
import type {
  LessonCreateBody,
  LessonUpdateBody,
  SubjectCreateBody,
  SubjectUpdateBody,
  TopicCreateBody,
  TopicUpdateBody,
  WorldCreateBody,
  WorldUpdateBody,
} from "../schemas/admin-content.js";
import { assertEditable, assertTransition } from "./contentStatusService.js";

/**
 * The curriculum hierarchy as admins write it (file 32, FR-CURR-04, FR-CMS-01).
 *
 * **Nothing here filters by status, and that is correct.** The guard in
 * `backend.md §4` binds *student-facing* queries; a CMS list that hid drafts
 * would be a CMS with nothing to edit. Publishing stays safe because none of
 * this is student-facing: every read in `routes/content.ts` filters
 * `status = published` at the query layer, so the whole visibility question is
 * decided there and by the status column these functions write.
 *
 * **Publish is immediate visibility (FR-CMS-06).** There is no second flag, no
 * cache and no publication queue: the moment `transitionContent` writes
 * `published`, the next student request returns the row. The inverse holds too —
 * `published → draft` withdraws it from every student response at once, without
 * deleting the row or the progress hanging off it.
 *
 * **A published row refuses an edit.** Every `update*` here runs through
 * `editWithinTransaction`, which applies `assertEditable` to the status the row
 * actually holds. The matrix guards the act of publishing; this guards the
 * content that stays published, which the matrix never sees because an edit does
 * not move the status. Withdraw to `draft` first.
 *
 * **Every write stamps `updatedBy`** with the acting `AdminUser.id`
 * (requirement 6). It is a parameter rather than something read off a request,
 * because service functions take no Express types (`backend.md §2`).
 *
 * The DTOs below type timestamps as `Date`, matching `ChildProfileDto`: the wire
 * format is an ISO string, which is `res.json()`'s doing and is what the schemas
 * in `packages/types/src/api` describe (`backend.md §7`).
 */

/** The two locales every piece of content carries, in a deterministic order. */
const LANGUAGES = ["en", "bn"] as const satisfies readonly Language[];

type LocalizedName = { en: string; bn: string };

type AuditFields = {
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AdminWorldDto = AuditFields & {
  id: string;
  slug: string;
  name: string;
  palette: Record<string, string>;
  mascotAssetId: string | null;
  status: ContentStatus;
  translations: LocalizedName;
};

export type AdminSubjectDto = AuditFields & {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
  gradeLevels: GradeLevel[];
  status: ContentStatus;
  translations: LocalizedName;
};

export type AdminTopicDto = AdminSubjectDto & { subjectId: string };

export type AdminLessonTranslationDto = {
  title: string;
  introScript: string;
  videoAssetId: string | null;
};

export type AdminLessonDto = AuditFields & {
  id: string;
  topicId: string;
  worldId: string;
  slug: string;
  title: string;
  sortOrder: number;
  gradeLevels: GradeLevel[];
  status: ContentStatus;
  activityId: string | null;
  quizId: string | null;
  conceptsIntroduced: string[];
  translations: {
    en: AdminLessonTranslationDto;
    bn: AdminLessonTranslationDto;
  };
};

/**
 * Folds translation rows into the `{ en, bn }` pair the API publishes.
 *
 * A locale can legitimately be missing — the translation tables have no
 * constraint forcing both to exist, and the seeds predate this API — so a gap
 * becomes an empty string rather than an exception. The CMS renders that as an
 * empty field an author can fill, which is the useful behaviour; throwing would
 * let one incomplete row take out the whole list.
 */
function toLocalizedName(rows: Array<{ language: Language; name: string }>) {
  return {
    en: rows.find((row) => row.language === "en")?.name ?? "",
    bn: rows.find((row) => row.language === "bn")?.name ?? "",
  };
}

function nameTranslationCreates(translations: LocalizedName) {
  return LANGUAGES.map((language) => ({
    language,
    name: translations[language],
  }));
}

// --- Worlds ---------------------------------------------------------------

const worldSelect = {
  id: true,
  slug: true,
  name: true,
  palette: true,
  mascotAssetId: true,
  status: true,
  updatedBy: true,
  createdAt: true,
  updatedAt: true,
  translations: { select: { language: true, name: true } },
} satisfies Prisma.WorldSelect;

type WorldRow = Prisma.WorldGetPayload<{ select: typeof worldSelect }>;

function toAdminWorld(row: WorldRow): AdminWorldDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    // `palette` is a JSONB column, so Prisma types it `JsonValue` and nothing can
    // narrow it statically. The flat token→colour shape is the contract
    // `PaletteSchema` states, and a row that broke it would fail the route test's
    // `assertContract` rather than pass silently.
    palette: (row.palette ?? {}) as Record<string, string>,
    mascotAssetId: row.mascotAssetId,
    status: row.status,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    translations: toLocalizedName(row.translations),
  };
}

export function listWorlds(options: {
  includeArchived: boolean;
}): Promise<AdminWorldDto[]> {
  return prisma.world
    .findMany({
      where: options.includeArchived ? {} : NOT_ARCHIVED,
      orderBy: { name: "asc" },
      select: worldSelect,
    })
    .then((rows) => rows.map(toAdminWorld));
}

export async function getWorld(id: string): Promise<AdminWorldDto> {
  const row = await prisma.world.findUnique({
    where: { id },
    select: worldSelect,
  });
  if (!row) throw ApiError.notFound("No such world");
  return toAdminWorld(row);
}

export async function createWorld(
  input: WorldCreateBody,
  adminId: string,
): Promise<AdminWorldDto> {
  const row = await asSlugConflict("world", () =>
    prisma.world.create({
      data: {
        slug: input.slug,
        name: input.name,
        palette: input.palette,
        mascotAssetId: input.mascotAssetId ?? null,
        updatedBy: adminId,
        translations: { create: nameTranslationCreates(input.translations) },
      },
      select: worldSelect,
    }),
  );
  return toAdminWorld(row);
}

export async function updateWorld(
  id: string,
  input: WorldUpdateBody,
  adminId: string,
): Promise<AdminWorldDto> {
  // Named rather than inlined, for the reason `createChildProfileOnce` gives:
  // Prisma's update input is an XOR of a checked and an unchecked shape, and an
  // inline literal carrying both a scalar foreign key (`mascotAssetId`) and a
  // nested relation write (`translations`) is ambiguous to the compiler.
  const data: Prisma.WorldUncheckedUpdateInput = {
    ...pick(input, ["slug", "name", "palette"]),
    ...optionalNullable("mascotAssetId", input.mascotAssetId),
    updatedBy: adminId,
    ...(input.translations && {
      translations: {
        upsert: nameUpserts(input.translations, (language) => ({
          worldId_language: { worldId: id, language },
        })),
      },
    }),
  };

  const row = await editWithinTransaction("worlds", id, (tx) =>
    asSlugConflict("world", () =>
      tx.world.update({ where: { id }, data, select: worldSelect }),
    ),
  );
  return toAdminWorld(row);
}

// --- Subjects -------------------------------------------------------------

const subjectSelect = {
  id: true,
  slug: true,
  name: true,
  sortOrder: true,
  gradeLevels: true,
  status: true,
  updatedBy: true,
  createdAt: true,
  updatedAt: true,
  translations: { select: { language: true, name: true } },
} satisfies Prisma.SubjectSelect;

type SubjectRow = Prisma.SubjectGetPayload<{ select: typeof subjectSelect }>;

function toAdminSubject(row: SubjectRow): AdminSubjectDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    sortOrder: row.sortOrder,
    gradeLevels: row.gradeLevels,
    status: row.status,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    translations: toLocalizedName(row.translations),
  };
}

export function listSubjects(options: {
  includeArchived: boolean;
}): Promise<AdminSubjectDto[]> {
  return prisma.subject
    .findMany({
      where: options.includeArchived ? {} : NOT_ARCHIVED,
      orderBy: SIBLING_ORDER,
      select: subjectSelect,
    })
    .then((rows) => rows.map(toAdminSubject));
}

export async function getSubject(id: string): Promise<AdminSubjectDto> {
  const row = await prisma.subject.findUnique({
    where: { id },
    select: subjectSelect,
  });
  if (!row) throw ApiError.notFound("No such subject");
  return toAdminSubject(row);
}

export async function createSubject(
  input: SubjectCreateBody,
  adminId: string,
): Promise<AdminSubjectDto> {
  const sortOrder = await nextSortOrder("subjects", {});

  const row = await asSlugConflict("subject", () =>
    prisma.subject.create({
      data: {
        slug: input.slug,
        name: input.name,
        gradeLevels: input.gradeLevels,
        sortOrder,
        updatedBy: adminId,
        translations: { create: nameTranslationCreates(input.translations) },
      },
      select: subjectSelect,
    }),
  );
  return toAdminSubject(row);
}

export async function updateSubject(
  id: string,
  input: SubjectUpdateBody,
  adminId: string,
): Promise<AdminSubjectDto> {
  const data: Prisma.SubjectUncheckedUpdateInput = {
    ...pick(input, ["slug", "name", "gradeLevels"]),
    updatedBy: adminId,
    ...(input.translations && {
      translations: {
        upsert: nameUpserts(input.translations, (language) => ({
          subjectId_language: { subjectId: id, language },
        })),
      },
    }),
  };

  const row = await editWithinTransaction("subjects", id, (tx) =>
    asSlugConflict("subject", () =>
      tx.subject.update({ where: { id }, data, select: subjectSelect }),
    ),
  );
  return toAdminSubject(row);
}

// --- Topics ---------------------------------------------------------------

const topicSelect = {
  id: true,
  subjectId: true,
  slug: true,
  name: true,
  sortOrder: true,
  gradeLevels: true,
  status: true,
  updatedBy: true,
  createdAt: true,
  updatedAt: true,
  translations: { select: { language: true, name: true } },
} satisfies Prisma.TopicSelect;

type TopicRow = Prisma.TopicGetPayload<{ select: typeof topicSelect }>;

function toAdminTopic(row: TopicRow): AdminTopicDto {
  return { ...toAdminSubject({ ...row }), subjectId: row.subjectId };
}

export function listTopics(options: {
  includeArchived: boolean;
  subjectId?: string;
}): Promise<AdminTopicDto[]> {
  return prisma.topic
    .findMany({
      where: {
        ...(options.subjectId ? { subjectId: options.subjectId } : {}),
        ...(options.includeArchived ? {} : NOT_ARCHIVED),
      },
      orderBy: SIBLING_ORDER,
      select: topicSelect,
    })
    .then((rows) => rows.map(toAdminTopic));
}

export async function getTopic(id: string): Promise<AdminTopicDto> {
  const row = await prisma.topic.findUnique({
    where: { id },
    select: topicSelect,
  });
  if (!row) throw ApiError.notFound("No such topic");
  return toAdminTopic(row);
}

export async function createTopic(
  input: TopicCreateBody,
  adminId: string,
): Promise<AdminTopicDto> {
  await assertParentExists("subject", input.subjectId);
  const sortOrder = await nextSortOrder("topics", {
    subjectId: input.subjectId,
  });

  const row = await asSlugConflict("topic", () =>
    prisma.topic.create({
      data: {
        subjectId: input.subjectId,
        slug: input.slug,
        name: input.name,
        gradeLevels: input.gradeLevels,
        sortOrder,
        updatedBy: adminId,
        translations: { create: nameTranslationCreates(input.translations) },
      },
      select: topicSelect,
    }),
  );
  return toAdminTopic(row);
}

export async function updateTopic(
  id: string,
  input: TopicUpdateBody,
  adminId: string,
): Promise<AdminTopicDto> {
  const data: Prisma.TopicUncheckedUpdateInput = {
    ...pick(input, ["slug", "name", "gradeLevels"]),
    updatedBy: adminId,
    ...(input.translations && {
      translations: {
        upsert: nameUpserts(input.translations, (language) => ({
          topicId_language: { topicId: id, language },
        })),
      },
    }),
  };

  const row = await editWithinTransaction("topics", id, (tx) =>
    asSlugConflict("topic", () =>
      tx.topic.update({ where: { id }, data, select: topicSelect }),
    ),
  );
  return toAdminTopic(row);
}

// --- Lessons --------------------------------------------------------------

const lessonSelect = {
  id: true,
  topicId: true,
  worldId: true,
  slug: true,
  title: true,
  sortOrder: true,
  gradeLevels: true,
  status: true,
  activityId: true,
  quizId: true,
  conceptsIntroduced: true,
  updatedBy: true,
  createdAt: true,
  updatedAt: true,
  translations: {
    select: {
      language: true,
      title: true,
      introScript: true,
      videoAssetId: true,
    },
  },
} satisfies Prisma.LessonSelect;

type LessonRow = Prisma.LessonGetPayload<{ select: typeof lessonSelect }>;

/** Same reasoning as `toLocalizedName`: a missing locale is editable, not fatal. */
const EMPTY_LESSON_TRANSLATION: AdminLessonTranslationDto = {
  title: "",
  introScript: "",
  videoAssetId: null,
};

function toAdminLesson(row: LessonRow): AdminLessonDto {
  const forLanguage = (language: Language): AdminLessonTranslationDto => {
    const found = row.translations.find((t) => t.language === language);
    if (!found) return EMPTY_LESSON_TRANSLATION;
    return {
      title: found.title,
      introScript: found.introScript,
      videoAssetId: found.videoAssetId,
    };
  };

  return {
    id: row.id,
    topicId: row.topicId,
    worldId: row.worldId,
    slug: row.slug,
    title: row.title,
    sortOrder: row.sortOrder,
    gradeLevels: row.gradeLevels,
    status: row.status,
    activityId: row.activityId,
    quizId: row.quizId,
    conceptsIntroduced: row.conceptsIntroduced,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    translations: { en: forLanguage("en"), bn: forLanguage("bn") },
  };
}

export function listLessons(options: {
  includeArchived: boolean;
  topicId?: string;
  worldId?: string;
}): Promise<AdminLessonDto[]> {
  return prisma.lesson
    .findMany({
      where: {
        ...(options.topicId ? { topicId: options.topicId } : {}),
        ...(options.worldId ? { worldId: options.worldId } : {}),
        ...(options.includeArchived ? {} : NOT_ARCHIVED),
      },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      select: lessonSelect,
    })
    .then((rows) => rows.map(toAdminLesson));
}

export async function getLesson(id: string): Promise<AdminLessonDto> {
  const row = await prisma.lesson.findUnique({
    where: { id },
    select: lessonSelect,
  });
  if (!row) throw ApiError.notFound("No such lesson");
  return toAdminLesson(row);
}

export async function createLesson(
  input: LessonCreateBody,
  adminId: string,
): Promise<AdminLessonDto> {
  await assertParentExists("topic", input.topicId);
  await assertParentExists("world", input.worldId);
  const sortOrder = await nextSortOrder("lessons", { topicId: input.topicId });

  const row = await asSlugConflict("lesson", () =>
    prisma.lesson.create({
      data: {
        topicId: input.topicId,
        worldId: input.worldId,
        slug: input.slug,
        title: input.title,
        gradeLevels: input.gradeLevels,
        conceptsIntroduced: input.conceptsIntroduced ?? [],
        activityId: input.activityId ?? null,
        quizId: input.quizId ?? null,
        sortOrder,
        updatedBy: adminId,
        translations: {
          create: LANGUAGES.map((language) => ({
            language,
            title: input.translations[language].title,
            introScript: input.translations[language].introScript,
            videoAssetId: input.translations[language].videoAssetId ?? null,
          })),
        },
      },
      select: lessonSelect,
    }),
  );
  return toAdminLesson(row);
}

export async function updateLesson(
  id: string,
  input: LessonUpdateBody,
  adminId: string,
): Promise<AdminLessonDto> {
  const translations = input.translations;

  const row = await editWithinTransaction("lessons", id, async (tx) => {
    if (input.worldId) await assertParentExists("world", input.worldId);

    return asSlugConflict("lesson", () =>
      tx.lesson.update({
        where: { id },
        data: {
          ...pick(input, [
            "slug",
            "title",
            "worldId",
            "gradeLevels",
            "conceptsIntroduced",
          ]),
          ...optionalNullable("activityId", input.activityId),
          ...optionalNullable("quizId", input.quizId),
          updatedBy: adminId,
          ...(translations === undefined
            ? {}
            : {
                translations: {
                  upsert: LANGUAGES.map((language) => {
                    const write = {
                      title: translations[language].title,
                      introScript: translations[language].introScript,
                      videoAssetId: translations[language].videoAssetId ?? null,
                    };
                    return {
                      where: { lessonId_language: { lessonId: id, language } },
                      create: { language, ...write },
                      update: write,
                    };
                  }),
                },
              }),
        },
        select: lessonSelect,
      }),
    );
  });
  return toAdminLesson(row);
}

// --- Transitions ----------------------------------------------------------

/**
 * The four resources this router manages, spelled as a path segment.
 *
 * Re-exported from `@kidlearn/types` rather than declared here: the CMS speaks
 * the same four strings, and one definition is what stops the two from drifting.
 */
export { CONTENT_RESOURCES };
export type ContentResource = ContentResourceName;

export type AdminContentDto =
  | AdminWorldDto
  | AdminSubjectDto
  | AdminTopicDto
  | AdminLessonDto;

export const READ_BY_RESOURCE: Record<
  ContentResource,
  (id: string) => Promise<AdminContentDto>
> = {
  worlds: getWorld,
  subjects: getSubject,
  topics: getTopic,
  lessons: getLesson,
};

/** The slice of the client a transaction callback and the plain client share. */
type ContentWriter = Pick<
  typeof prisma,
  "world" | "subject" | "topic" | "lesson"
>;

/**
 * Moves one row through the publishing workflow (FR-CMS-06).
 *
 * The read and the write are two statements inside a Serializable transaction
 * rather than one conditional update, because the matrix has to be applied to the
 * status the row *actually* holds: two admins approving and rejecting the same
 * lesson at the same moment must not both read `in_review` and both succeed. The
 * loser aborts, retries, and has its hop judged against what the winner wrote.
 */
export async function transitionContent(
  resource: ContentResource,
  id: string,
  to: ContentStatus,
  adminId: string,
): Promise<AdminContentDto> {
  await withSerializationRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const current = await readStatus(tx, resource, id);
        assertTransition(current, to);
        await writeStatus(tx, resource, id, to, adminId);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );

  return READ_BY_RESOURCE[resource](id);
}

async function readStatus(
  tx: ContentWriter,
  resource: ContentResource,
  id: string,
): Promise<ContentStatus> {
  const select = { status: true } as const;
  const row = await (resource === "worlds"
    ? tx.world.findUnique({ where: { id }, select })
    : resource === "subjects"
      ? tx.subject.findUnique({ where: { id }, select })
      : resource === "topics"
        ? tx.topic.findUnique({ where: { id }, select })
        : tx.lesson.findUnique({ where: { id }, select }));

  if (!row) throw ApiError.notFound(`No such ${singular(resource)}`);
  return row.status;
}

async function writeStatus(
  tx: ContentWriter,
  resource: ContentResource,
  id: string,
  status: ContentStatus,
  adminId: string,
): Promise<void> {
  const args = { where: { id }, data: { status, updatedBy: adminId } };
  if (resource === "worlds") await tx.world.update(args);
  else if (resource === "subjects") await tx.subject.update(args);
  else if (resource === "topics") await tx.topic.update(args);
  else await tx.lesson.update(args);
}

/**
 * Runs one edit against the status the row actually holds.
 *
 * Serializable and read-then-write for the reason `transitionContent` gives, and
 * the interleaving it rules out is the one that matters most here: a `published`
 * check made before the transaction can be true when it is read and stale when
 * the edit lands, which is precisely how a rewrite reaches a live lesson. The
 * loser of the race retries and is refused.
 *
 * `readStatus` also supplies the `404`, so this replaces the existence check the
 * edit functions would otherwise make in a separate query.
 */
async function editWithinTransaction<T>(
  resource: ContentResource,
  id: string,
  write: (tx: ContentWriter) => Promise<T>,
): Promise<T> {
  return withSerializationRetry(() =>
    prisma.$transaction(
      async (tx) => {
        assertEditable(await readStatus(tx, resource, id));
        return write(tx);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

// --- Reordering -----------------------------------------------------------

/** Which resources have a `sortOrder` to reorder. `World` has no such column. */
export { ORDERABLE_CONTENT_RESOURCES as ORDERABLE_RESOURCES };
export type OrderableResource = OrderableContentResourceName;

/**
 * Persists a whole sibling set's order in one transaction (requirement 4).
 *
 * **Why the payload is every sibling.** "Move this one to index 3" is a claim
 * about the other rows too, and two such requests arriving together leave two
 * rows sharing an index and a tree that renders in an order nobody chose. A full
 * set makes the write total, and checking it against the real siblings is what
 * turns a stale tab — one whose list predates a colleague's create — into a `400`
 * rather than a silent reordering of a set the admin never saw.
 *
 * **Archived siblings follow the list the admin is looking at.** The sibling set
 * this validates against has to be the one the caller can see, or a reorder
 * performed from one view fails against the other. `includeArchived` therefore
 * mirrors the flag on the list endpoints and defaults to the default view: with
 * it off, archived rows are neither expected in the payload nor renumbered, and
 * their `sortOrder` may tie with a live row's — which costs nothing, since an
 * archived row appears in no student query. With it on, they are ordered like any
 * other sibling, because the admin dragged them.
 */
export async function reorderContent(
  resource: OrderableResource,
  input: { parentId?: string; orderedIds: string[]; includeArchived?: boolean },
  adminId: string,
): Promise<string[]> {
  if (resource !== "subjects" && input.parentId === undefined) {
    throw new ApiError(
      400,
      "VALIDATION_FAILED",
      `parentId is required when reordering ${resource}`,
    );
  }

  const siblings = await findSiblingIds(
    resource,
    input.parentId,
    input.includeArchived === true,
  );
  assertSameSet(siblings, input.orderedIds);

  await withSerializationRetry(() =>
    prisma.$transaction(
      (tx) =>
        Promise.all(
          input.orderedIds.map((id, sortOrder) =>
            updateSortOrder(tx, resource, id, sortOrder, adminId),
          ),
        ),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );

  return input.orderedIds;
}

function findSiblingIds(
  resource: OrderableResource,
  parentId: string | undefined,
  includeArchived: boolean,
): Promise<Array<{ id: string }>> {
  const select = { id: true } as const;
  const visible = includeArchived ? {} : NOT_ARCHIVED;
  if (resource === "subjects") {
    return prisma.subject.findMany({ where: visible, select });
  }
  if (resource === "topics") {
    return prisma.topic.findMany({
      where: { subjectId: parentId, ...visible },
      select,
    });
  }
  return prisma.lesson.findMany({
    where: { topicId: parentId, ...visible },
    select,
  });
}

function updateSortOrder(
  tx: ContentWriter,
  resource: OrderableResource,
  id: string,
  sortOrder: number,
  adminId: string,
): Promise<unknown> {
  const args = { where: { id }, data: { sortOrder, updatedBy: adminId } };
  if (resource === "subjects") return tx.subject.update(args);
  if (resource === "topics") return tx.topic.update(args);
  return tx.lesson.update(args);
}

/**
 * Rejects anything that is not exactly the sibling set — a missing id, an extra
 * one, or a duplicate — and names which. "Reorder failed" would leave an admin
 * with a list that snapped back and no idea why.
 */
function assertSameSet(
  siblings: Array<{ id: string }>,
  orderedIds: string[],
): void {
  const expected = new Set(siblings.map((row) => row.id));
  const received = new Set(orderedIds);

  const missing = [...expected].filter((id) => !received.has(id));
  const unknown = orderedIds.filter((id) => !expected.has(id));
  const hasDuplicates = received.size !== orderedIds.length;

  if (missing.length === 0 && unknown.length === 0 && !hasDuplicates) return;

  throw new ApiError(
    400,
    "VALIDATION_FAILED",
    "orderedIds must be exactly the set of siblings being reordered",
    { missing, unknown, hasDuplicates },
  );
}

// --- Shared helpers -------------------------------------------------------

/** Archived rows are hidden from admin lists by default (requirement 5). */
const ARCHIVED: ContentStatus = "archived";
const NOT_ARCHIVED = { status: { not: ARCHIVED } };

/**
 * Ties broken by name, so a set that has never been reordered — every row at
 * `sortOrder` 0 — still comes back in a stable order rather than Postgres's.
 */
const SIBLING_ORDER = [
  { sortOrder: "asc" },
  { name: "asc" },
] satisfies Prisma.SubjectOrderByWithRelationInput[];

/** Copies only the keys actually supplied, so a `PATCH` stays partial. */
function pick<TSource extends object, TKey extends keyof TSource>(
  source: TSource,
  keys: readonly TKey[],
): Partial<Pick<TSource, TKey>> {
  const result: Partial<Pick<TSource, TKey>> = {};
  for (const key of keys) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}

/**
 * A nullable field on a `PATCH`, where `null` clears the link and `undefined`
 * leaves it alone. `pick` cannot express the difference — both are "absent" to a
 * spread — and collapsing them would make a link impossible to remove.
 */
function optionalNullable<TKey extends string>(
  key: TKey,
  value: string | null | undefined,
): Partial<Record<TKey, string | null>> {
  return value === undefined
    ? {}
    : // A computed key widens to `{ [x: string]: … }` — TypeScript cannot tie a
      // generic `TKey` back to the literal it was instantiated with, so the
      // narrowing this asserts is not expressible. Safe because `key` is the
      // only thing written and it is `TKey` by the signature.
      ({ [key]: value } as Record<TKey, string | null>);
}

/**
 * The per-locale `upsert` list that writes a name in both languages.
 *
 * `whereFor` is a callback rather than a foreign-key name, because Prisma's
 * compound-unique inputs (`worldId_language`, `subjectId_language`, …) are
 * distinct literal-keyed types: a computed key would widen to an index signature
 * and stop type-checking against any of them. The callback keeps the shared part
 * — that a name is written in both locales, create-or-update — in one place while
 * each caller supplies its own literal.
 */
function nameUpserts<TWhere>(
  translations: LocalizedName,
  whereFor: (language: Language) => TWhere,
) {
  return LANGUAGES.map((language) => ({
    where: whereFor(language),
    create: { language, name: translations[language] },
    update: { name: translations[language] },
  }));
}

/** The next free position at the end of a sibling set. */
async function nextSortOrder(
  resource: OrderableResource,
  where: { subjectId?: string; topicId?: string },
): Promise<number> {
  const aggregate = await (resource === "subjects"
    ? prisma.subject.aggregate({ _max: { sortOrder: true } })
    : resource === "topics"
      ? prisma.topic.aggregate({
          where: { subjectId: where.subjectId },
          _max: { sortOrder: true },
        })
      : prisma.lesson.aggregate({
          where: { topicId: where.topicId },
          _max: { sortOrder: true },
        }));

  const highest = aggregate._max.sortOrder;
  return highest === null || highest === undefined ? 0 : highest + 1;
}

/**
 * `404` for a parent that does not exist, rather than the `500` that Prisma's
 * foreign-key violation would otherwise become.
 */
async function assertParentExists(
  model: "world" | "subject" | "topic",
  id: string,
): Promise<void> {
  const select = { id: true } as const;
  const found = await (model === "world"
    ? prisma.world.findUnique({ where: { id }, select })
    : model === "subject"
      ? prisma.subject.findUnique({ where: { id }, select })
      : prisma.topic.findUnique({ where: { id }, select }));

  if (!found) throw ApiError.notFound(`No such ${model}`);
}

function singular(resource: ContentResource): string {
  return resource.slice(0, -1);
}
