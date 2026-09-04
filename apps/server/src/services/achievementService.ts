import type {
  CharacterUnlockResponse,
  NewBadgeResponse,
  NewCharacterResponse,
} from "@kidlearn/types";
import { z } from "zod";
import {
  type BadgeFacts,
  badgeRuleTopicSlug,
  evaluateBadgeRule,
} from "../lib/badge-rules.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";

// Badge milestones and character unlocks (FR-GAM-04, FR-GAM-05).

/** The slice of the client these need, so a transaction callback and the plain
 *  client are interchangeable. */
type AchievementClient = {
  badge: { findMany: typeof prisma.badge.findMany };
  character: { findMany: typeof prisma.character.findMany };
  childCharacter: {
    findMany: typeof prisma.childCharacter.findMany;
    createMany: typeof prisma.childCharacter.createMany;
  };
  lesson: { findMany: typeof prisma.lesson.findMany };
  lessonProgress: { findMany: typeof prisma.lessonProgress.findMany };
  quizResponse: { findMany: typeof prisma.quizResponse.findMany };
  rewardLedger: { findMany: typeof prisma.rewardLedger.findMany };
};

/** What a completion is measured against when unlocking characters. */
export interface UnlockTotals {
  stars: number;
  coins: number;
  badges: number;
}

/**
 * The MVP unlock criteria. Any combination of the three, and **all** the keys
 * present must be met — an `AND`, because `{ stars: 10, coins: 50 }` reads as
 * "ten stars and fifty coins" to everybody who writes one.
 */
const UnlockRuleSchema = z
  .object({
    stars: z.number().int().positive().optional(),
    coins: z.number().int().positive().optional(),
    badges: z.number().int().positive().optional(),
  })
  .strict()
  .refine((rule) => Object.keys(rule).length > 0, {
    message: "an unlock rule must name at least one criterion",
  });

/** Whether these totals satisfy a character's `unlockRule`. */
export function meetsUnlockCriteria(
  unlockRule: unknown,
  totals: UnlockTotals,
): boolean {
  const parsed = UnlockRuleSchema.safeParse(unlockRule);
  if (!parsed.success) {
    // `{}` is the ordinary marker on every starter character, and those are
    // handled by `isDefault` rather than by a rule — so this is only worth a
    // warning when somebody wrote a rule that meant something else.
    if (Object.keys(unlockRule ?? {}).length > 0) {
      logger.warn(
        { unlockRule, issues: parsed.error.issues },
        "character unlockRule is malformed — leaving the character locked",
      );
    }
    return false;
  }

  return Object.entries(parsed.data).every(
    ([criterion, required]) =>
      totals[criterion as keyof UnlockTotals] >= required,
  );
}

/** Counts everything the candidate badges ask about, in four reads. */
async function loadBadgeFacts(
  tx: AchievementClient,
  childId: string,
  streakCurrent: number,
  topicSlugs: readonly string[],
): Promise<BadgeFacts> {
  const lessons =
    topicSlugs.length === 0
      ? []
      : await tx.lesson.findMany({
          // `status: "published"` is the honest denominator for a `count: "all"`
          // rule as well as the content-safety guard (`backend.md §4`): a child
          // cannot finish a draft lesson, so one must not hold their badge back.
          where: {
            status: "published",
            topic: { is: { slug: { in: [...topicSlugs] } } },
          },
          select: {
            id: true,
            topic: { select: { slug: true } },
            quiz: { select: { questions: { select: { id: true } } } },
          },
        });

  const topicOfLesson = new Map(
    lessons.map((lesson) => [lesson.id, lesson.topic.slug]),
  );
  const topicOfQuestion = new Map<string, string>();
  const publishedPerTopic = new Map<string, number>();
  for (const lesson of lessons) {
    const slug = lesson.topic.slug;
    publishedPerTopic.set(slug, (publishedPerTopic.get(slug) ?? 0) + 1);
    for (const question of lesson.quiz?.questions ?? []) {
      topicOfQuestion.set(question.id, slug);
    }
  }

  const completedRows =
    lessons.length === 0
      ? []
      : await tx.lessonProgress.findMany({
          where: {
            childId,
            completedAt: { not: null },
            lessonId: { in: [...topicOfLesson.keys()] },
          },
          select: { lessonId: true },
        });

  const completedPerTopic = new Map<string, number>();
  for (const row of completedRows) {
    // `LessonProgress` is unique on `(childId, lessonId)`, so the rows are
    // already one per lesson — "distinct completed lessons" needs no dedup.
    const slug = topicOfLesson.get(row.lessonId);
    if (slug === undefined) continue;
    completedPerTopic.set(slug, (completedPerTopic.get(slug) ?? 0) + 1);
  }

  const responses =
    topicOfQuestion.size === 0
      ? []
      : await tx.quizResponse.findMany({
          where: { childId, questionId: { in: [...topicOfQuestion.keys()] } },
          select: { questionId: true, isCorrect: true },
          orderBy: { answeredAt: "desc" },
        });

  // The *latest* response per question, matching how `rewardService` counts
  // coins: a quiz here has no fail state, so "ever answered correctly" would be
  // a constant `true` and "20 animals identified" would mean nothing.
  const latestCorrect = new Map<string, boolean>();
  for (const response of responses) {
    if (!latestCorrect.has(response.questionId)) {
      latestCorrect.set(response.questionId, response.isCorrect);
    }
  }

  const correctPerTopic = new Map<string, number>();
  for (const [questionId, isCorrect] of latestCorrect) {
    if (!isCorrect) continue;
    const slug = topicOfQuestion.get(questionId);
    if (slug === undefined) continue;
    correctPerTopic.set(slug, (correctPerTopic.get(slug) ?? 0) + 1);
  }

  // Counted from the ledger rather than from a `Story` join, so the evaluator is
  // ready before file 26 exists and needs no change when it arrives: the story
  // player calls the same completion-reward service, and `sourceId` is the story.
  const storyGrants = await tx.rewardLedger.findMany({
    where: { childId, sourceType: "story_completion" },
    select: { sourceId: true },
  });

  return {
    lessonsInTopic: (slug) => ({
      completed: completedPerTopic.get(slug) ?? 0,
      totalPublished: publishedPerTopic.get(slug) ?? 0,
    }),
    storiesCompleted: new Set(storyGrants.map((row) => row.sourceId)).size,
    streakCurrent,
    correctQuestionsInTopic: (slug) => correctPerTopic.get(slug) ?? 0,
  };
}

