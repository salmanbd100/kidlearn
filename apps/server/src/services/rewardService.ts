import { Prisma, type RewardType } from "@kidlearn/db";
import type {
  CompletionStreakResponse,
  NewBadgeResponse,
  NewCharacterResponse,
  StoryCompletionResponse,
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

// Stars and coins (FR-GAM-01, FR-GAM-02, FR-GAM-07).

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
  /**
   * Finishing a story (FR-STORY-07). Deliberately smaller than a lesson: a story
   * is read for its own sake, and a reward large enough to compete with a lesson
   * would turn page-turning into the cheaper way to earn.
   */
  storyCompletionStars: 1,
  storyCompletionCoins: 5,
} as const;

/** The reward sources this file grants. `sourceType` is a free-text column on
 *  the row; this union is what keeps the values in it a closed set. */
export type GrantSource =
  | "lesson_completion"
  | "quiz_completion"
  | "quiz_correct_answers"
  | "daily_activity"
  | "badge_unlock"
  /**
   * Written by file 26 when a child finishes a story (FR-STORY-07). Already read
   * in two places before the grant exists — `achievementService` counts these rows
   * for the story badges, and `storyService` derives a cover's `completed` flag
   * from them — so the value belongs in this union now rather than as a string
   * literal in three files that could disagree.
   */
  | "story_completion";

/** The story-completion `sourceType`, as a value. */
export const STORY_COMPLETION: GrantSource = "story_completion";

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

/** The key the unique index is on. */
function grantKey(spec: {
  rewardType: string;
  sourceType: string;
  sourceId: string | null;
}): string {
  return `${spec.rewardType}|${spec.sourceType}|${spec.sourceId}`;
}

/** Grants everything finishing this lesson is worth, once. */
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

/** Pays for finishing a story, once per story per child (FR-STORY-07). */
export async function grantStoryCompletion(
  childId: string,
  storyId: string,
): Promise<StoryCompletionResponse> {
  return withSerializationRetry(() =>
    grantStoryCompletionOnce(childId, storyId),
  );
}

function grantStoryCompletionOnce(
  childId: string,
  storyId: string,
): Promise<StoryCompletionResponse> {
  const specs: GrantSpec[] = [
    {
      rewardType: "star",
      amount: REWARD_RULES.storyCompletionStars,
      sourceType: "story_completion",
      sourceId: storyId,
    },
    {
      rewardType: "coin",
      amount: REWARD_RULES.storyCompletionCoins,
      sourceType: "story_completion",
      sourceId: storyId,
    },
  ];

  return prisma.$transaction(
    async (tx) => {
      const written = await tx.rewardLedger.createMany({
        data: specs.map((spec) => ({ childId, ...spec })),
        // The unique index is the idempotency guard; this keeps the losing side
        // of a double tap a no-op rather than a 500 at the end of a story.
        skipDuplicates: true,
      });

      if (written.count === 0) {
        return { alreadyCompleted: true, granted: null };
      }

      return {
        alreadyCompleted: false,
        granted: {
          stars: REWARD_RULES.storyCompletionStars,
          coins: REWARD_RULES.storyCompletionCoins,
        },
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

/** Every balance in one read. */
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

/** FR-GAM-06 — what the child has, for the strip on the home screen. */
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
