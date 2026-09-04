import type {
  ChildProfile,
  ContentStatus,
  MediaAsset,
  Prisma,
} from "@kidlearn/db";
import {
  type LessonAssetFallbacks,
  safeParseActivityDefinition,
  safeParseQuizQuestion,
} from "@kidlearn/types";
import { ApiError } from "../lib/errors.js";
import {
  type Lang,
  type LocalePick,
  pickLocale,
  toLocaleMap,
} from "../lib/locale.js";
import { prisma } from "../lib/prisma.js";
import {
  isPublished,
  publishedForChild,
  publishedOnly,
  publishedRelation,
  publishedRelationForChild,
} from "../lib/published-for-child.js";

/**
 * Student-facing curriculum reads (FR-CURR-01..02, FR-WORLD-01..05, spec §7.3.4).
 */

/**
 * The subset of `pino`'s logger this module needs. Declared structurally so the
 * service stays callable without an HTTP request (`backend.md §2`).
 */
export type ContentLogger = {
  error: (context: Record<string, unknown>, message: string) => void;
  warn: (context: Record<string, unknown>, message: string) => void;
};

/** A media reference flattened for the client — no ids of rows it cannot fetch. */
export type MediaSummary = {
  id: string;
  url: string;
  kind: MediaAsset["kind"];
};

export type WorldSummary = {
  id: string;
  slug: string;
  name: string;
  /** Data-driven theming (FR-WORLD-05): the client reads tokens from here. */
  palette: Prisma.JsonValue;
  mascot: MediaSummary | null;
};

export type SubjectSummary = {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
  /**
   * Reserved contract field. The settled schema has no `Subject.iconAsset`
   * column; the implementation spec's shape assumed one. Returned as an
   * explicit `null` so adding the column later is not a breaking change.
   */
  iconAsset: MediaSummary | null;
};

export type TopicSummary = {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
};

export type LessonListItem = {
  id: string;
  slug: string;
  title: string;
  worldId: string;
  sortOrder: number;
  /**
   * Reserved contract fields, all four explicitly `null`:
   *  - `thumbnailUrl` / `durationEstimateSec` — the implementation spec asked
   *    for them but the settled `Lesson` model has neither column.
   *  - `nameAudioUrl` — the locale-resolved voice-over of `title`, which a
   *    pre-reader needs to know what a tile says. `LessonTranslation` has no
   *    such column until the voice pipeline (file 36) adds one.
   *  - `progress` — reserved. File 16 shipped `GET /api/progress/lessons/:id`
   *    instead of a join here, so a tile's progress and the player's resume point
   *    have one owner and cannot disagree.
   */
  thumbnailUrl: string | null;
  durationEstimateSec: number | null;
  nameAudioUrl: string | null;
  progress: null;
};

/** A topic heading and the lessons of one world that sit under it. */
export type WorldTopicLessons = TopicSummary & { lessons: LessonListItem[] };

export type LessonDetail = {
  id: string;
  slug: string;
  title: string;
  worldId: string;
  world: WorldSummary;
  /** Which locale supplied `introScript` — `videoUrl` falls back independently. */
  locale: Lang;
  introScript: string | null;
  introAudioUrl: string | null;
  videoUrl: string | null;
  videoPosterUrl: string | null;
  /** Which of the three media above were substituted from English. */
  assetFallbacks: LessonAssetFallbacks;
  activity: {
    id: string;
    type: string;
    schemaVersion: number;
    definition: Prisma.JsonValue;
  } | null;
  quiz: {
    id: string;
    title: string | null;
    questions: Array<{
      id: string;
      /** The settled schema names this `format`, not `type`. */
      format: string;
      schemaVersion: number;
      sortOrder: number;
      definition: Prisma.JsonValue;
    }>;
  } | null;
  progress: null;
};

/**
 * Whether an asset the child is about to receive came from English instead of
 * their own locale (FR-I18N-01).
 */
function isSubstituted(pick: LocalePick<string>, requested: Lang): boolean {
  return pick.value !== null && pick.locale !== requested;
}

