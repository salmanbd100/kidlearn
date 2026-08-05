import type { ChildProfile, MediaAsset, Prisma } from "@kidlearn/db";
import {
  safeParseActivityDefinition,
  safeParseQuizQuestion,
} from "@kidlearn/types";
import { ApiError } from "../lib/errors.js";
import { type Lang, pickLocale, toLocaleMap } from "../lib/locale.js";
import { prisma } from "../lib/prisma.js";
import {
  publishedForChild,
  publishedOnly,
} from "../lib/published-for-child.js";

/**
 * Student-facing curriculum reads (FR-CURR-01..02, FR-WORLD-01..05, spec §7.3.4).
 *
 * Two invariants hold for every function in this file:
 *
 *  1. Visibility comes from `lib/published-for-child.ts` and nowhere else. No
 *     `status` or `gradeLevels` condition is written inline here.
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
   * Reserved contract fields, all three explicitly `null`:
   *  - `thumbnailUrl` / `durationEstimateSec` — the implementation spec asked
   *    for them but the settled `Lesson` model has neither column.
   *  - `progress` — file 16 joins `LessonProgress` per child here.
   */
  thumbnailUrl: string | null;
  durationEstimateSec: number | null;
  progress: null;
};

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
    where: { topicId: topic.id, ...visible },
    orderBy: { sortOrder: "asc" },
  });

  return lessons.map((lesson) => ({
    id: lesson.id,
    slug: lesson.slug,
    title: lesson.title,
    worldId: lesson.worldId,
    sortOrder: lesson.sortOrder,
    thumbnailUrl: null,
    durationEstimateSec: null,
    progress: null,
  }));
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
 */
export async function getLessonForChild(
  child: ChildProfile,
  lessonId: string,
  log: ContentLogger,
): Promise<LessonDetail> {
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, ...publishedForChild(child) },
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

  let activity: LessonDetail["activity"] = null;
  if (lesson.activity) {
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
  if (lesson.quiz) {
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
