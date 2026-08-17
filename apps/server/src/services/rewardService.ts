import { Prisma, type RewardType } from "@kidlearn/db";
import type {
  CompletionStreakResponse,
  NewBadgeResponse,
  NewCharacterResponse,
} from "@kidlearn/types";
import { env } from "../lib/env.js";
import { localDateIn } from "../lib/local-date.js";
import { prisma } from "../lib/prisma.js";
import { isPublished } from "../lib/published-for-child.js";
import { withSerializationRetry } from "../lib/serializable-retry.js";
import {
  findNewlyEarnedBadges,
  unlockCharacters,
} from "./achievementService.js";
import { updateStreakForActivity } from "./streakService.js";

/**
 * Stars and coins (FR-GAM-01, FR-GAM-02, FR-GAM-07).
 *
 * **FR-GAM-08 — this module is the only writer of `RewardLedger` rows.** No route
 * accepts a reward amount, a reward type or a source from a client; every number
 * below is a constant in this file multiplied by something the server counted for
 * itself. Rewards are earned, never bought and never claimed. Keeping the write
 * in one file is what makes that reviewable — `grep -r "rewardLedger.create"
 * apps/server/src` should only ever find this one.
 *
 * **Balances are aggregates, not counters.** Nothing here increments a stored
 * total; a balance is `SUM(amount)` over the ledger (database-design.md §"Server
 * -authoritative"). The rows are the record, so files 29–30 can report *why* a
 * child has 42 coins and not merely that they do.
 *
 * **Replaying a lesson grants nothing.** A four-year-old who liked a lesson will
 * play it five more times, and a balance that measured that would measure nothing.
 * The guard is the unique index on `(childId, rewardType, sourceType, sourceId)`,
 * not a check in this file: it holds under two taps racing each other, and it
 * holds for any code path added later.
 */

/**
 * The MVP grant table. Fixed constants deliberately — tuning these is a
 * data-driven decision post-MVP (a `RewardRule` table read at grant time), and
 * shipping the knob before there is anything to turn it with is how a number
 * ends up configurable in three places and authoritative in none.
 */
export const REWARD_RULES = {
  lessonCompletionStars: 2,
  quizCompletionStars: 1,
  coinsPerCorrectAnswer: 2,
  firstActivityOfDayCoins: 5,
} as const;

/** The reward sources this file grants. `sourceType` is a free-text column on
 *  the row; this union is what keeps the values in it a closed set. */
export type GrantSource =
  | "lesson_completion"
  | "quiz_completion"
  | "quiz_correct_answers"
  | "daily_activity"
  | "badge_unlock";

export interface GrantSpec {
  rewardType: Extract<RewardType, "star" | "coin">;
  amount: number;
  sourceType: GrantSource;
  /**
   * Always set. Postgres treats a NULL as distinct in a unique index, so a grant
   * written without one would be outside the idempotency guard entirely and
   * could be granted again on every replay.
   */
  sourceId: string;
}

export interface GrantInput {
  lessonId: string;
  /** The lesson's quiz has at least one response row for this child. */
  quizAttempted: boolean;
  /** Questions whose *latest* response was right. Server-derived, never sent. */
  correctCount: number;
  firstActivityOfDay: boolean;
  /** `yyyy-MM-dd` in `APP_TIMEZONE`. The daily grant's `sourceId`. */
  localDate: string;
}

/**
 * What finishing this lesson is worth — pure, so every rule above is testable
 * without a database.
 *
 * The specs it returns are *candidates*: which of them a child is actually paid
 * is decided by the unique index, because a replay produces exactly the same
 * list. That is the point of keeping this side of the work free of I/O — the
 * arithmetic has no idea whether it is a first run or a fifth, and does not need
 * one.
 */
export function computeLessonGrants(input: GrantInput): GrantSpec[] {
  const specs: GrantSpec[] = [
    {
      rewardType: "star",
      amount: REWARD_RULES.lessonCompletionStars,
      sourceType: "lesson_completion",
      sourceId: input.lessonId,
    },
  ];

  // Finishing the quiz, not passing it. There is no pass: a child stays on a
  // question until it is right (spec §5.7), so this star is for turning up.
  if (input.quizAttempted) {
    specs.push({
      rewardType: "star",
      amount: REWARD_RULES.quizCompletionStars,
      sourceType: "quiz_completion",
      sourceId: input.lessonId,
    });
  }

  // One row for the whole quiz rather than one per question, so the grant has a
  // stable `sourceId` to be unique on. The consequence is deliberate: a replay
  // that goes better earns nothing extra, because the lesson has already paid
  // out. Paying the difference would make a balance reward repetition.
  if (input.correctCount > 0) {
    specs.push({
      rewardType: "coin",
      amount: REWARD_RULES.coinsPerCorrectAnswer * input.correctCount,
      sourceType: "quiz_correct_answers",
      sourceId: input.lessonId,
    });
  }

  // The local date *is* the idempotency key — "once a day" and "once a lesson"
  // are then the same constraint, and neither needs a query to be right.
  if (input.firstActivityOfDay) {
    specs.push({
      rewardType: "coin",
      amount: REWARD_RULES.firstActivityOfDayCoins,
      sourceType: "daily_activity",
      sourceId: input.localDate,
    });
  }

  return specs;
}

