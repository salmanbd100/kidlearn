import {
  BADGE_RULE_SCHEMAS,
  type BadgeRuleType,
  LessonsCompletedInTopicRuleSchema,
  QuizCorrectInTopicRuleSchema,
  StoriesCompletedRuleSchema,
  StreakDaysRuleSchema,
} from "@kidlearn/types";
import { z } from "zod";
import { logger } from "./logger.js";

// The badge rule engine (FR-GAM-04) — **badges are data, not code**.

/** Everything the rules can ask about a child, counted once per completion. */
export interface BadgeFacts {
  /** Completed and published lesson counts for one topic. */
  lessonsInTopic: (topicSlug: string) => {
    completed: number;
    totalPublished: number;
  };
  /** Distinct stories finished, from `story_completion` ledger rows (file 26). */
  storiesCompleted: number;
  /** `Streak.current` **after** this completion's streak update. */
  streakCurrent: number;
  /** Questions in the topic whose *latest* response was correct. */
  correctQuestionsInTopic: (topicSlug: string) => number;
}

/**
 * The rule payload shapes, from `@kidlearn/types`.
 */
type Evaluator = (rule: unknown, facts: BadgeFacts) => boolean;

/**
 * Parses the rule payload, then evaluates it. A malformed payload is warned
 * about and counts as unmet — never thrown, for the reason in the file
 * docstring.
 */
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

/**
 * One evaluator per rule type. Keyed by the shared union rather than `string`, so
 * a type added to `BADGE_RULE_TYPES` without an evaluator here fails
 * `pnpm typecheck` — the admin API would otherwise happily author a badge that
 * `evaluateBadgeRule` warns about and nobody can earn.
 */
export const BADGE_RULE_EVALUATORS: Record<BadgeRuleType, Evaluator> = {
  lessons_completed_in_topic: (rule, facts) =>
    parsed(
      LessonsCompletedInTopicRuleSchema,
      "lessons_completed_in_topic",
      rule,
      ({ topicSlug, count }) => {
        const { completed, totalPublished } = facts.lessonsInTopic(topicSlug);
        // A topic with nothing published in it is not "all done" — otherwise an
        // empty or unpublished topic would hand out its badge to everyone.
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
  // The column is a plain `String`, so a row can name a type this build does not
  // know — a seed from a later version, or a hand-written row. Looked up through
  // the shared table rather than narrowed, and an absence warns rather than
  // throws (see the file docstring).
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

/** Which topic a rule is about, if any. */
const TopicScopedRuleSchema = z.object({ topicSlug: z.string().min(1) });

export function badgeRuleTopicSlug(rule: unknown): string | undefined {
  const result = TopicScopedRuleSchema.safeParse(rule);
  return result.success ? result.data.topicSlug : undefined;
}
