import { type ChildProfile, Prisma, type RewardType } from "@kidlearn/db";
import type {
  CompletionStreakResponse,
  NewBadgeResponse,
  NewCharacterResponse,
  StoryCompletionResponse,
} from "@kidlearn/types";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { localDateIn } from "../../shared/utils/local-date.js";
import { isPublished } from "../../shared/utils/published-for-child.js";
import { withSerializationRetry } from "../../shared/utils/serializable-retry.js";
import {
  findNewlyEarnedBadges,
  unlockCharacters,
} from "./achievement.service.js";
import { liveStreakLength, updateStreakForActivity } from "./streak.service.js";

/** Fixed constants deliberately: a tunable knob shipped before anything can turn it ends up configurable in three places and authoritative in none. */
export const REWARD_RULES = {
  lessonCompletionStars: 2,
  quizCompletionStars: 1,
  coinsPerCorrectAnswer: 2,
  firstActivityOfDayCoins: 5,
  /** Smaller than a lesson (FR-STORY-07): a reward that competes with a lesson would make page-turning the cheaper way to earn. */
  storyCompletionStars: 1,
  storyCompletionCoins: 5,
} as const;

/** `sourceType` is free text on the row; this union keeps its values a closed set. */
export type GrantSource =
  | "lesson_completion"
  | "quiz_completion"
  | "quiz_correct_answers"
  | "daily_activity"
  | "badge_unlock"
  /** A child finishing a story (FR-STORY-07); read by `achievementService` and `storyService`, so it belongs in the union rather than as literals in three files. */
  | "story_completion";

export const STORY_COMPLETION: GrantSource = "story_completion";

export interface GrantSpec {
  rewardType: Extract<RewardType, "star" | "coin">;
  amount: number;
  sourceType: GrantSource;
  /** Always set: Postgres treats NULL as distinct in a unique index, so a grant without one escapes the idempotency guard. */
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

export function computeLessonGrants(input: GrantInput): GrantSpec[] {
  const specs: GrantSpec[] = [
    {
      rewardType: "star",
      amount: REWARD_RULES.lessonCompletionStars,
      sourceType: "lesson_completion",
      sourceId: input.lessonId,
    },
  ];

  // Finishing the quiz, not passing it: there is no pass, so this star is for turning up.
  if (input.quizAttempted) {
    specs.push({
      rewardType: "star",
      amount: REWARD_RULES.quizCompletionStars,
      sourceType: "quiz_completion",
      sourceId: input.lessonId,
    });
  }

  // One row for the whole quiz so the grant has a stable `sourceId`. A better replay earns nothing extra:
  // paying the difference would make a balance reward repetition.
  if (input.correctCount > 0) {
    specs.push({
      rewardType: "coin",
      amount: REWARD_RULES.coinsPerCorrectAnswer * input.correctCount,
      sourceType: "quiz_correct_answers",
      sourceId: input.lessonId,
    });
  }

  // The local date is the idempotency key: "once a day" and "once a lesson" become the same constraint.
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
  streak: CompletionStreakResponse;
  totals: RewardTotals;
}

export interface RewardSummary extends RewardTotals {
  badgeCount: number;
  currentStreak: number;
}

function grantKey(spec: {
  rewardType: string;
  sourceType: string;
  sourceId: string | null;
}): string {
  return `${spec.rewardType}|${spec.sourceType}|${spec.sourceId}`;
}

export async function grantLessonCompletion(
  child: ChildProfile,
  lessonId: string,
): Promise<CompletionRewards> {
  // Read once and passed in so a retry cannot straddle local midnight and take the day's coins under two keys.
  const localDate = localDateIn(env.APP_TIMEZONE, new Date());

  return withSerializationRetry(() =>
    grantLessonCompletionOnce(child, lessonId, localDate),
  );
}

function grantLessonCompletionOnce(
  child: ChildProfile,
  lessonId: string,
  localDate: string,
): Promise<CompletionRewards> {
  const childId = child.id;
  return prisma.$transaction(
    async (tx) => {
      const { quizAttempted, correctCount } = await readQuizOutcome(
        tx,
        childId,
        lessonId,
      );

      // One read answers both: whether today's daily grant exists and which of this lesson's grants already do.
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
          // Belt to the isolation level's braces: keeps a losing race a no-op rather than a 500 mid-celebration.
          skipDuplicates: true,
        });
      }

      // Order is load-bearing: the streak must be current before a `streak_days` badge is evaluated,
      // and badges must be in the ledger before a `{ badges: n }` character.
      const streak = await updateStreakForActivity(tx, childId, localDate);

      const newBadges = await findNewlyEarnedBadges(tx, child, streak.current);
      if (newBadges.length > 0) {
        await tx.rewardLedger.createMany({
          // `amount: 1` because the ledger is one table. `sourceId` is the slug so the row stays readable,
          // and is set because a NULL escapes the unique index (see `GrantSpec`).
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
        // `longest` is deliberately left out of the response (see `CompletionStreakSchema`).
        streak: { current: streak.current, milestone: streak.milestone },
        totals: { stars: totals.stars, coins: totals.coins },
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function grantStoryCompletion(
  child: ChildProfile,
  storyId: string,
): Promise<StoryCompletionResponse> {
  // Read once and passed in, as in `grantLessonCompletion`, so a retry cannot straddle local midnight.
  const localDate = localDateIn(env.APP_TIMEZONE, new Date());

  return withSerializationRetry(() =>
    grantStoryCompletionOnce(child, storyId, localDate),
  );
}

function grantStoryCompletionOnce(
  child: ChildProfile,
  storyId: string,
  localDate: string,
): Promise<StoryCompletionResponse> {
  const childId = child.id;
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
        // The unique index is the guard; this keeps the losing side of a double tap a no-op rather than a 500.
        skipDuplicates: true,
      });

      // Reading is a learning activity, so it moves the streak even when nothing paid out (FR-GAM-06);
      // `updateStreakForActivity` is a no-op on an already-counted day.
      const streak = await updateStreakForActivity(tx, childId, localDate);

      // The same three steps, in the same load-bearing order as a lesson completion; otherwise a child
      // who only reads would never earn the `stories_completed` badge (FR-GAM-04).
      const newBadges = await findNewlyEarnedBadges(tx, child, streak.current);
      if (newBadges.length > 0) {
        await tx.rewardLedger.createMany({
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

      return {
        alreadyCompleted: written.count === 0,
        granted:
          written.count === 0
            ? null
            : {
                stars: REWARD_RULES.storyCompletionStars,
                coins: REWARD_RULES.storyCompletionCoins,
              },
        newBadges,
        newCharacters,
        streak: { current: streak.current, milestone: streak.milestone },
        totals: { stars: totals.stars, coins: totals.coins },
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

/** Lets a transaction callback and the plain client be interchangeable. */
type LedgerReader = {
  lesson: { findUnique: typeof prisma.lesson.findUnique };
  quizResponse: { findMany: typeof prisma.quizResponse.findMany };
  rewardLedger: { groupBy: typeof prisma.rewardLedger.groupBy };
};

/** Derived from the stored responses, not the request: a client that could report its own `correctCount` could report any number of coins. */
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

  // A lesson may have no quiz or one still in review (ordinary authoring states); an unpublished quiz pays no star, as it is not served.
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

export async function getRewardSummary(
  childId: string,
): Promise<RewardSummary> {
  const totals = await readTotals(prisma, childId);
  const streak = await prisma.streak.findUnique({
    where: { childId },
    select: { current: true, lastActivityDate: true },
  });

  return {
    ...totals,
    currentStreak: liveStreakLength(streak, env.APP_TIMEZONE),
  };
}