export interface RewardTotals {
  stars: number;
  coins: number;
}

export interface CompletionRewards {
  /** Stars actually written by this call. `0` on a replay. */
  starsEarned: number;
  coinsEarned: number;
  /** Badges this call unlocked. Empty on a replay (FR-GAM-04). */
  newBadges: NewBadgeResponse[];
  /** Avatar characters this call unlocked. Empty on a replay (FR-GAM-05). */
  newCharacters: NewCharacterResponse[];
  /** The streak as it stands after this activity (FR-GAM-06). */
  streak: CompletionStreakResponse;
  totals: RewardTotals;
}

export interface RewardSummary extends RewardTotals {
  badgeCount: number;
  currentStreak: number;
}

/**
 * The key the unique index is on.
 *
 * `sourceId` is nullable on the row and never null on a row this file writes, so
 * a stored `null` keys to a string no spec can produce — which is right: Postgres
 * treats those rows as outside the constraint, and so should this.
 */
function grantKey(spec: {
  rewardType: string;
  sourceType: string;
  sourceId: string | null;
}): string {
  return `${spec.rewardType}|${spec.sourceType}|${spec.sourceId}`;
}

/**
 * Grants everything finishing this lesson is worth, once.
 *
 * The caller has already established that the child may see the lesson; nothing
 * here re-checks visibility, and nothing here writes `LessonProgress` — that
 * belongs to `lessonProgressService.completeLesson`, which calls this.
 *
 * Serializable, like every other read-then-write in this codebase and for a
 * sharper reason than most: `starsEarned` is computed by reading which grants
 * already exist and then inserting the rest. Under READ COMMITTED two taps
 * arriving together would both read "nothing granted yet", and while the unique
 * index would still stop the second *insert*, both responses would celebrate the
 * same stars. The index protects the ledger; the isolation level protects the
 * number the child is shown.
 *
 * And therefore `withSerializationRetry`, not a bare `$transaction`: Serializable
 * makes the loser of that race abort with P2034, so without the retry the very
 * double tap this is guarding against would answer a 500 into the middle of a
 * celebration. The retry re-reads under the winner's rows and answers the truth —
 * zeros and the totals the other request just wrote.
 */
export async function grantLessonCompletion(
  childId: string,
  lessonId: string,
): Promise<CompletionRewards> {
  // Read once and passed in, so a retry cannot straddle local midnight and take
  // the day's coins twice under two different keys.
  const localDate = localDateIn(env.APP_TIMEZONE, new Date());

  return withSerializationRetry(() =>
    grantLessonCompletionOnce(childId, lessonId, localDate),
  );
}

