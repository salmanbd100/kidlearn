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
import { prisma } from "../../../config/prisma.js";
import { ApiError } from "../../../shared/errors/errors.js";
import { withSerializationRetry } from "../../../shared/utils/serializable-retry.js";
import { asSlugConflict } from "../../../shared/utils/slug-conflict.js";
import {
  assertAiPublishable,
  assertEditable,
  assertTransition,
} from "../../content/content-status.service.js";
import type {
  LessonCreateBody,
  LessonUpdateBody,
  SubjectCreateBody,
  SubjectUpdateBody,
  TopicCreateBody,
  TopicUpdateBody,
  WorldCreateBody,
  WorldUpdateBody,
} from "../admin-content.schema.js";

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
    // Cast: `palette` is JSONB (`JsonValue`); `PaletteSchema` states the shape and `assertContract` catches drift.
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
  // Named rather than inlined: Prisma's update input is an XOR, and a literal with both a scalar FK and a nested write is ambiguous.
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

type ContentWriter = Pick<
  typeof prisma,
  "world" | "subject" | "topic" | "lesson"
>;

export async function transitionContent(
  resource: ContentResource,
  id: string,
  to: ContentStatus,
  adminId: string,
): Promise<AdminContentDto> {
  await withSerializationRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const current = await readGuardFields(tx, resource, id);
        assertTransition(current.status, to);
        if (to === "published") await assertAiPublishable(current.aiJobIds, tx);
        await writeStatus(tx, resource, id, to, adminId);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );

  return READ_BY_RESOURCE[resource](id);
}

async function readGuardFields(
  tx: ContentWriter,
  resource: ContentResource,
  id: string,
): Promise<{ status: ContentStatus; aiJobIds: (string | null)[] }> {
  const select = { status: true } as const;
  // Media assets carry their own `aiJobId`; one awaiting review can be linked by a plain edit, so the row's job is not the whole question.
  const asset = { select: { aiJobId: true } } as const;

  if (resource === "worlds") {
    const row = await tx.world.findUnique({
      where: { id },
      select: { ...select, mascotAsset: asset },
    });
    if (!row) throw ApiError.notFound("No such world");
    return { status: row.status, aiJobIds: [row.mascotAsset?.aiJobId ?? null] };
  }

  if (resource === "subjects") {
    const row = await tx.subject.findUnique({ where: { id }, select });
    if (!row) throw ApiError.notFound("No such subject");
    return { status: row.status, aiJobIds: [] };
  }

  if (resource === "topics") {
    const row = await tx.topic.findUnique({ where: { id }, select });
    if (!row) throw ApiError.notFound("No such topic");
    return { status: row.status, aiJobIds: [] };
  }

  const row = await tx.lesson.findUnique({
    where: { id },
    select: {
      ...select,
      aiJobId: true,
      translations: {
        select: {
          introAudioAsset: asset,
          videoAsset: asset,
          videoPosterAsset: asset,
        },
      },
    },
  });
  if (!row) throw ApiError.notFound("No such lesson");

  return {
    status: row.status,
    aiJobIds: [
      row.aiJobId ?? null,
      ...row.translations.flatMap((translation) => [
        translation.introAudioAsset?.aiJobId ?? null,
        translation.videoAsset?.aiJobId ?? null,
        translation.videoPosterAsset?.aiJobId ?? null,
      ]),
    ],
  };
}

async function readStatus(
  tx: ContentWriter,
  resource: ContentResource,
  id: string,
): Promise<ContentStatus> {
  return (await readGuardFields(tx, resource, id)).status;
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

// `World` has no `sortOrder`.
export { ORDERABLE_CONTENT_RESOURCES as ORDERABLE_RESOURCES };
export type OrderableResource = OrderableContentResourceName;

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

// Names the missing, extra or duplicate id; a bare "Reorder failed" leaves the admin with a list that snapped back.
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

const ARCHIVED: ContentStatus = "archived";
const NOT_ARCHIVED = { status: { not: ARCHIVED } };

// Ties broken by name so a never-reordered set (all `sortOrder` 0) is stable.
const SIBLING_ORDER = [
  { sortOrder: "asc" },
  { name: "asc" },
] satisfies Prisma.SubjectOrderByWithRelationInput[];

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

// `null` clears the link, `undefined` leaves it alone; `pick` cannot tell them apart.
function optionalNullable<TKey extends string>(
  key: TKey,
  value: string | null | undefined,
): Partial<Record<TKey, string | null>> {
  return value === undefined
    ? {}
    : // Cast: a computed key widens to an index signature; `key` is the only thing written and is `TKey` by signature.
      ({ [key]: value } as Record<TKey, string | null>);
}

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

// `404` for a missing parent rather than the `500` Prisma's foreign-key violation would become.
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
