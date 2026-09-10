/** Badge rules as shared vocabulary (FR-GAM-04). */
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

/** Which payload each rule type takes. */
export const BADGE_RULE_SCHEMAS = {
  lessons_completed_in_topic: LessonsCompletedInTopicRuleSchema,
  stories_completed: StoriesCompletedRuleSchema,
  streak_days: StreakDaysRuleSchema,
  quiz_correct_in_topic: QuizCorrectInTopicRuleSchema,
} satisfies Record<BadgeRuleType, z.ZodTypeAny>;

/** Any legal rule payload, for describing a stored `Badge.rule` on the wire. */
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
