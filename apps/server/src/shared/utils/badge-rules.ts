import {
  BADGE_RULE_SCHEMAS,
  type BadgeRuleType,
  LessonsCompletedInTopicRuleSchema,
  QuizCorrectInTopicRuleSchema,
  StoriesCompletedRuleSchema,
  StreakDaysRuleSchema,
} from "@kidlearn/types";
import { z } from "zod";
import { logger } from "../../config/logger.js";

// Badges are data, not code (FR-GAM-04). A malformed or unknown rule warns and counts as unmet, never throws,
// so a bad admin row cannot break a lesson completion.

export interface BadgeFacts {
  lessonsInTopic: (topicSlug: string) => {
    completed: number;
    totalPublished: number;
  };
  storiesCompleted: number;
  streakCurrent: number;
  correctQuestionsInTopic: (topicSlug: string) => number;
}

type Evaluator = (rule: unknown, facts: BadgeFacts) => boolean;

function parsed<TRule>(
  schema: z.ZodType<TRule>,
  ruleType: string,
  rule: unknown,
  evaluate: (rule: TRule) => boolean,
): boolean {
  const result = schema.safeParse(rule);
  if (!result.success) {
    logger.warn(
      { ruleType, rule, issues: result.error.issues },
      "badge rule payload is malformed — treating the badge as unearned",
    );
    return false;
  }
  return evaluate(result.data);
}

/** Keyed by the shared union, so a rule type added without an evaluator fails `pnpm typecheck`. */
export const BADGE_RULE_EVALUATORS: Record<BadgeRuleType, Evaluator> = {
  lessons_completed_in_topic: (rule, facts) =>
    parsed(
      LessonsCompletedInTopicRuleSchema,
      "lessons_completed_in_topic",
      rule,
      ({ topicSlug, count }) => {
        const { completed, totalPublished } = facts.lessonsInTopic(topicSlug);
        // A topic with nothing published is not "all done"; otherwise its badge goes to everyone.
        if (count === "all") {
          return totalPublished > 0 && completed >= totalPublished;
        }
        return completed >= count;
      },
    ),

  stories_completed: (rule, facts) =>
    parsed(
      StoriesCompletedRuleSchema,
      "stories_completed",
      rule,
      ({ count }) => facts.storiesCompleted >= count,
    ),

  streak_days: (rule, facts) =>
    parsed(
      StreakDaysRuleSchema,
      "streak_days",
      rule,
      ({ days }) => facts.streakCurrent >= days,
    ),

  quiz_correct_in_topic: (rule, facts) =>
    parsed(
      QuizCorrectInTopicRuleSchema,
      "quiz_correct_in_topic",
      rule,
      ({ topicSlug, count }) =>
        facts.correctQuestionsInTopic(topicSlug) >= count,
    ),
};

function isBadgeRuleType(value: string): value is BadgeRuleType {
  return value in BADGE_RULE_SCHEMAS;
}

export function evaluateBadgeRule(
  ruleType: string,
  rule: unknown,
  facts: BadgeFacts,
): boolean {
  // The column is a plain `String`, so a row can name a type this build does not know; warn rather than throw.
  const evaluator = isBadgeRuleType(ruleType)
    ? BADGE_RULE_EVALUATORS[ruleType]
    : undefined;
  if (evaluator === undefined) {
    logger.warn(
      { ruleType },
      "unknown badge ruleType — treating the badge as unearned",
    );
    return false;
  }
  return evaluator(rule, facts);
}

const TopicScopedRuleSchema = z.object({ topicSlug: z.string().min(1) });

export function badgeRuleTopicSlug(rule: unknown): string | undefined {
  const result = TopicScopedRuleSchema.safeParse(rule);
  return result.success ? result.data.topicSlug : undefined;
}
