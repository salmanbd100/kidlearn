import type {
  ChildProfile,
  ContentStatus,
  MediaAsset,
  Prisma,
} from "@kidlearn/db";
import {
  type ActivityDefinition,
  type LessonAssetFallbacks,
  type Locale,
  type LocalePick,
  pickLocale,
  type QuizQuestionDefinition,
  readActivityDefinition,
  readQuizQuestion,
  toLocaleMap,
} from "@kidlearn/types";
import { prisma } from "../../config/prisma.js";
import { ApiError } from "../../shared/errors/errors.js";
import {
  isPublished,
  publishedForChild,
  publishedOnly,
  visibleLessonWhere,
} from "../../shared/utils/published-for-child.js";

// Structural, so the service is callable without an HTTP request.
export type ContentLogger = {
  error: (context: Record<string, unknown>, message: string) => void;
  warn: (context: Record<string, unknown>, message: string) => void;
};

export type MediaSummary = {
  id: string;
  url: string;
  kind: MediaAsset["kind"];
};

export type WorldSummary = {
  id: string;
  slug: string;
  name: string;
  palette: Prisma.JsonValue;
  mascot: MediaSummary | null;
};

export type SubjectSummary = {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
  /** Reserved: always `null`, so adding a `Subject.iconAsset` column later is not breaking. */
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
   * Reserved, always `null`: `thumbnailUrl`, `durationEstimateSec` (no such
   * `Lesson` columns), `nameAudioUrl` (awaits the voice pipeline) and `progress`
   * (owned by `GET /api/progress/lessons/:id`, so tile and resume point cannot disagree).
   */
  thumbnailUrl: string | null;
  durationEstimateSec: number | null;
  nameAudioUrl: string | null;
  progress: null;
};

export type WorldTopicLessons = TopicSummary & { lessons: LessonListItem[] };

export type LessonDetail = {
  id: string;
  slug: string;
  title: string;
  worldId: string;
  world: WorldSummary;
  locale: Locale;
  introScript: string | null;
  introAudioUrl: string | null;
  videoUrl: string | null;
  videoPosterUrl: string | null;
  assetFallbacks: LessonAssetFallbacks;
  activity: {
    id: string;
    type: string;
    schemaVersion: number;
    definition: ActivityDefinition;
  } | null;
  quiz: {
    id: string;
    title: string | null;
    questions: Array<{
      id: string;
      format: string;
      schemaVersion: number;
      sortOrder: number;
      definition: QuizQuestionDefinition;
    }>;
  } | null;
  progress: null;
};

function isSubstituted(pick: LocalePick<string>, requested: Locale): boolean {
  return pick.value !== null && pick.locale !== requested;
}

function discriminatorAgrees(
  discriminator: { column: string; payload: string },
  ids: Record<string, string>,
  label: string,
  log: ContentLogger,
): boolean {
  if (discriminator.column === discriminator.payload) return true;

  log.error(
    { ...ids, column: discriminator.column, payload: discriminator.payload },
    `published ${label} column disagrees with its definition type — omitting it`,
  );
  return false;
}

function pickName(
  translations: readonly { language: Locale; name: string }[] | undefined,
  fallbackLabel: string,
  language: Locale,
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
    translations?: { language: Locale; name: string }[];
  },
  language: Locale,
): WorldSummary {
  return {
    id: world.id,
    slug: world.slug,
    name: pickName(world.translations, world.name, language),
    palette: world.palette,
    mascot: toMediaSummary(world.mascotAsset),
  };
}

// Worlds carry no grade tagging, so only the status gate applies.
export async function listWorlds(child: ChildProfile): Promise<WorldSummary[]> {
  const worlds = await prisma.world.findMany({
    where: publishedOnly,
    orderBy: { slug: "asc" },
    include: { mascotAsset: true, translations: true },
  });
  return worlds.map((world) => toWorldSummary(world, child.preferredLanguage));
}

// The `topics.some.lessons.some` check keeps a dead tile off the home screen when every lesson is still draft.
export async function listSubjectsForChild(
  child: ChildProfile,
): Promise<SubjectSummary[]> {
  const visible = publishedForChild(child);
  const subjects = await prisma.subject.findMany({
    where: {
      ...visible,
      topics: { some: { ...visible, lessons: { some: visible } } },
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
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

  // Resolved separately so an unknown *or* invisible subject 404s instead of returning an empty list.
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, ...visible },
    select: { id: true },
  });
  if (!subject) {
    throw ApiError.notFound("Subject not found");
  }

  const topics = await prisma.topic.findMany({
    where: { subjectId: subject.id, ...visible, lessons: { some: visible } },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
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
    translations?: { language: Locale; name: string }[];
  },
  language: Locale,
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
    translations?: { language: Locale; title: string }[];
  },
  language: Locale,
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
    // Same `visibleLessonWhere` as the detail endpoint, so a lesson it 404s never appears as a tile that opens onto nothing.
    where: { topicId: topic.id, ...visibleLessonWhere(child) },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: { translations: { select: { language: true, title: true } } },
  });

  return lessons.map((lesson) =>
    toLessonListItem(lesson, child.preferredLanguage),
  );
}

