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
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { prisma } from "../../config/prisma.js";
import { ApiError } from "../../shared/errors/errors.js";
import {
  addLocalDays,
  DAYS_PER_WEEK,
  localDateIn,
  localDateToUtcMidnight,
  localWeekBounds,
  localWeekEndInclusive,
  mondayOfLocalWeek,
} from "../../shared/utils/local-date.js";
import {
  publishedOnly,
  publishedRelation,
} from "../../shared/utils/published-for-child.js";
import { computeLearningMinutes } from "../progress/learning-time.service.js";
import { sessionEventRetentionCutoff } from "../progress/session-event-retention.service.js";
import { STORY_COMPLETION } from "../rewards/reward.service.js";

// Below this many first attempts, accuracy describes the sample, not the child.
export const QUIZ_STAR_MIN_ATTEMPTS = 10;

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
  weekEnd: Date;
  timeZone: string;
}

// Re-filtered to `[weekStart, weekEnd)` even though the queries select that
// window, so a fixture bug and a window bug stay distinguishable.
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

  // A *local* calendar day: 00:30 Asia/Dhaka is already a new day though UTC says the evening before.
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

// An unrecognised prefix or a token with no `:` is ignored, never fatal
// (admin-authored free text). Splits on the first colon so a value may contain one.
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

// Accuracy over the *first* answer to each question: a quiz has no fail state
// (children retry until right), so counting every attempt would report 100%.
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
    // Strictly earlier, so rows sharing a millisecond keep the first seen, not the query's ordering.
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
    // Stored, not inverted by the client from the rounded percentage (50 of 101 is 50%, but 50% of 101 is 51).
    quizFirstAttemptsCorrect: correct,
  };
}

export type NoteFacts = Omit<WeeklyReportMetrics, "noteKey" | "noteParams">;

export type SelectedNote = Pick<WeeklyReportMetrics, "noteKey" | "noteParams">;

// A key plus interpolation values, not a sentence, so the note renders in the parent's language.
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

// Fallback and debugging aid stored in `WeeklyReport.note`; the client renders from `noteKey`.
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

// `weekStart` is the UTC-midnight encoding of a `@db.Date`; both edges resolve as
// *local* midnights, so the seven days measured are the household's own.
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

// UTC midnight, so a `new Date()` is not silently floored into a week nobody
// asked for. Monday because every window in this product starts on one.
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

// The week containing `now` is excluded: it would be replaced on every read.
export function lastCompletedWeekStart(now: Date, timeZone: string): Date {
  const thisMonday = mondayOfLocalWeek(localDateIn(timeZone, now));
  return localDateToUtcMidnight(addLocalDays(thisMonday, -DAYS_PER_WEEK));
}

export async function generateWeeklyReport(
  childId: string,
  weekStart: Date,
): Promise<void> {
  const { from, to } = weekBounds(weekStart, env.APP_TIMEZONE);

  // Status and world, no grade, as in the dashboard feed.
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

    // One row per story: `grantStoryCompletion` writes a star and a coin row, so
    // filtering to the star gives a distinct count. `sourceId` is text (no relation
    // to `Story`), so the published check is a second query.
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
  // `metrics` is JSON scalars/arrays/records by construction, which Prisma's
  // `InputJsonValue` cannot infer from a named interface.
  const stored = metrics as unknown as Prisma.InputJsonObject;

  await prisma.weeklyReport.upsert({
    where: { childId_weekStart: { childId, weekStart } },
    create: { childId, weekStart, metrics: stored, note },
    update: { metrics: stored, note },
  });
}

// The ledger row stays (the stars were earned), but a pulled story is unreviewed
// content, so it is not counted. A second query: `sourceId` is text.
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

// Without this the lazy fill stores `activeDays: 0` / `quietWeek` for weeks that
// ended before the child existed.
function firstReportableWeek(createdAt: Date, timeZone: string): Date {
  return localDateToUtcMidnight(
    mondayOfLocalWeek(localDateIn(timeZone, createdAt)),
  );
}

// The oldest week whose events are all still kept; a missing week before it
// stays missing, since pruned minutes would read as "did not play".
export function oldestRetainedWeek(now: Date, timeZone: string): Date {
  const cutoff = sessionEventRetentionCutoff(now);
  const week = localDateToUtcMidnight(
    mondayOfLocalWeek(localDateIn(timeZone, cutoff)),
  );
  if (weekBounds(week, timeZone).from.getTime() >= cutoff.getTime()) {
    return week;
  }
  return localDateToUtcMidnight(
    addLocalDays(week.toISOString().slice(0, 10), DAYS_PER_WEEK),
  );
}

/** A year of history: the screen shows the newest card and a list beneath it, and a row a year old is not read. */
export const WEEKLY_REPORT_HISTORY_LIMIT = 52;

/** Children loaded per page by the cron run, so the job's memory does not grow with the user base. */
export const WEEKLY_REPORT_CHILD_BATCH_SIZE = 200;

// Newest first, generating last week's if missing (FR-DASH-06); the lazy fill is one week only.
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
    take: WEEKLY_REPORT_HISTORY_LIMIT,
    select: { weekStart: true, metrics: true, note: true, createdAt: true },
  });

  return { reports: rows.flatMap((row) => toWeeklyReport(row) ?? []) };
}

// `metrics` is a `Json` column: a shape change shipped without migrating stored
// blobs would reach a parent's screen as `undefined` percentages.
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

// `lastWeek` is excluded: the caller regenerates it unconditionally, so offering
// it would waste the run's one backfill.
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

// Cron entry point. At most two weeks per child: the last completed week always
// (late events may still arrive), plus the oldest missing one within event retention.
export async function generateLastCompletedWeekForAllChildren(): Promise<
  Omit<WeeklyReportJobResult, "sessionEventsPruned">
> {
  const now = new Date();
  const lastWeek = lastCompletedWeekStart(now, env.APP_TIMEZONE);
  const retainedFrom = oldestRetainedWeek(now, env.APP_TIMEZONE);
  let childrenProcessed = 0;
  let weeksGenerated = 0;
  let childrenFailed = 0;

  // Keyset paging on `id`: an offset would skip or repeat a child created or deleted mid-run.
  for (let after: string | undefined; ; ) {
    const children = await prisma.childProfile.findMany({
      where: after === undefined ? undefined : { id: { gt: after } },
      orderBy: { id: "asc" },
      take: WEEKLY_REPORT_CHILD_BATCH_SIZE,
      select: { id: true, createdAt: true },
    });
    childrenProcessed += children.length;

    for (const child of children) {
      const firstWeek = firstReportableWeek(child.createdAt, env.APP_TIMEZONE);
      if (lastWeek.getTime() < firstWeek.getTime()) continue;
      const backfillFrom =
        firstWeek.getTime() > retainedFrom.getTime() ? firstWeek : retainedFrom;

      try {
        const existing = await prisma.weeklyReport.findMany({
          where: { childId: child.id },
          select: { weekStart: true },
        });
        const present = new Set(existing.map((row) => row.weekStart.getTime()));

        const gap = oldestMissingWeek(backfillFrom, lastWeek, present);
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

    const last = children.at(-1);
    if (
      last === undefined ||
      children.length < WEEKLY_REPORT_CHILD_BATCH_SIZE
    ) {
      break;
    }
    after = last.id;
  }

  logger.info(
    {
      childrenProcessed,
      childrenFailed,
      weeksGenerated,
      weekStart: lastWeek.toISOString(),
    },
    "Weekly reports generated",
  );

  return {
    childrenProcessed,
    childrenFailed,
    weekStart: lastWeek.toISOString(),
  };
}