/** A payload's own `type` literal must agree with the enum column beside it. */
function assertDiscriminatorAgrees(
  discriminator: { column: string; payload: string },
  ids: Record<string, string>,
  label: string,
  log: ContentLogger,
): void {
  if (discriminator.column === discriminator.payload) return;

  log.error(
    { ...ids, column: discriminator.column, payload: discriminator.payload },
    `published ${label} column disagrees with its definition type`,
  );
  throw new ApiError(500, "INTERNAL", "Content unavailable");
}

/** The child-facing name of a curriculum row, in their language. */
function pickName(
  translations: readonly { language: Lang; name: string }[] | undefined,
  fallbackLabel: string,
  language: Lang,
): string {
  return (
    pickLocale(
      toLocaleMap(translations, (row) => row.name),
      language,
    ).value ?? fallbackLabel
  );
}

function toMediaSummary(asset: MediaAsset | null): MediaSummary | null {
  return asset ? { id: asset.id, url: asset.url, kind: asset.kind } : null;
}

function toWorldSummary(
  world: {
    id: string;
    slug: string;
    name: string;
    palette: Prisma.JsonValue;
  } & {
    mascotAsset: MediaAsset | null;
    translations?: { language: Lang; name: string }[];
  },
  language: Lang,
): WorldSummary {
  return {
    id: world.id,
    slug: world.slug,
    name: pickName(world.translations, world.name, language),
    palette: world.palette,
    mascot: toMediaSummary(world.mascotAsset),
  };
}

/**
 * FR-WORLD-01..03, FR-WORLD-05 — the themed worlds the home screen renders.
 * Worlds carry no grade tagging of their own, so only the status gate applies.
 */
export async function listWorlds(child: ChildProfile): Promise<WorldSummary[]> {
  const worlds = await prisma.world.findMany({
    where: publishedOnly,
    orderBy: { slug: "asc" },
    include: { mascotAsset: true, translations: true },
  });
  return worlds.map((world) => toWorldSummary(world, child.preferredLanguage));
}

/**
 * FR-CURR-01 — subjects that actually have something for this child to do. The
 * `topics.some.lessons.some` existence check is what keeps a dead tile off the
 * home screen when every lesson underneath is still in draft.
 */
export async function listSubjectsForChild(
  child: ChildProfile,
): Promise<SubjectSummary[]> {
  const visible = publishedForChild(child);
  const subjects = await prisma.subject.findMany({
    where: {
      ...visible,
      topics: { some: { ...visible, lessons: { some: visible } } },
    },
    orderBy: { sortOrder: "asc" },
    include: { translations: true },
  });

  return subjects.map((subject) => ({
    id: subject.id,
    slug: subject.slug,
    name: pickName(subject.translations, subject.name, child.preferredLanguage),
    sortOrder: subject.sortOrder,
    iconAsset: null,
  }));
}

export async function listTopicsForChild(
  child: ChildProfile,
  subjectId: string,
): Promise<TopicSummary[]> {
  const visible = publishedForChild(child);

  // Resolved separately from the topic query so an unknown *or* invisible
  // subject 404s, rather than silently returning an empty list.
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, ...visible },
    select: { id: true },
  });
  if (!subject) {
    throw ApiError.notFound("Subject not found");
  }

  const topics = await prisma.topic.findMany({
    where: { subjectId: subject.id, ...visible, lessons: { some: visible } },
    orderBy: { sortOrder: "asc" },
    include: { translations: true },
  });

  return topics.map((topic) => toTopicSummary(topic, child.preferredLanguage));
}

function toTopicSummary(
  topic: {
    id: string;
    slug: string;
    name: string;
    sortOrder: number;
    translations?: { language: Lang; name: string }[];
  },
  language: Lang,
): TopicSummary {
  return {
    id: topic.id,
    slug: topic.slug,
    name: pickName(topic.translations, topic.name, language),
    sortOrder: topic.sortOrder,
  };
}

function toLessonListItem(
  lesson: {
    id: string;
    slug: string;
    title: string;
    worldId: string;
    sortOrder: number;
    translations?: { language: Lang; title: string }[];
  },
  language: Lang,
): LessonListItem {
  return {
    id: lesson.id,
    slug: lesson.slug,
    title:
      pickLocale(
        toLocaleMap(lesson.translations, (row) => row.title),
        language,
      ).value ?? lesson.title,
    worldId: lesson.worldId,
    sortOrder: lesson.sortOrder,
    thumbnailUrl: null,
    durationEstimateSec: null,
    nameAudioUrl: null,
    progress: null,
  };
}

