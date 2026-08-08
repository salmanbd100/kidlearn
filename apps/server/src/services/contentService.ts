import type { ChildProfile, MediaAsset, Prisma } from "@kidlearn/db";
import {
  safeParseActivityDefinition,
  safeParseQuizQuestion,
} from "@kidlearn/types";
import { ApiError } from "../lib/errors.js";
import { type Lang, pickLocale, toLocaleMap } from "../lib/locale.js";
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
 *
 * Two invariants hold for every function in this file:
 *
 *  1. Visibility comes from `lib/published-for-child.ts` and nowhere else. No
 *     `status` or `gradeLevels` condition is written inline here. That covers
 *     related rows as well as queried ones: `Activity`, `Quiz` and `World` each
 *     carry their own `status`, so a *published* lesson can still point at
 *     unreviewed content, and every one of those edges is gated below.
 *  2. Grade and language come from the `ChildProfile` row the caller passes in —
 *     resolved server-side by `requireActiveChild` — never from request input
 *     (FR-PROF-03).
 *
 * Responses carry single-locale resolved values plus the `locale` that supplied
 * them. The one exception is activity/quiz `definition` JSONB, which is passed
 * through whole: those payloads embed `LocalizedText` and the engines in files
 * 18–22 do their own locale picking via `@kidlearn/types`.
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
   *  - `progress` — file 16 joins `LessonProgress` per child here.
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
  },
): WorldSummary {
  return {
    id: world.id,
    slug: world.slug,
    name: world.name,
    palette: world.palette,
    mascot: toMediaSummary(world.mascotAsset),
  };
}

/**
 * FR-WORLD-01..03, FR-WORLD-05 — the themed worlds the home screen renders.
 * Worlds carry no grade tagging of their own, so only the status gate applies.
 */
export async function listWorlds(): Promise<WorldSummary[]> {
  const worlds = await prisma.world.findMany({
    where: publishedOnly,
    orderBy: { slug: "asc" },
    include: { mascotAsset: true },
  });
  return worlds.map(toWorldSummary);
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
  });

  return subjects.map((subject) => ({
    id: subject.id,
    slug: subject.slug,
    name: subject.name,
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
  });

  return topics.map((topic) => ({
    id: topic.id,
    slug: topic.slug,
    name: topic.name,
    sortOrder: topic.sortOrder,
  }));
}

function toLessonListItem(lesson: {
  id: string;
  slug: string;
  title: string;
  worldId: string;
  sortOrder: number;
}): LessonListItem {
  return {
    id: lesson.id,
    slug: lesson.slug,
    title: lesson.title,
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
  });

  return lessons.map(toLessonListItem);
}

/**
 * FR-WORLD-01..03 — everything a child can do inside one world, grouped by the
 * topic each lesson sits under.
 *
 * This is the world screen's only request. `World` and `Topic` are orthogonal in
 * the settled schema — a lesson has one topic (its curriculum position) and one
 * world (its setting) — so navigating by world means crossing the subject tree
 * sideways. Doing that here rather than in the client is what keeps the grade and
 * status filter server-side (FR-PROF-03): a client walking
 * `/subjects → /topics → /lessons` and keeping the rows whose `worldId` matched
 * would be deciding visibility for itself.
 *
 * Three status gates apply, not one. The lesson's own, its topic's, and its
 * subject's — a lesson tagged for this child can still hang off a topic that is
 * tagged for another grade, or under a subject still in draft, and in both cases
 * its curriculum position says it is not for this child. The world itself needs
 * no lesson-level gate here because an unpublished world 404s before any lesson
 * is read.
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
    include: { topic: true },
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
        id: lesson.topic.id,
        slug: lesson.topic.slug,
        name: lesson.topic.name,
        sortOrder: lesson.topic.sortOrder,
        lessons: [],
      };
      byTopic.set(lesson.topicId, group);
    }
    group.lessons.push(toLessonListItem(lesson));
  }

  return [...byTopic.values()];
}

/**
 * The full payload the lesson player needs in one round trip.
 *
 * A lesson that is not published, or not tagged for this child's grade, returns
 * **404, not 403** — a 403 would confirm the row exists, which is exactly the
 * information a probe is after.
 *
 * Corrupt JSONB on a *published* row is a server bug, not a client error: it is
 * logged with the offending id and answered with a 500 that carries no part of
 * the payload.
 *
 * `Lesson.status` is not the whole guard. The world, activity and quiz a lesson
 * points at each carry their own `status`, and the publishing workflow routinely
 * produces a published lesson whose activity is still in review. Those three
 * edges are gated separately below — the world in the `where` (a lesson in an
 * unpublished world does not exist as far as a child is concerned), the two
 * nullable ones after the read.
 */
export async function getLessonForChild(
  child: ChildProfile,
  lessonId: string,
  log: ContentLogger,
): Promise<LessonDetail> {
  const lesson = await prisma.lesson.findFirst({
    where: {
      id: lessonId,
      ...publishedForChild(child),
      world: publishedRelation,
    },
    include: {
      world: { include: { mascotAsset: true } },
      translations: { include: { videoAsset: true, introAudioAsset: true } },
      activity: true,
      quiz: { include: { questions: { orderBy: { sortOrder: "asc" } } } },
    },
  });
  if (!lesson) {
    throw ApiError.notFound("Lesson not found");
  }

  const language = child.preferredLanguage;
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

  // An unpublished activity or quiz is omitted, not served and not fatal: the
  // lesson's video and intro are published content in their own right, and a
  // lesson with neither attached is a shape the player already handles. The
  // pairing is an authoring mistake though, so it is logged with both ids.
  if (lesson.activity && !isPublished(lesson.activity)) {
    log.warn(
      { lessonId: lesson.id, activityId: lesson.activity.id },
      "published lesson references an unpublished activity — omitting it",
    );
  }
  if (lesson.quiz && !isPublished(lesson.quiz)) {
    log.warn(
      { lessonId: lesson.id, quizId: lesson.quiz.id },
      "published lesson references an unpublished quiz — omitting it",
    );
  }

  let activity: LessonDetail["activity"] = null;
  if (lesson.activity && isPublished(lesson.activity)) {
    const parsed = safeParseActivityDefinition(lesson.activity.definition);
    if (!parsed.success) {
      log.error(
        { activityId: lesson.activity.id, issues: parsed.error.issues },
        "corrupt published activity definition",
      );
      throw new ApiError(500, "INTERNAL", "Content unavailable");
    }
    activity = {
      id: lesson.activity.id,
      type: lesson.activity.type,
      schemaVersion: lesson.activity.schemaVersion,
      definition: lesson.activity.definition,
    };
  }

  let quiz: LessonDetail["quiz"] = null;
  if (lesson.quiz && isPublished(lesson.quiz)) {
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
    title: lesson.title,
    worldId: lesson.worldId,
    world: toWorldSummary(lesson.world),
    locale: intro.locale,
    introScript: intro.value,
    introAudioUrl: introAudio.value,
    videoUrl: video.value,
    activity,
    quiz,
    progress: null,
  };
}
