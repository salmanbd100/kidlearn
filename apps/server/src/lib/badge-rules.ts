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

/**
 * The badge rule engine (FR-GAM-04) — **badges are data, not code**.
 *
 * A `Badge` row carries a `ruleType` string and a `rule` JSONB blob, and this
 * file is the only place that knows what either means. Adding "finish 5 lessons
 * in Shapes" is then an admin writing a row (file 33), not a deploy.
 *
 * Two properties make that safe rather than merely flexible:
 *
 *  - **Every evaluator is pure.** They take pre-counted facts and return a
 *    boolean, so the whole rule table is testable without a database, and the
 *    queries that produce the counts live in one place
 *    (`services/achievementService.ts`) instead of once per rule.
 *  - **A bad row can never break a completion.** An unknown `ruleType` and a
 *    `rule` that fails its schema both warn and evaluate `false`. A child who
 *    finished a lesson gets their celebration whatever an admin typed into the
 *    CMS; the badge they did not get is a row an adult fixes later.
 */

/**
 * Everything the rules can ask about a child, counted once per completion.
 *
 * The topic lookups are functions rather than maps so a rule naming a topic that
 * does not exist reads as zero rather than as `undefined`.
 */
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
 *
 * Imported rather than declared here, because the CMS's guided form (file 33)
 * builds a payload against the same shapes and the admin API validates one with
 * them. Three parties, one definition — see `types/src/badges.ts` for why a
 * second copy is how a badge nobody can earn gets authored.
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

/**
 * Which topic a rule is about, if any.
 *
 * Exported so `achievementService` can decide which topics to count *before* it
 * counts them, without a second copy of the rule shapes: knowing that
 * `topicSlug` is the key is this file's business, not the caller's.
 */
const TopicScopedRuleSchema = z.object({ topicSlug: z.string().min(1) });

export function badgeRuleTopicSlug(rule: unknown): string | undefined {
  const result = TopicScopedRuleSchema.safeParse(rule);
  return result.success ? result.data.topicSlug : undefined;
}
