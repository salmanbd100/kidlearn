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

/**
 * The weekly progress report (FR-DASH-05..06).
 *
 * Three decisions shape this file, and each one is the reason a figure in it can
 * be trusted:
 *
 *  1. **A report is a stored snapshot, not a live query.** The row is written once
 *     the week has ended and read back verbatim afterwards, so a lesson
 *     unpublished in October cannot quietly rewrite August. Regeneration for the
 *     same `(childId, weekStart)` *replaces* it — a `@@unique` upsert rather than
 *     an insert — which is what lets a late-arriving event still be counted while
 *     making it impossible for FR-DASH-06's history to grow a duplicate week.
 *  2. **The arithmetic is pure.** `computeWeeklyMetrics` and `selectNote` take
 *     plain arrays and plain numbers, so every rule below — the first-attempt
 *     accuracy, the timezone the active days are counted in, the note ordering —
 *     is one assertion in `weeklyReportService.test.ts` rather than a database
 *     fixture.
 *  3. **Minutes are never recomputed.** They come from file 27's
 *     `computeLearningMinutes`, the same density rule the dashboard shows and the
 *     screen-time limit is checked against. A second implementation would be a
 *     second answer to "how long did my child learn last week".
 *
 * ## Why generation is lazy plus a cron call, and not a scheduler
 *
 * The deployment target is a free tier with no worker and no queue (spec §9). So
 * there are two triggers, both idempotent by construction:
 *
 *  - `GET /api/children/{id}/reports` fills in the **last completed week** for
 *    the child being viewed, if it is missing, before listing.
 *  - `POST /api/admin/jobs/weekly-reports` does the same for **every** child, and
 *    is what an external scheduler (cron-job.org → the Render service) calls every
 *    Monday. It has no client waiting on it, so a cold start costs nothing.
 *
 * One week of catch-up per read is deliberate: a parent opening the screen after a
 * three-month gap gets last week's card immediately rather than a request that
 * generates thirteen reports while they wait. The cron endpoint is what fills
 * older gaps, one week per run.
 */

/**
 * How many first attempts a week needs before an accuracy figure earns a note.
 *
 * Two questions answered right is 100% and says nothing; ten is enough that the
 * number is about the child rather than about the sample. `quizStar` is the only
 * rule that makes a claim about *understanding*, so it is the only one with a
 * floor under it.
 */
export const QUIZ_STAR_MIN_ATTEMPTS = 10;

/** The accuracy `quizStar` asks for, in whole percent. */
export const QUIZ_STAR_MIN_ACCURACY = 90;

// --- The pure core --------------------------------------------------------- //

export interface WeeklyMetricsInput {
  /** `SessionEvent.occurredAt` for the child. */
  eventTimestamps: readonly Date[];
  completedLessons: readonly {
    completedAt: Date;
    conceptsIntroduced: readonly string[];
  }[];
  /** One entry per story finished — the ledger's once-per-story grant. */
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
 * Every figure FR-DASH-05 asks for, from rows and nothing else.
 *
 * **Each input is filtered to `[weekStart, weekEnd)` here** even though the
 * queries below already select that window. Same reasoning as
 * `computeLearningMinutes`: a Prisma `where` is a promise about one query, not
 * about every future caller, and a fixture suite that had to pre-filter its own
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

