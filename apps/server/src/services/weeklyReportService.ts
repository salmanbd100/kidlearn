import type { Prisma } from "@kidlearn/db";
import type {
  ConceptPrefix,
  ReportNoteKey,
  WeeklyReport,
  WeeklyReportBadge,
  WeeklyReportJobResult,
  WeeklyReportList,
  WeeklyReportMetrics,
} from "@kidlearn/types";
import { isConceptPrefix, WeeklyReportMetricsSchema } from "@kidlearn/types";
import { env } from "../lib/env.js";
import { ApiError } from "../lib/errors.js";
import {
  addLocalDays,
  DAYS_PER_WEEK,
  localDateIn,
  localDateToUtcMidnight,
  localWeekBounds,
  localWeekEndInclusive,
  mondayOfLocalWeek,
} from "../lib/local-date.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import {
  publishedOnly,
  publishedRelation,
} from "../lib/published-for-child.js";
import { computeLearningMinutes } from "./learningTimeService.js";
import { STORY_COMPLETION } from "./rewardService.js";

// The weekly progress report (FR-DASH-05..06).

/** Below this many first attempts an accuracy figure is about the sample, not the child. */
export const QUIZ_STAR_MIN_ATTEMPTS = 10;

/** The accuracy `quizStar` asks for, in whole percent. */
export const QUIZ_STAR_MIN_ACCURACY = 90;

export interface WeeklyMetricsInput {
  eventTimestamps: readonly Date[];
  completedLessons: readonly {
    completedAt: Date;
    conceptsIntroduced: readonly string[];
  }[];
  storyCompletions: readonly Date[];
  quizResponses: readonly {
    questionId: string;
    isCorrect: boolean;
    answeredAt: Date;
  }[];
  badges: readonly { slug: string; name: string; earnedAt: Date }[];
  weekStart: Date;
  /** Exclusive — the following Monday's local midnight. */
  weekEnd: Date;
  timeZone: string;
}

/**
 * Inputs are re-filtered to `[weekStart, weekEnd)` here even though the queries
 * already select that window — a fixture suite that had to pre-filter its own
 * inputs could not tell a window bug from a fixture bug.
 */
export function computeWeeklyMetrics(
  input: WeeklyMetricsInput,
): WeeklyReportMetrics {
  const { weekStart, weekEnd, timeZone } = input;
  const inWeek = <T>(rows: readonly T[], at: (row: T) => Date): T[] =>
    rows.filter(
      (row) =>
        at(row).getTime() >= weekStart.getTime() &&
        at(row).getTime() < weekEnd.getTime(),
    );

  const eventTimestamps = input.eventTimestamps.filter(
    (at) =>
      at.getTime() >= weekStart.getTime() && at.getTime() < weekEnd.getTime(),
  );
  const completedLessons = inWeek(input.completedLessons, (r) => r.completedAt);
  const storyCompletions = inWeek(input.storyCompletions, (at) => at);
  const quizResponses = inWeek(input.quizResponses, (r) => r.answeredAt);
  const badges = inWeek(input.badges, (r) => r.earnedAt);

  // A *local* calendar day: a child learning at 00:30 Asia/Dhaka has started a new
  // day even though UTC still says the evening before.
  const activeDays = new Set(
    eventTimestamps.map((at) => localDateIn(timeZone, at)),
  ).size;

  const concepts = collectConcepts(
    completedLessons.flatMap((lesson) => [...lesson.conceptsIntroduced]),
  );

  const { quizAccuracy, quizFirstAttempts, quizFirstAttemptsCorrect } =
    firstAttemptAccuracy(quizResponses);

  const metrics = {
    activeDays,
    learningMinutes: computeLearningMinutes(
      eventTimestamps,
      weekStart,
      weekEnd,
    ),
    newLetters: concepts.letter,
    newWords: concepts.word,
    newNumbers: concepts.number,
    lessonsCompleted: completedLessons.length,
    storiesCompleted: storyCompletions.length,
    quizAccuracy,
    quizFirstAttempts,
    quizFirstAttemptsCorrect,
    badgesEarned: badges.map(
      ({ slug, name }): WeeklyReportBadge => ({ slug, name }),
    ),
  };

  return { ...metrics, ...selectNote(metrics) };
}

