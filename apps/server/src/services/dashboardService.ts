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
import { STORY_COMPLETION } from "./rewardService.js";

// The parent dashboard, in one read (FR-DASH-01..04).

/**
 * How many ledger rows to read for a feed capped at `RECENT_ACTIVITY_LIMIT`.
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

/** Per-subject completion, plus the two subjects worth naming (FR-DASH-03). */
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

/** The three histories as one feed, newest first, capped (FR-DASH-04). */
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

/** Both locales of a display string, from the row's translations. */
function toLocalizedLabel<TRow extends { language: Lang }>(
  translations: readonly TRow[] | undefined,
  fallback: string,
  select: (row: TRow) => string | null | undefined,
): LocalizedLabel {
  const map = toLocaleMap(translations, select);
  return { en: map.en ?? fallback, bn: map.bn ?? null };
}

/** FR-DASH-01 — one call, everything the `/parent` screen renders. */
export async function getDashboardSummary(
  child: ChildProfile,
): Promise<DashboardData> {
  const visible = publishedForChild(child);
  /**
   * A lesson is visible only if its world, its topic and that topic's subject
   * are too.
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
