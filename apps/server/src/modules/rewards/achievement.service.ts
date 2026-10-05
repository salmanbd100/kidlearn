import type { ChildProfile } from "@kidlearn/db";
import type {
  CharacterUnlockResponse,
  NewBadgeResponse,
  NewCharacterResponse,
} from "@kidlearn/types";
import { z } from "zod";
import { logger } from "../../config/logger.js";
import { prisma } from "../../config/prisma.js";
import {
  type BadgeFacts,
  badgeRuleTopicSlug,
  evaluateBadgeRule,
} from "../../shared/utils/badge-rules.js";
import { visibleLessonWhere } from "../../shared/utils/published-for-child.js";

/** Lets a transaction callback and the plain client be interchangeable. */
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

export interface UnlockTotals {
  stars: number;
  coins: number;
  badges: number;
}

/** Any combination of the three; all keys present must be met (an AND). */
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

export function meetsUnlockCriteria(
  unlockRule: unknown,
  totals: UnlockTotals,
): boolean {
  const parsed = UnlockRuleSchema.safeParse(unlockRule);
  if (!parsed.success) {
    // `{}` marks starter characters, handled by `isDefault`; only warn when somebody wrote a rule that meant something else.
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

async function loadBadgeFacts(
  tx: AchievementClient,
  child: ChildProfile,
  streakCurrent: number,
  topicSlugs: readonly string[],
): Promise<BadgeFacts> {
  const childId = child.id;
  const visible = visibleLessonWhere(child);
  const lessons =
    topicSlugs.length === 0
      ? []
      : await tx.lesson.findMany({
          // The child's visible lessons are the denominator for `count: "all"` and the content-safety guard (`backend.md §4`):
          // they cannot finish a lesson they cannot see.
          where: {
            ...visible,
            topic: {
              is: { ...visible.topic.is, slug: { in: [...topicSlugs] } },
            },
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
    // `LessonProgress` is unique on `(childId, lessonId)`, so no dedup is needed.
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

  // The latest response per question, as `rewardService` counts coins: with no fail state, "ever correct" would be constant `true`.
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

  // Counted from the ledger, not a `Story` join: the story player calls the same completion-reward service with the story as `sourceId`.
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

export async function findNewlyEarnedBadges(
  tx: AchievementClient,
  child: ChildProfile,
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
    where: { childId: child.id, rewardType: "badge" },
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

  const facts = await loadBadgeFacts(tx, child, streakCurrent, topicSlugs);

  return candidates
    .filter((badge) => evaluateBadgeRule(badge.ruleType, badge.rule, facts))
    .map((badge) => ({
      id: badge.id,
      slug: badge.slug,
      name: badge.name,
      iconUrl: badge.iconAsset?.url ?? null,
    }));
}

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