/**
 * An unrecognised prefix — or a token with no `:` — is ignored, never fatal:
 * `conceptsIntroduced` is admin-authored free text and a typo must not fail a
 * parent's report. Splits on the first colon so a value may contain one.
 */
function collectConcepts(
  tokens: readonly string[],
): Record<ConceptPrefix, string[]> {
  const buckets: Record<ConceptPrefix, Set<string>> = {
    letter: new Set(),
    word: new Set(),
    number: new Set(),
  };

  for (const token of tokens) {
    const separator = token.indexOf(":");
    if (separator <= 0) continue;
    const prefix = token.slice(0, separator);
    const value = token.slice(separator + 1);
    if (value === "") continue;
    if (!isConceptPrefix(prefix)) continue;
    buckets[prefix].add(value);
  }

  return {
    letter: [...buckets.letter].sort(),
    word: [...buckets.word].sort(),
    number: [...buckets.number].sort(),
  };
}

/**
 * Accuracy over the *first* answer to each question. A quiz here has no fail
 * state — a child retries until they are right — so counting every attempt would
 * report 100% for everybody.
 */
function firstAttemptAccuracy(
  responses: readonly {
    questionId: string;
    isCorrect: boolean;
    answeredAt: Date;
  }[],
): {
  quizAccuracy: number | null;
  quizFirstAttempts: number;
  quizFirstAttemptsCorrect: number;
} {
  const first = new Map<string, { isCorrect: boolean; answeredAt: number }>();

  for (const response of responses) {
    const answeredAt = response.answeredAt.getTime();
    const held = first.get(response.questionId);
    // Strictly earlier, so two rows sharing a millisecond keep the first seen
    // rather than flipping with the query's ordering.
    if (held === undefined || answeredAt < held.answeredAt) {
      first.set(response.questionId, {
        isCorrect: response.isCorrect,
        answeredAt,
      });
    }
  }

  const attempts = [...first.values()];
  if (attempts.length === 0) {
    return {
      quizAccuracy: null,
      quizFirstAttempts: 0,
      quizFirstAttemptsCorrect: 0,
    };
  }

  const correct = attempts.filter((attempt) => attempt.isCorrect).length;
  return {
    quizAccuracy: Math.round((100 * correct) / attempts.length),
    quizFirstAttempts: attempts.length,
    // Stored, not left to the client to invert out of the rounded percentage: 50
    // of 101 rounds to 50%, and 50% of 101 rounds back to 51.
    quizFirstAttemptsCorrect: correct,
  };
}

export type NoteFacts = Omit<WeeklyReportMetrics, "noteKey" | "noteParams">;

export type SelectedNote = Pick<WeeklyReportMetrics, "noteKey" | "noteParams">;

/**
 * The encouraging note (FR-DASH-05), as a key plus its interpolation values — not
 * a generated sentence, so the note renders in the parent's own language.
 */
export function selectNote(metrics: NoteFacts): SelectedNote {
  const {
    activeDays,
    quizAccuracy,
    quizFirstAttempts,
    storiesCompleted,
    lessonsCompleted,
    learningMinutes,
  } = metrics;

  if (activeDays === 0) {
    return { noteKey: "quietWeek", noteParams: {} };
  }

  if (activeDays === DAYS_PER_WEEK) {
    return { noteKey: "perfectWeek", noteParams: { activeDays } };
  }

  if (
    quizAccuracy !== null &&
    quizAccuracy >= QUIZ_STAR_MIN_ACCURACY &&
    quizFirstAttempts >= QUIZ_STAR_MIN_ATTEMPTS
  ) {
    return {
      noteKey: "quizStar",
      noteParams: { accuracy: quizAccuracy, questions: quizFirstAttempts },
    };
  }

  if (activeDays >= 5) {
    return { noteKey: "strongWeek", noteParams: { activeDays } };
  }

  if (storiesCompleted >= 5) {
    return { noteKey: "bookworm", noteParams: { stories: storiesCompleted } };
  }

  if (lessonsCompleted >= 1) {
    return {
      noteKey: "steadyProgress",
      noteParams: { count: lessonsCompleted },
    };
  }

  if (storiesCompleted >= 1) {
    return { noteKey: "storyTime", noteParams: { count: storiesCompleted } };
  }

  return { noteKey: "gentleNudge", noteParams: { count: learningMinutes } };
}