export async function listWorldLessonsForChild(
  child: ChildProfile,
  worldId: string,
): Promise<WorldTopicLessons[]> {
  // Resolved separately so an unknown *or* unpublished world 404s, as in `listTopicsForChild`.
  const world = await prisma.world.findFirst({
    where: { id: worldId, ...publishedOnly },
    select: { id: true },
  });
  if (!world) {
    throw ApiError.notFound("World not found");
  }

  const lessons = await prisma.lesson.findMany({
    where: { worldId: world.id, ...visibleLessonWhere(child) },
    orderBy: [
      { topic: { sortOrder: "asc" } },
      { topic: { id: "asc" } },
      { sortOrder: "asc" },
      { id: "asc" },
    ],
    include: {
      topic: { include: { translations: true } },
      translations: { select: { language: true, title: true } },
    },
  });

  // Insertion order is already topic-then-lesson from the `orderBy`; a Map avoids
  // a query per topic and keeps equal-`sortOrder` topics stable.
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

export async function getLessonForChild(
  child: ChildProfile,
  lessonId: string,
  log: ContentLogger,
): Promise<LessonDetail> {
  const lesson = await findLessonRow({
    id: lessonId,
    ...visibleLessonWhere(child),
  });
  if (!lesson) {
    throw ApiError.notFound("Lesson not found");
  }
  return toLessonDetail(lesson, child.preferredLanguage, log, {
    isPreview: false,
  });
}

// No status gate at all: the admin preview (FR-CMS-04).
export async function getLessonForPreview(
  lessonId: string,
  language: Locale,
  log: ContentLogger,
): Promise<LessonDetail> {
  const lesson = await findLessonRow({ id: lessonId });
  if (!lesson) {
    throw ApiError.notFound("Lesson not found");
  }
  return toLessonDetail(lesson, language, log, { isPreview: true });
}

// The one lesson read both callers share, so they cannot drift on which relations are built; only the `where` differs.
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

function toLessonDetail(
  lesson: LessonRow,
  language: Locale,
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

  // An unpublished activity or quiz is omitted, not served and not fatal; the
  // pairing is an authoring mistake, so it is logged with both ids.
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

  // A payload that fails to parse or disagrees with its column is one step's
  // content bug: log and omit it so the rest still plays (a 500 would block the
  // lesson). Served is the *read* payload (migrated, unknown keys dropped) so a
  // row a newer deploy wrote still plays after a rollback.
  let activity: LessonDetail["activity"] = null;
  if (lesson.activity && isVisible(lesson.activity)) {
    const parsed = readActivityDefinition(lesson.activity.definition);
    if (!parsed.success) {
      log.error(
        { activityId: lesson.activity.id, issues: parsed.error.issues },
        "corrupt published activity definition — omitting it",
      );
    } else if (
      discriminatorAgrees(
        { column: lesson.activity.type, payload: parsed.data.type },
        { activityId: lesson.activity.id },
        "activity",
        log,
      )
    ) {
      activity = {
        id: lesson.activity.id,
        type: lesson.activity.type,
        schemaVersion: parsed.data.schemaVersion,
        definition: parsed.data,
      };
    }
  }

  let quiz: LessonDetail["quiz"] = null;
  if (lesson.quiz && isVisible(lesson.quiz)) {
    const questions = [];
    for (const question of lesson.quiz.questions) {
      const parsed = readQuizQuestion(question.definition);
      if (!parsed.success) {
        log.error(
          { questionId: question.id, issues: parsed.error.issues },
          "corrupt published quiz question definition — omitting it",
        );
        continue;
      }
      if (
        !discriminatorAgrees(
          { column: question.format, payload: parsed.data.type },
          { questionId: question.id },
          "quiz question",
          log,
        )
      ) {
        continue;
      }
      questions.push({
        id: question.id,
        format: question.format,
        schemaVersion: parsed.data.schemaVersion,
        sortOrder: question.sortOrder,
        definition: parsed.data,
      });
    }
    // A quiz with every question omitted is no quiz: the player skips a null one, where an empty one would congratulate for nothing.
    if (questions.length > 0) {
      quiz = { id: lesson.quiz.id, title: lesson.quiz.title, questions };
    }
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
