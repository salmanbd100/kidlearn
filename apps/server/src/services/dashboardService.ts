import type { ChildProfile } from "@kidlearn/db";
import {
  type DashboardActivityItem,
  type DashboardData,
  type DashboardSubjectProgress,
  type LocalizedLabel,
  RECENT_ACTIVITY_LIMIT,
} from "@kidlearn/types";
import { type Lang, toLocaleMap } from "../lib/locale.js";
import { prisma } from "../lib/prisma.js";
import {
  publishedForChild,
  publishedOnly,
  publishedRelation,
  publishedRelationForChild,
} from "../lib/published-for-child.js";
import { getLearningMinutes } from "./learningTimeService.js";
import type { GrantSource } from "./rewardService.js";

/**
 * The parent dashboard, in one read (FR-DASH-01..04).
 *
 * Three invariants, each of which is the reason a figure here can be trusted:
 *
 *  1. **Minutes are never recomputed.** All three windows come from
 *     `getLearningMinutes`, the same function the screen-time limit checks and
 *     `GET /api/children/{id}/learning-time` answers from. A second density
 *     implementation would be a second answer to "how long has my child been on
 *     this today", and a dashboard disagreeing with the limit that blocked a
 *     lesson is worse than either number.
 *  2. **Visibility comes from `lib/published-for-child.ts` and nowhere else**
 *     (`backend.md §4`). This is a parent-facing screen, but it renders the titles
 *     of lessons, stories and badges — so unreviewed content must not reach it
 *     either, and the guard is the same one the student surfaces use: status,
 *     grade where a fraction depends on it, and **the world**, which
 *     `contentService`, `lessonProgressService` and `storyService` all gate on
 *     because `World.status` defaults to `draft` and takes its content down with
 *     it.
 *  3. **The arithmetic is pure.** `computeSubjectProgress` and `mergeActivity`
 *     take plain arrays, so every rule below — rounding, the omission of empty
 *     subjects, the suppression of highlight chips, the merge order — is one
 *     assertion in `dashboardService.test.ts` rather than a database fixture.
 *
 * ## Where the two visibility gates deliberately differ
 *
 * The progress figures are gated on **status and grade**: `completed` and `total`
 * are two halves of one fraction, so they must be counted over the same set of
 * lessons or the percentage means nothing (FR-DASH-03).
 *
 * The activity feed is gated on **status and world, but not grade**. A child
 * promoted from Nursery to KG-1 keeps their history, which a grade filter would
 * erase from the feed on the day their profile changed — a parent watching a month
 * of work vanish because they corrected an age. The world still applies: it is not
 * a curriculum position but a review state, and an unreviewed world's titles are
 * no more the parent's to read than the child's.
 */

/** The story-completion ledger rows, named through the closed grant union. */
const STORY_COMPLETION: GrantSource = "story_completion";

/**
 * How many ledger rows to read for a feed capped at `RECENT_ACTIVITY_LIMIT`.
 *
 * Wider than the cap because a badge row is filtered by the query but a story row
 * is not: `RewardLedger.sourceId` is a bare string with no relation to `Story`, so
 * a withdrawn story is only discovered when its title fails to resolve — after the
 * window has closed. Capping before that drop is what made a 20-entry feed return
 * 19, and silently omitted the 21st-newest story that should have taken the slot.
 *
 * The residual bound, stated rather than hidden: a child with more than
 * `LEDGER_FEED_WINDOW - RECENT_ACTIVITY_LIMIT` withdrawn story completions among
 * their newest rows can still see a short feed. Closing that entirely would mean
 * reading the published story ids before this query instead of alongside it — a
 * third sequential round trip on every dashboard load, to fix a state that needs
 * the story catalogue to have been largely un-published.
 */
const LEDGER_FEED_WINDOW = RECENT_ACTIVITY_LIMIT * 2;

export interface SubjectRef {
  id: string;
  slug: string;
  /** The admin label — the fallback when no translation row exists at all. */
  name: string;
  sortOrder: number;
  translations: readonly { language: Lang; name: string }[];
}

/** One topic and the subject it hangs off. `Lesson` carries no `subjectId`. */
export interface TopicSubjectLink {
  topicId: string;
  subject: SubjectRef;
}