/**
 * The English sentence stored in `WeeklyReport.note` — a fallback and a debugging
 * aid, not the copy a parent reads (the client renders from `noteKey`). Stored
 * anyway because a row whose meaning needs this year's locale files to recover is
 * not a record.
 */
const NOTE_TEMPLATES: Record<ReportNoteKey, string> = {
  quietWeek:
    "A quiet week — no learning time recorded. A short story together is a gentle way back in.",
  perfectWeek:
    "All {{activeDays}} days this week. Turning up every single day is the hardest part, and it is done.",
  quizStar:
    "{{accuracy}}% right first time across {{questions}} questions — that is understanding, not lucky guessing.",
  strongWeek:
    "{{activeDays}} days of learning this week. A lovely steady rhythm.",
  bookworm: "{{stories}} stories finished this week. A proper little bookworm!",
  steadyProgress:
    "{{count}} lessons finished this week. Every one of them counts.",
  storyTime:
    "{{count}} stories read this week. Reading together is learning too.",
  gentleNudge:
    "{{count}} minutes in the app but nothing finished yet. One short lesson together is usually all it takes.",
};

export function renderEnglishNote({
  noteKey,
  noteParams,
}: SelectedNote): string {
  return NOTE_TEMPLATES[noteKey].replace(
    /\{\{(\w+)\}\}/g,
    (whole, name: string) => {
      const value = noteParams[name];
      return value === undefined ? whole : String(value);
    },
  );
}

/**
 * `weekStart` arrives as the UTC-midnight encoding of a date-only value, which is
 * how Prisma round-trips a `@db.Date` column. Both edges resolve as *local*
 * midnights, so the seven days measured are the seven the household lived through.
 */
export function weekBounds(
  weekStart: Date,
  timeZone: string,
): { from: Date; to: Date; weekEndInclusive: Date } {
  const monday = assertMondayWeekStart(weekStart);
  return {
    ...localWeekBounds(timeZone, monday),
    weekEndInclusive: localWeekEndInclusive(monday),
  };
}

/**
 * UTC midnight, so a caller passing `new Date()` is not silently floored into a
 * week they did not ask for and merged with another intent by the unique index.
 * Monday, because every other window in this product starts on one (FR-DASH-02).
 */
export function assertMondayWeekStart(weekStart: Date): string {
  const time = weekStart.getTime();
  if (Number.isNaN(time)) {
    throw new ApiError(400, "VALIDATION_FAILED", "weekStart is not a date");
  }

  if (time % 86_400_000 !== 0) {
    throw new ApiError(
      400,
      "VALIDATION_FAILED",
      "weekStart must be a date at UTC midnight, as WeeklyReport.weekStart stores it",
    );
  }

  if (weekStart.getUTCDay() !== 1) {
    throw new ApiError(
      400,
      "VALIDATION_FAILED",
      `weekStart must be a Monday; ${weekStart.toISOString().slice(0, 10)} is not`,
    );
  }

  return weekStart.toISOString().slice(0, 10);
}

/**
 * The week containing `now` is excluded: a report for a week still being lived
 * through would be replaced on every read.
 */
export function lastCompletedWeekStart(now: Date, timeZone: string): Date {
  const thisMonday = mondayOfLocalWeek(localDateIn(timeZone, now));
  return localDateToUtcMidnight(addLocalDays(thisMonday, -DAYS_PER_WEEK));
}

/**
 * Generates — or regenerates — one child's report for one week (FR-DASH-05).
 */