/** Which published badges this child has just qualified for (FR-GAM-04). */
export async function findNewlyEarnedBadges(
  tx: AchievementClient,
  childId: string,
  streakCurrent: number,
): Promise<NewBadgeResponse[]> {
  const badges = await tx.badge.findMany({
    where: { status: "published" },
    select: {
      id: true,
      slug: true,
      name: true,
      ruleType: true,
      rule: true,
      iconAsset: { select: { url: true } },
    },
  });
  if (badges.length === 0) return [];

  const earned = await tx.rewardLedger.findMany({
    where: { childId, rewardType: "badge" },
    select: { badgeId: true },
  });
  const earnedIds = new Set(earned.map((row) => row.badgeId));

  const candidates = badges.filter((badge) => !earnedIds.has(badge.id));
  if (candidates.length === 0) return [];

  const topicSlugs = [
    ...new Set(
      candidates
        .map((badge) => badgeRuleTopicSlug(badge.rule))
        .filter((slug): slug is string => slug !== undefined),
    ),
  ];

  const facts = await loadBadgeFacts(tx, childId, streakCurrent, topicSlugs);

  return candidates
    .filter((badge) => evaluateBadgeRule(badge.ruleType, badge.rule, facts))
    .map((badge) => ({
      id: badge.id,
      slug: badge.slug,
      name: badge.name,
      iconUrl: badge.iconAsset?.url ?? null,
    }));
}

/** Grants any characters this child's totals have just unlocked (FR-GAM-05). */
export async function unlockCharacters(
  tx: AchievementClient,
  childId: string,
  totals: UnlockTotals,
): Promise<NewCharacterResponse[]> {
  const characters = await tx.character.findMany({
    where: { status: "published", isDefault: false },
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      unlockRule: true,
      asset: { select: { url: true } },
    },
  });
  if (characters.length === 0) return [];

  const owned = await tx.childCharacter.findMany({
    where: { childId },
    select: { characterId: true },
  });
  const ownedIds = new Set(owned.map((row) => row.characterId));

  const newly = characters.filter(
    (character) =>
      !ownedIds.has(character.id) &&
      meetsUnlockCriteria(character.unlockRule, totals),
  );
  if (newly.length === 0) return [];

  await tx.childCharacter.createMany({
    data: newly.map((character) => ({ childId, characterId: character.id })),
    // The unique index on `(childId, characterId)` is the real guard; this keeps
    // a losing race a no-op rather than a 500 in the middle of a celebration.
    skipDuplicates: true,
  });

  return newly.map((character) => ({
    id: character.id,
    slug: character.slug,
    name: character.name,
    imageUrl: character.asset?.url ?? null,
  }));
}

/**
 * Every published character, flagged with whether this child may wear it
 * (FR-GAM-05).
 */
export async function listCharactersForChild(
  childId: string,
): Promise<CharacterUnlockResponse[]> {
  const characters = await prisma.character.findMany({
    where: { status: "published" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      isDefault: true,
      asset: { select: { url: true } },
      // Scoped to this child, so the flag below cannot be another child's unlock.
      unlocks: { where: { childId }, select: { id: true } },
    },
  });

  return characters.map((character) => ({
    id: character.id,
    slug: character.slug,
    name: character.name,
    imageUrl: character.asset?.url ?? null,
    isDefault: character.isDefault,
    isUnlocked: character.isDefault || character.unlocks.length > 0,
  }));
}