export interface SubjectProgressResult {
  subjects: DashboardSubjectProgress[];
  strongestSubjectId: string | null;
  weakestSubjectId: string | null;
}

/**
 * Per-subject completion, plus the two subjects worth naming (FR-DASH-03).
 *
 * Lessons are counted per topic because that is the only grouping Prisma can do
 * in one query — `Lesson` has a `topicId` and no `subjectId` — so the topic→subject
 * mapping is applied here.
 *
 * **A subject with no lessons for this grade is omitted, not shown at 0%.** An
 * empty curriculum is not a child's failure, and `percent` is a real fraction at
 * every point in this function as a result: there is no division by zero to guard.
 *
 * **The highlight chips are suppressed unless the extremes actually differ.** The
 * spec asks for that when every percentage is zero and when fewer than two
 * subjects have lessons; `max === min` is the one condition that covers both, and
 * it also covers the case they did not name — two subjects sitting at the same
 * non-zero percentage, where calling one "strongest" and the other "needs
 * practice" invents a difference the data does not contain.
 */
export function computeSubjectProgress(
  topics: readonly TopicSubjectLink[],
  totalsByTopic: readonly { topicId: string; total: number }[],
  completedTopicIds: readonly string[],
): SubjectProgressResult {
  const subjectOfTopic = new Map<string, SubjectRef>();
  for (const { topicId, subject } of topics) {
    subjectOfTopic.set(topicId, subject);
  }

  const tallies = new Map<
    string,
    { subject: SubjectRef; total: number; completed: number }
  >();

  const tallyFor = (topicId: string) => {
    const subject = subjectOfTopic.get(topicId);
    // A topic outside the visible set: its lessons were already excluded from
    // both counts, so there is nothing to tally against.
    if (subject === undefined) return undefined;

    let tally = tallies.get(subject.id);
    if (tally === undefined) {
      tally = { subject, total: 0, completed: 0 };
      tallies.set(subject.id, tally);
    }
    return tally;
  };

  for (const { topicId, total } of totalsByTopic) {
    const tally = tallyFor(topicId);
    if (tally !== undefined) tally.total += total;
  }

  for (const topicId of completedTopicIds) {
    const tally = tallyFor(topicId);
    if (tally !== undefined) tally.completed += 1;
  }

  const subjects: DashboardSubjectProgress[] = [...tallies.values()]
    .filter((tally) => tally.total > 0)
    .map((tally) => ({
      sortOrder: tally.subject.sortOrder,
      progress: {
        subjectId: tally.subject.id,
        slug: tally.subject.slug,
        name: toLocalizedLabel(
          tally.subject.translations,
          tally.subject.name,
          (row) => row.name,
        ),
        completed: tally.completed,
        total: tally.total,
        percent: Math.round((100 * tally.completed) / tally.total),
      },
    }))
    // Strongest first, so the bars read as a ranking. `sortOrder` breaks a tie
    // rather than the map's insertion order, which no caller can predict.
    .sort(
      (a, b) =>
        b.progress.percent - a.progress.percent || a.sortOrder - b.sortOrder,
    )
    .map((entry) => entry.progress);

  if (subjects.length === 0) {
    return { subjects, strongestSubjectId: null, weakestSubjectId: null };
  }

  const percents = subjects.map((subject) => subject.percent);
  const highest = Math.max(...percents);
  const lowest = Math.min(...percents);

  if (highest === lowest) {
    return { subjects, strongestSubjectId: null, weakestSubjectId: null };
  }

  // Sorted percent-desc with `sortOrder` as the tie-break, so for either
  // extreme the *first* match is the one the tie-break rule picks: every subject
  // sharing that percentage is adjacent, in `sortOrder` order.
  const strongest = subjects.find((subject) => subject.percent === highest);
  const weakest = subjects.find((subject) => subject.percent === lowest);

  return {
    subjects,
    strongestSubjectId: strongest?.subjectId ?? null,
    weakestSubjectId: weakest?.subjectId ?? null,
  };
}

export interface LessonActivityRow {
  lessonId: string;
  completedAt: Date;
  title: string;
  translations: readonly { language: Lang; title: string }[];
}

