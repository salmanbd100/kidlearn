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
 *
 * That includes **display names**. `World.name`, `Subject.name`, `Topic.name` and
 * `Lesson.title` are admin labels, not the strings a child reads — the child's come
 * from the matching `*Translation` row via `pickName` below. Reading the column
 * directly is the bug this file used to have: a Bangla learner heard Bangla
 * narration inside a lesson whose tile, topic, subject and world were all named in
 * English, while the response contract claimed every string was already resolved.
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
 *
 * `pickLocale` reports `FALLBACK_LANG` for a value it never found, so the value
 * has to be checked as well as the locale: a lesson with no video at all is a
 * missing recording, not a missing *translation*, and counting it as a fallback
 * would tell the content report to translate something that does not exist.
 */
function isSubstituted(pick: LocalePick<string>, requested: Lang): boolean {
  return pick.value !== null && pick.locale !== requested;
}

/**
 * A payload's own `type` literal must agree with the enum column beside it.
 *
 * `Activity.type` / `QuizQuestion.format` are columns; the JSONB payload repeats
 * the same fact as a Zod literal. Two sources of truth for one decision, and the
 * response carries both — so the engines in files 18–22 can pick a renderer from
 * the column while the payload they hand it is a different shape entirely. Zod
 * cannot catch that: a `match` payload under `type: "drag_drop"` parses perfectly
 * well as a `match` payload.
 *
 * Treated exactly like corrupt JSONB, and for the same reason: on a *published*
 * row it is a server-side authoring failure, not something the child's request
 * did wrong, so it is logged with the offending id and answered with a 500 that
 * carries no part of the payload. Fail closed — serving the row and letting the
 * client guess which of the two to believe is how a three-year-old ends up
 * looking at a tracing canvas with jigsaw pieces in it.
 */
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

/**
 * The child-facing name of a curriculum row, in their language.
 *
 * Resolution order is `preferredLanguage → en → the row's own label`. That last
 * step is not a nicety: it keeps content authored before a translation existed
 * servable instead of nameless, and it means adding a locale is a data change
 * rather than a migration that has to backfill every row first. A missing
 * translation is a content gap to report, never a blank tile.
 */
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
 *
 * Takes the `ChildProfile` purely for `preferredLanguage`: the world names are
 * child-facing text, so they are resolved per locale like everything else here.
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
 *
 * Only reachable through `middleware/admin-lesson-preview.ts`, which resolves an
 * `AdminUser` row from the session before it calls this — the `?preview=1` query
 * parameter requests the mode and never grants it. Nothing on the student path can
 * reach this function.
 *
 * Three differences from the child version, all of them the point of a preview:
 *
 *  - **No `status` and no `gradeLevels` filter**, so a draft lesson in a draft
 *    world tagged for another grade renders.
 *  - **Unpublished activities and quizzes are included** rather than omitted. A
 *    reviewer looking at a lesson whose activity is still in review needs to see
 *    the activity — that is what they are reviewing.
 *  - **The locale is a parameter**, because there is no child row to read one
 *    from. An admin previews each language deliberately.
 *
 * Corrupt JSONB is still a `500`: the editors validate a definition against the
 * shared schema on save, so a payload that cannot be parsed is a real fault worth
 * surfacing rather than hiding behind an empty step.
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

/**
 * Turns one lesson row into the payload the player renders.
 *
 * `isPreview` changes exactly one thing: whether the nullable `activity` and
 * `quiz` edges are gated on their own `status`. Everything else — locale
 * resolution, fallback reporting, the discriminator check, the corrupt-JSONB `500`
 * — is identical, which is what makes the preview a preview rather than a second
 * renderer that can disagree with the real one.
 */
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
