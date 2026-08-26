/**
 * Badge rules as shared vocabulary (FR-GAM-04).
 *
 * **Badges are data, not code**, and three parties have to agree about what that
 * data looks like: the engine that evaluates a rule
 * (`apps/server/src/lib/badge-rules.ts`, file 24), the admin API that writes one
 * (file 33), and the guided form in the CMS that builds it. This file is the one
 * definition all three read, so "which parameters does `streak_days` take" has a
 * single answer — the alternative is a form that offers a field the engine
 * ignores, producing a badge nobody can earn and no error anyone will see.
 *
 * The rule payloads are **not** versioned the way activity and quiz definitions
 * are: a `Badge` row is a handful of numbers an admin can retype, not authored
 * content with progress hanging off it, so `schemaVersion` would be ceremony. The
 * `.strict()` rule from `./primitives` still applies — a misspelled parameter
 * must be a validation error, not a silently dropped key that leaves the badge
 * evaluating against a default nobody chose.
 */
import { z } from "zod";

export const BADGE_RULE_TYPES = [
  "lessons_completed_in_topic",
  "stories_completed",
  "streak_days",
  "quiz_correct_in_topic",
] as const;
export const BadgeRuleTypeSchema = z.enum(BADGE_RULE_TYPES);
export type BadgeRuleType = z.infer<typeof BadgeRuleTypeSchema>;

/**
 * `"all"` means "every published lesson in the topic", so the badge does not need
 * re-authoring when the twenty-seventh letter lesson is published.
 */
export const LessonsCompletedInTopicRuleSchema = z
  .object({
    topicSlug: z.string().min(1),
    count: z.union([z.number().int().positive(), z.literal("all")]),
  })
  .strict();

export const StoriesCompletedRuleSchema = z
  .object({ count: z.number().int().positive() })
  .strict();

export const StreakDaysRuleSchema = z
  .object({ days: z.number().int().positive() })
  .strict();

export const QuizCorrectInTopicRuleSchema = z
  .object({ topicSlug: z.string().min(1), count: z.number().int().positive() })
  .strict();

/**
 * Which payload each rule type takes.
 *
 * A `Record` keyed by the union rather than four loose exports: the engine looks
 * a rule up by the string stored in the column, and the admin API picks the
 * schema to validate against the same way. Both index this object, so a rule type
 * added to `BADGE_RULE_TYPES` without a schema fails `pnpm typecheck` here rather
 * than at the moment a child fails to earn something.
 *
 * `satisfies` rather than an annotation, so indexing it keeps the *member* schema
 * and `z.infer` still narrows — an annotation would flatten every value to
 * `ZodTypeAny` and force a cast at the one place the parse result is used.
 */
export const BADGE_RULE_SCHEMAS = {
  lessons_completed_in_topic: LessonsCompletedInTopicRuleSchema,
  stories_completed: StoriesCompletedRuleSchema,
  streak_days: StreakDaysRuleSchema,
  quiz_correct_in_topic: QuizCorrectInTopicRuleSchema,
} satisfies Record<BadgeRuleType, z.ZodTypeAny>;

/**
 * Any legal rule payload, for describing a stored `Badge.rule` on the wire.
 *
 * A plain union rather than a discriminated one, because the payloads carry no
 * discriminant of their own — `ruleType` sits beside them in its own column. Two
 * members are structurally identical (`lessons_completed_in_topic` and
 * `quiz_correct_in_topic`), which costs nothing here: this schema answers "is
 * this a rule payload at all", and the column says which kind.
 */
export const BadgeRuleSchema = z.union([
  LessonsCompletedInTopicRuleSchema,
  StoriesCompletedRuleSchema,
  StreakDaysRuleSchema,
  QuizCorrectInTopicRuleSchema,
]);
export type BadgeRule = z.infer<typeof BadgeRuleSchema>;

/**
 * Which parameter names each rule type expects, in the order a form should show
 * them.
 *
 * Derived data the CMS renders its fieldset from, so the form is a function of
 * the vocabulary rather than a fourth copy of it. Kept as a literal rather than
 * introspected out of the Zod objects: `z.ZodObject.shape` is reachable, but
 * reading it would hand the form an ordering nobody chose and a `count` field it
 * could not tell apart from `days`.
 */
export const BADGE_RULE_PARAMETERS: Record<
  BadgeRuleType,
  readonly ("topicSlug" | "count" | "days")[]
> = {
  lessons_completed_in_topic: ["topicSlug", "count"],
  stories_completed: ["count"],
  streak_days: ["days"],
  quiz_correct_in_topic: ["topicSlug", "count"],
};
