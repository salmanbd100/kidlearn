/**
 * Quiz question payload schemas (FR-QUIZ-07) — the single source of truth for
 * the JSONB stored in `QuizQuestion.definition`.
 */
import { z } from "zod";
import {
  ImageAssetRefSchema,
  LocalizedAudioSchema,
  LocalizedTextSchema,
} from "../primitives.js";
import {
  addAnswerOptionIssues,
  addDuplicateIdIssues,
  addPairingIssues,
  addSingleBlankTokenIssues,
} from "../refinements.js";

/**
 * The `satisfies` clause is the drift guard: an entry here that no union member
 * declares is a compile error. The reverse direction — a union member missing
 * from this list — is covered by the coverage test in `./schemas.test.ts`.
 */
export const QUIZ_QUESTION_TYPES = [
  "mcq",
  "match_pair",
  "drag_answer",
  "picture_select",
] as const satisfies readonly QuizQuestionDefinition["type"][];
export const QuizQuestionTypeSchema = z.enum(QUIZ_QUESTION_TYPES);
export type QuizQuestionType = z.infer<typeof QuizQuestionTypeSchema>;

/** An answer choice. Needs `text` or `image` to be perceivable — enforced per format. */
const QuizOptionSchema = z
  .object({
    id: z.string().min(1),
    text: LocalizedTextSchema.optional(),
    image: ImageAssetRefSchema.optional(),
    audio: LocalizedAudioSchema.optional(),
  })
  .strict();
export type QuizOption = z.infer<typeof QuizOptionSchema>;

/** `picture_select` is picture-first, so the image stops being optional (FR-QUIZ-04). */
const PictureQuizOptionSchema = QuizOptionSchema.extend({
  image: ImageAssetRefSchema,
});
export type PictureQuizOption = z.infer<typeof PictureQuizOptionSchema>;

export const McqQuestionSchema = z
  .object({
    schemaVersion: z.literal(1),
    type: z.literal("mcq"),
    prompt: LocalizedTextSchema,
    promptAudio: LocalizedAudioSchema,
    options: z.array(QuizOptionSchema).min(3).max(4),
    correctOptionId: z.string().min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    addAnswerOptionIssues(ctx, value.options, value.correctOptionId);
  });
export type McqQuestion = z.infer<typeof McqQuestionSchema>;

export const MatchPairQuestionSchema = z
  .object({
    schemaVersion: z.literal(1),
    type: z.literal("match_pair"),
    prompt: LocalizedTextSchema,
    promptAudio: LocalizedAudioSchema,
    leftColumn: z.array(QuizOptionSchema).min(2).max(6),
    rightColumn: z.array(QuizOptionSchema).min(2).max(6),
    correctPairs: z
      .array(
        z
          .object({ leftId: z.string().min(1), rightId: z.string().min(1) })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    addDuplicateIdIssues(ctx, value.leftColumn, "leftColumn");
    addDuplicateIdIssues(ctx, value.rightColumn, "rightColumn");
    addPairingIssues(
      ctx,
      value.leftColumn,
      value.rightColumn,
      value.correctPairs,
      "correctPairs",
    );

    for (const [field, column] of [
      ["leftColumn", value.leftColumn],
      ["rightColumn", value.rightColumn],
    ] as const) {
      column.forEach((option, index) => {
        if (option.text === undefined && option.image === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field, index],
            message: "each option needs text or image",
          });
        }
      });
    }
  });
export type MatchPairQuestion = z.infer<typeof MatchPairQuestionSchema>;

export const DragAnswerQuestionSchema = z
  .object({
    schemaVersion: z.literal(1),
    type: z.literal("drag_answer"),
    prompt: LocalizedTextSchema,
    promptAudio: LocalizedAudioSchema,
    /** Carries exactly one `{blank}` token per locale — the drop position. */
    sentence: LocalizedTextSchema,
    options: z.array(QuizOptionSchema).min(2).max(4),
    correctOptionId: z.string().min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    addAnswerOptionIssues(ctx, value.options, value.correctOptionId);
    addSingleBlankTokenIssues(ctx, value.sentence, "sentence");
  });
export type DragAnswerQuestion = z.infer<typeof DragAnswerQuestionSchema>;

export const PictureSelectQuestionSchema = z
  .object({
    schemaVersion: z.literal(1),
    type: z.literal("picture_select"),
    prompt: LocalizedTextSchema,
    promptAudio: LocalizedAudioSchema,
    options: z.array(PictureQuizOptionSchema).min(3).max(4),
    correctOptionId: z.string().min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    addAnswerOptionIssues(ctx, value.options, value.correctOptionId);
  });
export type PictureSelectQuestion = z.infer<typeof PictureSelectQuestionSchema>;

export const QuizQuestionSchema = z.union([
  McqQuestionSchema,
  MatchPairQuestionSchema,
  DragAnswerQuestionSchema,
  PictureSelectQuestionSchema,
]);
export type QuizQuestionDefinition = z.infer<typeof QuizQuestionSchema>;

/** The union, indexed by the `type` literal each member carries. */
export const QUIZ_QUESTION_SCHEMAS = {
  mcq: McqQuestionSchema,
  match_pair: MatchPairQuestionSchema,
  drag_answer: DragAnswerQuestionSchema,
  picture_select: PictureSelectQuestionSchema,
} satisfies Record<QuizQuestionType, z.ZodTypeAny>;