export interface StoryActivityRow {
  storyId: string;
  completedAt: Date;
  title: string;
  translations: readonly { language: Lang; title: string }[];
}

export interface BadgeActivityRow {
  badgeId: string;
  earnedAt: Date;
  name: string;
}

/**
 * The three histories as one feed, newest first, capped (FR-DASH-04).
 *
 * Merged in JS rather than in SQL: three indexed queries of twenty rows each is
 * cheaper at MVP scale than a `UNION` Prisma cannot express, and the ordering rule
 * stays testable without a database.
 *
 * Ties are broken by type and then by `refId`. Two completions can share a
 * timestamp to the millisecond — a lesson whose reward row was written in the same
 * transaction, most obviously — and a feed whose order changed between two reads
 * of the same data would make the newest entry jump around on refresh.
 */
export function mergeActivity(
  lessons: readonly LessonActivityRow[],
  stories: readonly StoryActivityRow[],
  badges: readonly BadgeActivityRow[],
): DashboardActivityItem[] {
  const items: DashboardActivityItem[] = [
    ...lessons.map((lesson) => ({
      type: "lesson_completed" as const,
      refId: lesson.lessonId,
      title: toLocalizedLabel(
        lesson.translations,
        lesson.title,
        (row) => row.title,
      ),
      occurredAt: lesson.completedAt.toISOString(),
    })),
    ...stories.map((story) => ({
      type: "story_completed" as const,
      refId: story.storyId,
      title: toLocalizedLabel(
        story.translations,
        story.title,
        (row) => row.title,
      ),
      occurredAt: story.completedAt.toISOString(),
    })),
    ...badges.map((badge) => ({
      type: "badge_earned" as const,
      refId: badge.badgeId,
      // `Badge` has no translation table — the name is the admin label in both
      // locales until one exists, rather than a `bn` the client would render as
      // English while claiming it was Bangla.
      title: { en: badge.name, bn: null },
      occurredAt: badge.earnedAt.toISOString(),
    })),
  ];

  return items
    .sort(
      (a, b) =>
        b.occurredAt.localeCompare(a.occurredAt) ||
        a.type.localeCompare(b.type) ||
        a.refId.localeCompare(b.refId),
    )
    .slice(0, RECENT_ACTIVITY_LIMIT);
}

/**
 * Both locales of a display string, from the row's translations.
 *
 * `en` falls back to the admin label because every response contract in this API
 * guarantees an English string; `bn` falls back to `null` rather than to English,
 * so the client shows English *knowingly* instead of being handed English under a
 * Bangla key (`lib/locale.ts`).
 */
function toLocalizedLabel<TRow extends { language: Lang }>(
  translations: readonly TRow[] | undefined,
  fallback: string,
  select: (row: TRow) => string | null | undefined,
): LocalizedLabel {
  const map = toLocaleMap(translations, select);
  return { en: map.en ?? fallback, bn: map.bn ?? null };
}

/**
 * FR-DASH-01 — one call, everything the `/parent` screen renders.
 *
 * Takes the `ChildProfile` rather than an id because `loadOwnedChild` has already
 * fetched it, and because the grade the progress figures are counted over must come
 * from that row and never from request input (FR-PROF-03).
 */