export async function generateWeeklyReport(
  childId: string,
  weekStart: Date,
): Promise<void> {
  const { from, to } = weekBounds(weekStart, env.APP_TIMEZONE);

  /** Status and world, no grade — see the header note. */
  const visibleLesson: Prisma.LessonWhereInput = {
    ...publishedOnly,
    world: publishedRelation,
  };

  const [events, lessons, stories, responses, badgeRows] = await Promise.all([
    prisma.sessionEvent.findMany({
      where: { childId, occurredAt: { gte: from, lt: to } },
      select: { occurredAt: true },
    }),

    prisma.lessonProgress.findMany({
      where: {
        childId,
        completedAt: { gte: from, lt: to },
        lesson: { is: visibleLesson },
      },
      select: {
        completedAt: true,
        lesson: { select: { conceptsIntroduced: true } },
      },
    }),

    // One row per story, not two: `grantStoryCompletion` writes a star row *and* a
    // coin row, so filtering to the star makes this a true distinct count.
    // `sourceId` comes back because the ledger has no relation to `Story` — only
    // the id as text — so the published check has to be a second query.
    prisma.rewardLedger.findMany({
      where: {
        childId,
        rewardType: "star",
        sourceType: STORY_COMPLETION,
        createdAt: { gte: from, lt: to },
      },
      select: { createdAt: true, sourceId: true },
    }),

    prisma.quizResponse.findMany({
      where: {
        childId,
        answeredAt: { gte: from, lt: to },
        question: { is: { quiz: publishedRelation } },
      },
      select: { questionId: true, isCorrect: true, answeredAt: true },
    }),

    prisma.rewardLedger.findMany({
      where: {
        childId,
        rewardType: "badge",
        createdAt: { gte: from, lt: to },
        badge: publishedRelation,
      },
      select: {
        createdAt: true,
        badge: { select: { slug: true, name: true } },
      },
    }),
  ]);

  const publishedStoryIds = await visibleStoryIds(stories);

  const metrics = computeWeeklyMetrics({
    eventTimestamps: events.map((event) => event.occurredAt),
    completedLessons: lessons.flatMap((row) =>
      row.completedAt === null
        ? []
        : [
            {
              completedAt: row.completedAt,
              conceptsIntroduced: row.lesson.conceptsIntroduced,
            },
          ],
    ),
    storyCompletions: stories.flatMap((row) =>
      row.sourceId !== null && publishedStoryIds.has(row.sourceId)
        ? [row.createdAt]
        : [],
    ),
    quizResponses: responses,
    badges: badgeRows.flatMap((row) =>
      row.badge === null
        ? []
        : [
            {
              slug: row.badge.slug,
              name: row.badge.name,
              earnedAt: row.createdAt,
            },
          ],
    ),
    weekStart: from,
    weekEnd: to,
    timeZone: env.APP_TIMEZONE,
  });

  const note = renderEnglishNote(metrics);
  // `metrics` is a plain object of JSON scalars, arrays and records by
  // construction (`WeeklyReportMetricsSchema`), which Prisma's `InputJsonValue`
  // cannot infer from a named interface — hence the widening, not a shape change.
  const stored = metrics as unknown as Prisma.InputJsonObject;

  await prisma.weeklyReport.upsert({
    where: { childId_weekStart: { childId, weekStart } },
    create: { childId, weekStart, metrics: stored, note },
    update: { metrics: stored, note },
  });
}

/**
 * The ledger row is never dropped — the child earned those stars — but a story
 * pulled from the catalogue is unreviewed content, and `storiesCompleted` is a
 * figure about it. A second query rather than a `where`: `sourceId` is text.
 */
async function visibleStoryIds(
  rows: readonly { sourceId: string | null }[],
): Promise<Set<string>> {
  const ids = rows.flatMap((row) =>
    row.sourceId === null ? [] : [row.sourceId],
  );
  if (ids.length === 0) return new Set();

  const published = await prisma.story.findMany({
    where: { id: { in: ids }, ...publishedOnly, world: publishedRelation },
    select: { id: true },
  });

  return new Set(published.map((story) => story.id));
}

/**
 * Without this the lazy fill aggregates weeks that ended before the child existed
 * and stores the truthful-but-absurd result — `activeDays: 0`, note `quietWeek` —
 * as the first thing a parent sees about a profile made yesterday.
 */
function firstReportableWeek(createdAt: Date, timeZone: string): Date {
  return localDateToUtcMidnight(
    mondayOfLocalWeek(localDateIn(timeZone, createdAt)),
  );
}

/**
 * Every report this child has, newest first, generating last week's if missing
 * (FR-DASH-06). The lazy fill is one week only — see the header.
 */