export async function listLessonsForChild(
  child: ChildProfile,
  topicId: string,
): Promise<LessonListItem[]> {
  const visible = publishedForChild(child);

  const topic = await prisma.topic.findFirst({
    where: { id: topicId, ...visible },
    select: { id: true },
  });
  if (!topic) {
    throw ApiError.notFound("Topic not found");
  }

  const lessons = await prisma.lesson.findMany({
    // `world` is gated here as well as in `getLessonForChild` so the two agree:
    // a lesson the detail endpoint 404s must not appear as a tile that opens
    // onto nothing.
    where: { topicId: topic.id, ...visible, world: publishedRelation },
    orderBy: { sortOrder: "asc" },
    include: { translations: { select: { language: true, title: true } } },
  });

  return lessons.map((lesson) =>
    toLessonListItem(lesson, child.preferredLanguage),
  );
}

/**
 * FR-WORLD-01..03 — everything a child can do inside one world, grouped by the
 * topic each lesson sits under.
 */
export async function listWorldLessonsForChild(
  child: ChildProfile,
  worldId: string,
): Promise<WorldTopicLessons[]> {
  // Resolved separately so an unknown *or* unpublished world 404s rather than
  // silently answering with an empty list — same reasoning as `listTopicsForChild`.
  const world = await prisma.world.findFirst({
    where: { id: worldId, ...publishedOnly },
    select: { id: true },
  });
  if (!world) {
    throw ApiError.notFound("World not found");
  }

  const visible = publishedForChild(child);
  const lessons = await prisma.lesson.findMany({
    where: {
      worldId: world.id,
      ...visible,
      topic: {
        is: { ...visible, subject: publishedRelationForChild(child) },
      },
    },
    orderBy: [{ topic: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    include: {
      topic: { include: { translations: true } },
      translations: { select: { language: true, title: true } },
    },
  });

  // Grouped in insertion order, which the `orderBy` above already made
  // topic-then-lesson. A Map rather than a second query per topic: the topic rows
  // arrived with the lessons, and two topics sharing a `sortOrder` still come out
  // in a stable order this way.
  const byTopic = new Map<string, WorldTopicLessons>();
  for (const lesson of lessons) {
    let group = byTopic.get(lesson.topicId);
    if (group === undefined) {
      group = {
        ...toTopicSummary(lesson.topic, child.preferredLanguage),
        lessons: [],
      };
      byTopic.set(lesson.topicId, group);
    }
    group.lessons.push(toLessonListItem(lesson, child.preferredLanguage));
  }

  return [...byTopic.values()];
}

/** The full payload the lesson player needs in one round trip. */
export async function getLessonForChild(
  child: ChildProfile,
  lessonId: string,
  log: ContentLogger,
): Promise<LessonDetail> {
  const lesson = await findLessonRow({
    id: lessonId,
    ...publishedForChild(child),
    world: publishedRelation,
  });
  if (!lesson) {
    throw ApiError.notFound("Lesson not found");
  }
  return toLessonDetail(lesson, child.preferredLanguage, log, {
    isPreview: false,
  });
}

/**
 * The same payload with **no status gate at all**, for the admin preview
 * (FR-CMS-04).
 */
export async function getLessonForPreview(
  lessonId: string,
  language: Lang,
  log: ContentLogger,
): Promise<LessonDetail> {
  const lesson = await findLessonRow({ id: lessonId });
  if (!lesson) {
    throw ApiError.notFound("Lesson not found");
  }
  return toLessonDetail(lesson, language, log, { isPreview: true });
}

/**
 * The one lesson read both callers share, so the two cannot drift about which
 * relations a lesson payload is built from. Only the `where` differs.
 */
function findLessonRow(where: Prisma.LessonWhereInput) {
  return prisma.lesson.findFirst({
    where,
    include: {
      world: { include: { mascotAsset: true, translations: true } },
      translations: {
        include: {
          videoAsset: true,
          videoPosterAsset: true,
          introAudioAsset: true,
        },
      },
      activity: true,
      quiz: { include: { questions: { orderBy: { sortOrder: "asc" } } } },
    },
  });
}

type LessonRow = NonNullable<Awaited<ReturnType<typeof findLessonRow>>>;

/** Turns one lesson row into the payload the player renders. */
function toLessonDetail(
  lesson: LessonRow,
  language: Lang,
  log: ContentLogger,
  options: { isPreview: boolean },
): LessonDetail {
  const isVisible = (row: { status: ContentStatus } | null): boolean =>
    options.isPreview || isPublished(row);

  const title = pickLocale(
    toLocaleMap(lesson.translations, (row) => row.title),
    language,
  );
  const intro = pickLocale(
    toLocaleMap(lesson.translations, (row) => row.introScript),
    language,
  );
  const introAudio = pickLocale(
    toLocaleMap(lesson.translations, (row) => row.introAudioAsset?.url),
    language,
  );
  const video = pickLocale(
    toLocaleMap(lesson.translations, (row) => row.videoAsset?.url),
    language,
  );
  const videoPoster = pickLocale(
    toLocaleMap(lesson.translations, (row) => row.videoPosterAsset?.url),
    language,
  );

  // An unpublished activity or quiz is omitted, not served and not fatal: the
  // lesson's video and intro are published content in their own right, and a
  // lesson with neither attached is a shape the player already handles. The
  // pairing is an authoring mistake though, so it is logged with both ids.
  if (lesson.activity && !isVisible(lesson.activity)) {
    log.warn(
      { lessonId: lesson.id, activityId: lesson.activity.id },
      "published lesson references an unpublished activity — omitting it",
    );
  }
  if (lesson.quiz && !isVisible(lesson.quiz)) {
    log.warn(
      { lessonId: lesson.id, quizId: lesson.quiz.id },
      "published lesson references an unpublished quiz — omitting it",
    );
  }

  let activity: LessonDetail["activity"] = null;
  if (lesson.activity && isVisible(lesson.activity)) {
    const parsed = safeParseActivityDefinition(lesson.activity.definition);
    if (!parsed.success) {
      log.error(
        { activityId: lesson.activity.id, issues: parsed.error.issues },
        "corrupt published activity definition",
      );
      throw new ApiError(500, "INTERNAL", "Content unavailable");
    }
    assertDiscriminatorAgrees(
      { column: lesson.activity.type, payload: parsed.data.type },
      { activityId: lesson.activity.id },
      "activity",
      log,
    );
    activity = {
      id: lesson.activity.id,
      type: lesson.activity.type,
      schemaVersion: lesson.activity.schemaVersion,
      definition: lesson.activity.definition,
    };
  }

  let quiz: LessonDetail["quiz"] = null;
  if (lesson.quiz && isVisible(lesson.quiz)) {
    const questions = [];
    for (const question of lesson.quiz.questions) {
      const parsed = safeParseQuizQuestion(question.definition);
      if (!parsed.success) {
        log.error(
          { questionId: question.id, issues: parsed.error.issues },
          "corrupt published quiz question definition",
        );
        throw new ApiError(500, "INTERNAL", "Content unavailable");
      }
      assertDiscriminatorAgrees(
        { column: question.format, payload: parsed.data.type },
        { questionId: question.id },
        "quiz question",
        log,
      );
      questions.push({
        id: question.id,
        format: question.format,
        schemaVersion: question.schemaVersion,
        sortOrder: question.sortOrder,
        definition: question.definition,
      });
    }
    quiz = { id: lesson.quiz.id, title: lesson.quiz.title, questions };
  }

  return {
    id: lesson.id,
    slug: lesson.slug,
    title: title.value ?? lesson.title,
    worldId: lesson.worldId,
    world: toWorldSummary(lesson.world, language),
    locale: intro.locale,
    introScript: intro.value,
    introAudioUrl: introAudio.value,
    videoUrl: video.value,
    videoPosterUrl: videoPoster.value,
    assetFallbacks: {
      introAudioUrl: isSubstituted(introAudio, language),
      videoUrl: isSubstituted(video, language),
      videoPosterUrl: isSubstituted(videoPoster, language),
    },
    activity,
    quiz,
    progress: null,
  };
}