export async function getDashboardSummary(
  child: ChildProfile,
): Promise<DashboardData> {
  const visible = publishedForChild(child);
  /**
   * A lesson is visible only if its world, its topic and that topic's subject
   * are too.
   *
   * `world` is not optional decoration here: `World.status` defaults to `draft`,
   * `Lesson.worldId` is required, and `requireVisibleLessonId` gates on it — so a
   * lesson in an unreviewed world is one the child cannot open. Counting it in
   * `total` while it can never reach `completed` caps the subject bar below 100%
   * for as long as the world stays unpublished.
   */
  const visibleLesson = {
    ...visible,
    world: publishedRelation,
    topic: { is: { ...visible, subject: publishedRelationForChild(child) } },
  };
  /** The feed's gate: status and world, deliberately no grade (see the header). */
  const publishedLesson = {
    is: { ...publishedOnly, world: publishedRelation },
  };

  const [
    minutesToday,
    minutesWeek,
    minutesMonth,
    totalsByTopic,
    topics,
    completedForProgress,
    lessonFeed,
    ledgerFeed,
  ] = await Promise.all([
    getLearningMinutes(child.id, "today"),
    getLearningMinutes(child.id, "week"),
    getLearningMinutes(child.id, "month"),

    prisma.lesson.groupBy({
      by: ["topicId"],
      where: visibleLesson,
      _count: { _all: true },
    }),

    prisma.topic.findMany({
      where: { ...visible, subject: publishedRelationForChild(child) },
      select: {
        id: true,
        subject: {
          select: {
            id: true,
            slug: true,
            name: true,
            sortOrder: true,
            translations: { select: { language: true, name: true } },
          },
        },
      },
    }),

    prisma.lessonProgress.findMany({
      where: {
        childId: child.id,
        completedAt: { not: null },
        lesson: { is: visibleLesson },
      },
      select: { lesson: { select: { topicId: true } } },
    }),

    prisma.lessonProgress.findMany({
      where: {
        childId: child.id,
        completedAt: { not: null },
        // Status and world, no grade: see the header note on why the feed
        // outlives a grade change while the progress fraction does not.
        lesson: publishedLesson,
      },
      orderBy: { completedAt: "desc" },
      take: RECENT_ACTIVITY_LIMIT,
      select: {
        lessonId: true,
        completedAt: true,
        lesson: {
          select: {
            title: true,
            translations: { select: { language: true, title: true } },
          },
        },
      },
    }),

    prisma.rewardLedger.findMany({
      where: {
        childId: child.id,
        OR: [
          { rewardType: "badge", badge: publishedRelation },
          // A story completion writes a star row *and* a coin row, so one
          // `rewardType` is what keeps a finished story out of the feed twice.
          { rewardType: "star", sourceType: STORY_COMPLETION },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: LEDGER_FEED_WINDOW,
      select: {
        rewardType: true,
        sourceId: true,
        createdAt: true,
        badge: { select: { id: true, name: true } },
      },
    }),
  ]);

  const storyRows = ledgerFeed.filter(
    (row): row is typeof row & { sourceId: string } =>
      row.rewardType === "star" && row.sourceId !== null,
  );

  const storyTitles =
    storyRows.length === 0
      ? []
      : await prisma.story.findMany({
          where: {
            id: { in: storyRows.map((row) => row.sourceId) },
            ...publishedOnly,
            world: publishedRelation,
          },
          select: {
            id: true,
            title: true,
            translations: { select: { language: true, title: true } },
          },
        });

  const storiesById = new Map(storyTitles.map((story) => [story.id, story]));

  const stories: StoryActivityRow[] = storyRows.flatMap((row) => {
    const story = storiesById.get(row.sourceId);
    // An unpublished story keeps its ledger row — the child earned those stars —
    // but its title is unreviewed content, so the entry is dropped rather than
    // rendered without one.
    if (story === undefined) return [];
    return [
      {
        storyId: story.id,
        completedAt: row.createdAt,
        title: story.title,
        translations: story.translations,
      },
    ];
  });

  const badges: BadgeActivityRow[] = ledgerFeed.flatMap((row) =>
    row.rewardType === "badge" && row.badge !== null
      ? [
          {
            badgeId: row.badge.id,
            earnedAt: row.createdAt,
            name: row.badge.name,
          },
        ]
      : [],
  );

  const { subjects, strongestSubjectId, weakestSubjectId } =
    computeSubjectProgress(
      topics.map((topic) => ({ topicId: topic.id, subject: topic.subject })),
      totalsByTopic.map((group) => ({
        topicId: group.topicId,
        total: group._count._all,
      })),
      completedForProgress.map((row) => row.lesson.topicId),
    );

  return {
    learningMinutes: {
      today: minutesToday.minutes,
      week: minutesWeek.minutes,
      month: minutesMonth.minutes,
    },
    subjects,
    strongestSubjectId,
    weakestSubjectId,
    recentActivity: mergeActivity(
      lessonFeed.flatMap((row) =>
        row.completedAt === null
          ? []
          : [
              {
                lessonId: row.lessonId,
                completedAt: row.completedAt,
                title: row.lesson.title,
                translations: row.lesson.translations,
              },
            ],
      ),
      stories,
      badges,
    ),
  };
}