export async function getWeeklyReports(child: {
  id: string;
  createdAt: Date;
}): Promise<WeeklyReportList> {
  const weekStart = lastCompletedWeekStart(new Date(), env.APP_TIMEZONE);

  if (
    weekStart.getTime() >=
    firstReportableWeek(child.createdAt, env.APP_TIMEZONE).getTime()
  ) {
    const existing = await prisma.weeklyReport.findUnique({
      where: { childId_weekStart: { childId: child.id, weekStart } },
      select: { id: true },
    });

    if (existing === null) {
      await generateWeeklyReport(child.id, weekStart);
    }
  }

  const rows = await prisma.weeklyReport.findMany({
    where: { childId: child.id },
    orderBy: { weekStart: "desc" },
    select: { weekStart: true, metrics: true, note: true, createdAt: true },
  });

  return { reports: rows.flatMap((row) => toWeeklyReport(row) ?? []) };
}

/**
 * `metrics` is a `Json` column, so reading it is a genuine external boundary even
 * though this service is its only writer: a shape change shipped without migrating
 * stored blobs would reach a parent's screen as `undefined` percentages.
 */
function toWeeklyReport(row: {
  weekStart: Date;
  metrics: Prisma.JsonValue;
  note: string | null;
  createdAt: Date;
}): WeeklyReport | undefined {
  const parsed = WeeklyReportMetricsSchema.safeParse(row.metrics);
  if (!parsed.success) {
    logger.warn(
      { weekStart: row.weekStart.toISOString(), issues: parsed.error.issues },
      "Stored weekly report metrics do not match the current schema; omitting the week",
    );
    return undefined;
  }

  const monday = row.weekStart.toISOString().slice(0, 10);
  return {
    weekStart: row.weekStart.toISOString(),
    weekEnd: localWeekEndInclusive(monday).toISOString(),
    metrics: parsed.data,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * `lastWeek` itself is excluded: the caller regenerates it unconditionally, so
 * offering it here would spend the run's one backfill on a week about to be
 * written anyway.
 */
function oldestMissingWeek(
  firstWeek: Date,
  lastWeek: Date,
  present: ReadonlySet<number>,
): Date | undefined {
  for (
    let week = firstWeek;
    week.getTime() < lastWeek.getTime();
    week = localDateToUtcMidnight(
      addLocalDays(week.toISOString().slice(0, 10), DAYS_PER_WEEK),
    )
  ) {
    if (!present.has(week.getTime())) return week;
  }

  return undefined;
}

/**
 * Brings every child's history up to date — what the cron job runs. Two weeks per
 * child at most: the last completed week always (the upsert is idempotent, and a
 * week that already has a row may still be missing a late event), plus the oldest
 * week still missing, so a single missed Monday does not leave a permanent hole.
 */
export async function generateLastCompletedWeekForAllChildren(): Promise<WeeklyReportJobResult> {
  const lastWeek = lastCompletedWeekStart(new Date(), env.APP_TIMEZONE);
  const children = await prisma.childProfile.findMany({
    select: { id: true, createdAt: true },
  });

  let weeksGenerated = 0;
  let childrenFailed = 0;

  for (const child of children) {
    const firstWeek = firstReportableWeek(child.createdAt, env.APP_TIMEZONE);
    if (lastWeek.getTime() < firstWeek.getTime()) continue;

    try {
      const existing = await prisma.weeklyReport.findMany({
        where: { childId: child.id },
        select: { weekStart: true },
      });
      const present = new Set(existing.map((row) => row.weekStart.getTime()));

      const gap = oldestMissingWeek(firstWeek, lastWeek, present);
      if (gap !== undefined) {
        await generateWeeklyReport(child.id, gap);
        weeksGenerated += 1;
      }

      await generateWeeklyReport(child.id, lastWeek);
      weeksGenerated += 1;
    } catch (error) {
      childrenFailed += 1;
      logger.error(
        { err: error, childId: child.id },
        "Weekly report generation failed for one child; continuing",
      );
    }
  }

  logger.info(
    {
      childrenProcessed: children.length,
      childrenFailed,
      weeksGenerated,
      weekStart: lastWeek.toISOString(),
    },
    "Weekly reports generated",
  );

  return {
    childrenProcessed: children.length,
    weekStart: lastWeek.toISOString(),
  };
}