function grantLessonCompletionOnce(
  childId: string,
  lessonId: string,
  localDate: string,
): Promise<CompletionRewards> {
  return prisma.$transaction(
    async (tx) => {
      const { quizAttempted, correctCount } = await readQuizOutcome(
        tx,
        childId,
        lessonId,
      );

      // One read covers both questions this needs of the ledger: whether today's
      // daily grant exists, and which of this lesson's grants already do.
      const existing = await tx.rewardLedger.findMany({
        where: { childId, sourceId: { in: [lessonId, localDate] } },
        select: { rewardType: true, sourceType: true, sourceId: true },
      });
      const granted = new Set(existing.map(grantKey));

      const specs = computeLessonGrants({
        lessonId,
        quizAttempted,
        correctCount,
        firstActivityOfDay: !granted.has(
          grantKey({
            rewardType: "coin",
            sourceType: "daily_activity",
            sourceId: localDate,
          }),
        ),
        localDate,
      });

      const fresh = specs.filter((spec) => !granted.has(grantKey(spec)));

      if (fresh.length > 0) {
        await tx.rewardLedger.createMany({
          data: fresh.map((spec) => ({ childId, ...spec })),
          // Belt to the isolation level's braces: the index is what makes a
          // double grant impossible, and this is what keeps a losing race a
          // no-op rather than a 500 in the middle of a celebration.
          skipDuplicates: true,
        });
      }

      // The order of the next three steps is load-bearing (file 24 §8): the
      // streak has to be current before a `streak_days` badge is evaluated, and
      // the badge has to be in the ledger before a `{ badges: n }` character is.
      // Reversed, a child would be told about their three-day streak today and
      // handed the badge for it tomorrow.
      const streak = await updateStreakForActivity(tx, childId, localDate);

      const newBadges = await findNewlyEarnedBadges(
        tx,
        childId,
        streak.current,
      );
      if (newBadges.length > 0) {
        await tx.rewardLedger.createMany({
          // `amount: 1` because the ledger is one table — a badge is a thing you
          // have or do not. `sourceId` is the slug rather than the id so the row
          // stays readable in a report, and it is set for the reason `GrantSpec`
          // gives: a NULL would sit outside the unique index entirely.
          data: newBadges.map((badge) => ({
            childId,
            rewardType: "badge" as const,
            amount: 1,
            sourceType: "badge_unlock" satisfies GrantSource,
            sourceId: badge.slug,
            badgeId: badge.id,
          })),
          skipDuplicates: true,
        });
      }

      const totals = await readTotals(tx, childId);
      const newCharacters = await unlockCharacters(tx, childId, {
        stars: totals.stars,
        coins: totals.coins,
        badges: totals.badgeCount,
      });

      const sumOf = (rewardType: RewardType): number =>
        fresh
          .filter((spec) => spec.rewardType === rewardType)
          .reduce((total, spec) => total + spec.amount, 0);

      return {
        starsEarned: sumOf("star"),
        coinsEarned: sumOf("coin"),
        newBadges,
        newCharacters,
        // `longest` is left out of the response deliberately — see
        // `CompletionStreakSchema`.
        streak: { current: streak.current, milestone: streak.milestone },
        totals: { stars: totals.stars, coins: totals.coins },
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

/** The subset of the client these helpers need, so a transaction callback and
 *  the plain client are interchangeable. */
type LedgerReader = {
  lesson: { findUnique: typeof prisma.lesson.findUnique };
  quizResponse: { findMany: typeof prisma.quizResponse.findMany };
  rewardLedger: { groupBy: typeof prisma.rewardLedger.groupBy };
};

/**
 * How the child did on this lesson's quiz, **derived from the stored responses**
 * rather than taken from the request. A client that could report its own
 * `correctCount` could report any number of coins.
 *
 * *Latest* response per question, not first and not best. A replay writes a
 * second row for the same question (`QuizResponse` is an append-only log), so
 * "first" would freeze a child's very first attempt forever and "any correct"
 * would be a constant `true` — a quiz here has no fail state, and every question
 * ends right eventually.
 */
async function readQuizOutcome(
  tx: LedgerReader,
  childId: string,
  lessonId: string,
): Promise<{ quizAttempted: boolean; correctCount: number }> {
  const lesson = await tx.lesson.findUnique({
    where: { id: lessonId },
    select: {
      quiz: {
        select: { status: true, questions: { select: { id: true } } },
      },
    },
  });

  // A lesson may have no quiz, or one still in review — both are ordinary
  // authoring states the player already renders around (`QuizStep`). An
  // unpublished quiz pays no star, for the same reason it is not served.
  const quiz = lesson?.quiz;
  if (!quiz || !isPublished(quiz) || quiz.questions.length === 0) {
    return { quizAttempted: false, correctCount: 0 };
  }

  const responses = await tx.quizResponse.findMany({
    where: {
      childId,
      questionId: { in: quiz.questions.map((question) => question.id) },
    },
    select: { questionId: true, isCorrect: true },
    orderBy: { answeredAt: "desc" },
  });

  const latest = new Map<string, boolean>();
  for (const response of responses) {
    if (!latest.has(response.questionId)) {
      latest.set(response.questionId, response.isCorrect);
    }
  }

  return {
    quizAttempted: latest.size > 0,
    correctCount: [...latest.values()].filter(Boolean).length,
  };
}

/**
 * Every balance in one read.
 *
 * `badgeCount` is a row count rather than a sum of `amount`, for the reason
 * `getRewardSummary` gives — and it is read here rather than derived from
 * `newBadges` because a character unlock rule counts what the child *has*, not
 * what they just got.
 */
async function readTotals(
  tx: LedgerReader,
  childId: string,
): Promise<RewardTotals & { badgeCount: number }> {
  const sums = await tx.rewardLedger.groupBy({
    by: ["rewardType"],
    where: { childId },
    _sum: { amount: true },
    _count: { _all: true },
  });

  const row = (rewardType: RewardType) =>
    sums.find((entry) => entry.rewardType === rewardType);

  return {
    stars: row("star")?._sum.amount ?? 0,
    coins: row("coin")?._sum.amount ?? 0,
    badgeCount: row("badge")?._count._all ?? 0,
  };
}

/**
 * FR-GAM-06 — what the child has, for the strip on the home screen.
 *
 * `badgeCount` counts badge rows rather than summing them: a badge is a thing
 * you have or do not, and its `amount` is a 1 that exists only because the ledger
 * is one table.
 *
 * `currentStreak` is read rather than recomputed. Nothing in a read path may
 * advance a streak — the day it counts is the day something was *finished*, and
 * a child opening the home screen at midnight has not learned anything yet.
 */
export async function getRewardSummary(
  childId: string,
): Promise<RewardSummary> {
  const totals = await readTotals(prisma, childId);
  const streak = await prisma.streak.findUnique({
    where: { childId },
    select: { current: true },
  });

  return { ...totals, currentStreak: streak?.current ?? 0 };
}