  // A *local* calendar day, so a child learning at 00:30 Asia/Dhaka has started a
  // new day even though UTC says it is still the evening before. Counting UTC days
  // would put two evenings of learning on one row for the whole audience.
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
 * The prefixed tokens, split by kind, sorted and deduped.
 *
 * An unrecognised prefix — or a token with no `:` at all — is **ignored, never
 * fatal**. `conceptsIntroduced` is admin-authored free text, and a typo in a CMS
 * field must not be able to fail a parent's report. Splitting on the *first*
 * colon so a token can carry one in its value.
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
 * Accuracy over the **first** answer to each question, and how many there were.
 *
 * First attempt, not every attempt, because a quiz here has no fail state: a child
 * retries until they are right, so counting every row would report 100% for
 * everybody. The earliest `answeredAt` per `questionId` is the only row that
 * carries information, and a question answered wrong and then right is one
 * incorrect first attempt.
 *
 * `null` rather than `0` when nothing was answered. Zero percent is a real and bad
 * score; "no questions answered" is not a score, and a screen that cannot tell
 * them apart tells a parent their child got everything wrong.
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

/** The metrics `selectNote` reads — everything except the note it produces. */
export type NoteFacts = Omit<WeeklyReportMetrics, "noteKey" | "noteParams">;

export type SelectedNote = Pick<WeeklyReportMetrics, "noteKey" | "noteParams">;

/**
 * The encouraging note (FR-DASH-05), as a key plus its interpolation values.
 *
 * **A deterministic template, not an LLM.** A generated sentence would be a
 * network call inside a cron job with no client waiting, a cost per child per
 * week, and — the part that actually rules it out at MVP — an English sentence
 * that the Bangla half of the audience could not read, because the server has no
 * parent-language column to generate in (see `LocalizedLabelSchema`). Returning a
 * key means the client renders `t(\`reports.notes.${noteKey}\`, noteParams)` and
 * the note is Bangla for a Bangla-reading parent.
 *
 * Post-MVP the producer can be swapped for the Claude API behind this exact
 * signature: the stored shape is already `key + params`, so a generated note needs
 * no schema change — only a decision about which language it is generated in.
 *
 * **The order below is the specification.** First match wins, and the sequence is
 * not arbitrary:
 *
 *  - `quietWeek` first, because it is the only note that must not congratulate. A
 *    week with no activity has `lessonsCompleted === 0` and would otherwise fall
 *    through to `gentleNudge`, which assumes somebody turned up.
 *  - `perfectWeek` before `quizStar`, so seven days out of seven is what a parent
 *    is told about even when the accuracy was also excellent. Turning up every day
 *    is the harder thing and the one a four-year-old controls.
 *  - `steadyProgress` near the end, because "you finished a lesson" is true of
 *    almost every active week and would swallow every rule above it.
 *  - `storyTime` after it, and it is why `gentleNudge` is not simply the `else` of
 *    the lesson rule: a week of one to four stories and no lessons finished
 *    something, and telling that parent "nothing finished yet" underneath a card
 *    reading "Stories read: 4" is the report contradicting itself.
 *  - `gentleNudge` last, and now truthfully: some presence, nothing finished at
 *    all.
 *
 * Pure, and takes the facts rather than a child id, so the ordering is a table of
 * assertions and not a database fixture.
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
 * The English sentence stored in `WeeklyReport.note`.
 *
 * A fallback and a debugging aid, not the copy a parent reads: the client renders
 * from `noteKey` so the note localises (`frontend.md §3`). It is stored anyway
 * because a report is a record, and a row whose meaning can only be recovered by
 * running this year's locale files against it is not one.
 *
 * The three notes whose quantity can be one — `steadyProgress`, `storyTime`,
 * `gentleNudge` — name their parameter `count`, because that is the key i18next
 * selects a plural form with: the locale files carry `_one`/`_other` variants and a
 * week with one lesson reads "1 lesson finished". The templates here do not
 * pluralise, which is the one way this fallback is poorer than the locale files and
 * is acceptable in a field no client renders.
 *
 * The templates are duplicated in `apps/web/locales/en/parent.json`, which is the
 * one duplication in this feature and is deliberate: `packages/types` may not
 * carry copy, the server has no i18next, and the alternative — the server sending
 * a sentence — is what makes the note untranslatable.
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

// --- Week boundaries ------------------------------------------------------- //

/**
 * The `[from, to)` instants a stored `weekStart` means, and the Sunday it ends on.
 *
 * `weekStart` arrives as the UTC-midnight encoding of a date-only value, which is
 * what Prisma round-trips a `@db.Date` column as (`lib/local-date.ts`). Both edges
 * are then resolved as *local* midnights in `timeZone`, so the seven days measured
 * are the seven days the household lived through — the same conversion
 * `learningTimeWindow` does for the dashboard's `week`.
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
 * `weekStart` as a `yyyy-MM-dd`, rejecting anything that is not a Monday.
 *
 * Both halves of the check matter. **UTC midnight**, because a caller who passed
 * `new Date()` would otherwise have their instant silently floored to a week they
 * did not ask for, and the unique index would then merge two different intents
 * into one row. **Monday**, because every other window in this product starts on
 * one (FR-DASH-02) and a report anchored to a Wednesday would overlap two of the
 * dashboard's weeks while claiming to be one of them.
 *
 * A `400`, not a `500`: the value reaches this function from a request path or a
 * job parameter, so it is bad input rather than a broken server.
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
 * The Monday of the most recently **finished** week, in `timeZone`.
 *
 * The week containing `now` is deliberately excluded: a report for a week still
 * being lived through would be replaced on every read, and a parent watching
 * Wednesday's figures called "last week" would be right to distrust the screen.
 */
export function lastCompletedWeekStart(now: Date, timeZone: string): Date {
  const thisMonday = mondayOfLocalWeek(localDateIn(timeZone, now));
  return localDateToUtcMidnight(addLocalDays(thisMonday, -DAYS_PER_WEEK));
}

// --- I/O ------------------------------------------------------------------- //

/**
 * Generates — or regenerates — one child's report for one week (FR-DASH-05).
 *
 * Idempotent by construction: the upsert targets the `(childId, weekStart)` unique
 * index, so however many times the list endpoint and the cron job both run, the
 * history stays one row per week (FR-DASH-06). Re-running *replaces* the metrics
 * rather than skipping, which is what makes a late-arriving event countable.
 *
 * ## What the queries do and do not gate
 *
 * **Every figure derived from content is gated to `published`**, with the world
 * gate the rest of the codebase applies (`lib/published-for-child.ts`). Two of
 * them render authored strings — badge names, and the concept tokens themselves —
 * so unreviewed content must not reach a parent either (`backend.md §4`). The
 * other two, `storiesCompleted` and `quizAccuracy`, are numbers, and they are
 * gated anyway: a story pulled after a complaint should not go on being counted as
 * something the week achieved, and a documented claim that unpublished content
 * never appears "in the figures" is one a reader has to be able to take literally.
 *
 * The gates are not all the same shape, because the schema is not: the quiz gate
 * is a nested relation filter through `QuizQuestion.quiz`, while the story gate is
 * a second query — `RewardLedger.sourceId` is text, not a relation (see
 * `visibleStoryIds`).
 *
 * Grade is deliberately **not** in the gate, matching the dashboard's activity
 * feed: a child promoted from Nursery to KG-1 keeps the week they actually had.
 *
 * The stated consequence, because it is a real one: a lesson withdrawn from the
 * catalogue stops being counted the next time this week is generated. Historical
 * weeks are frozen by the fact that nothing regenerates them — only the last
 * completed week is ever recomputed — so the exposure is one week wide, and the
 * alternative is naming content an admin has pulled.
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
    // coin row, so filtering to the star is what makes this a true distinct count
    // (the same reason `dashboardService` filters the feed that way).
    //
    // `sourceId` comes back because the gate cannot be a `where` here: the ledger
    // has no relation to `Story`, only the id as text, so the published check is a
    // second query — the same two-step `dashboardService` does for story titles.
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
 * Which of these story completions point at a story a parent may still be told
 * about.
 *
 * The ledger row is never dropped — the child earned those stars — but a story
 * pulled from the catalogue is unreviewed content, and `storiesCompleted` is a
 * figure about it. Same call `dashboardService` makes for the feed, and the reason
 * the count is a second query rather than a `where`: `RewardLedger.sourceId` is
 * text, not a relation.
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
 * The Monday of the earliest week this child can have a report for.
 *
 * The week their profile was created, and no earlier. Without this the lazy fill
 * happily aggregates a week that ended before the child existed and stores the
 * truthful-but-absurd result: `activeDays: 0`, note `quietWeek` — "A quiet week —
 * no learning time recorded" — as the first thing a parent sees about a profile
 * they made yesterday. It also made the documented empty list unreachable, and
 * `reports.empty` in both locale files dead copy.
 *
 * The week *containing* `createdAt` counts, partial though it is: the child did
 * learn in it, and the alternative is silently withholding their first week.
 */
function firstReportableWeek(createdAt: Date, timeZone: string): Date {
  return localDateToUtcMidnight(
    mondayOfLocalWeek(localDateIn(timeZone, createdAt)),
  );
}

/**
 * Every report this child has, newest first, generating last week's if it is
 * missing (FR-DASH-06).
 *
 * The lazy fill is one week and one week only — see the header for why. A child
 * with a gap older than that gets it filled by the cron endpoint instead of making
 * a parent wait for thirteen aggregations.
 *
 * Takes the loaded child rather than an id because `createdAt` decides whether the
 * fill may happen at all, and `loadOwnedChild` already holds the row.
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
 * One stored row as the wire shape, or `undefined` if its blob no longer parses.
 *
 * `metrics` is a `Json` column, so reading it is a genuine external boundary even
 * though this service is its only writer — which is exactly when the schema is
 * worth running: a shape change shipped without migrating the stored blobs would
 * otherwise reach a parent's screen as `undefined` percentages.
 *
 * A bad row is **dropped and logged**, not thrown. Throwing would 500 the whole
 * history for one unreadable week, and the parent cannot act on either outcome —
 * but a `warn` naming the week is something an engineer can.
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
 * The oldest week between `firstWeek` and `lastWeek` that has no row yet, or
 * `undefined` if the history is complete.
 *
 * `lastWeek` itself is excluded: the caller regenerates it unconditionally, so
 * offering it here would spend the run's one backfill on a week that was about to
 * be written anyway.
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
 * Brings every child's history up to date — what the cron job runs.
 *
 * Two weeks per child at most, and that is the whole design:
 *
 *  1. **The last completed week, always.** No "skip if it exists" check — the
 *     upsert is idempotent, and a week that already has a row may still be missing
 *     an event that arrived after it was written.
 *  2. **The oldest week still missing, if there is one.** This is the half that
 *     was documented and not implemented: recomputing only the newest week meant a
 *     single missed Monday — a scheduler outage, a cold start past its retry
 *     budget, a secret rotated on one side — left a hole in FR-DASH-06's history
 *     that nothing would ever fill, because the read path only ever fills the
 *     newest week too. One week per run keeps the job's cost bounded while making
 *     every gap eventually closeable.
 *
 * Neither trigger reaches back past `firstReportableWeek`, so a new profile does
 * not accumulate reports for weeks it did not exist in.
 *
 * Sequential rather than `Promise.all`: this runs on a free-tier instance against
 * a pooled connection, and a household of five profiles times however many
 * households is a burst that would exhaust the pool for the requests parents are
 * actually waiting on. Nothing is waiting on this job.
 *
 * One child's failure is logged and skipped rather than thrown. With a backfill in
 * the loop, aborting the run would mean one unaggregatable child permanently
 * blocking every later child's gap from ever closing — the retry would abort in
 * the same place next Monday.
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
