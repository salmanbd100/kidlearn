/**
 * Quiz question payload schemas (FR-QUIZ-07) — the single source of truth for
 * the JSONB stored in `QuizQuestion.definition`.
 *
 * Every format carries `prompt` plus `promptAudio` in both locales (FR-QUIZ-05):
 * a 3-year-old cannot read the question, so it must always be speakable.
 *
 * Option-count bounds: `mcq` is 3–4 per FR-QUIZ-01. The spec sets no bound on
 * the other formats, so `picture_select` mirrors mcq at 3–4 (it is the same
 * pick-one interaction), `drag_answer` allows 2–4 because a single blank with a
 * binary choice is a legitimate early-learner question, and `match_pair` uses
 * 2–6 per column to match `MatchActivitySchema` — the spec calls for the "same
 * shape rules as the match activity", and the two share one renderer.
 *
 * The union is a plain `z.union` for the same `ZodEffects` reason documented in
 * `../activity/schemas`, and the additive versioning rule in `../primitives`
 * applies here unchanged.
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

/**
 * The union, indexed by the `type` literal each member carries.
 *
 * **Parse with the member, not the union, wherever the type is already known.**
 * Zod reports a failed `z.union` as one `invalid_union` issue at the root, so
 * `flatten()` yields `{ _errors: ["Invalid input"] }` — a message no author can act
 * on and no form field can display. Parsing against `QUIZ_QUESTION_SCHEMAS.mcq`
 * instead yields `prompt.bn: Required`, which is the field that is actually wrong.
 *
 * It also makes the column/payload agreement check structural: the member carries
 * `type` as a literal, so a `match_pair` payload submitted as `mcq` fails on that
 * literal rather than needing a hand-written comparison.
 *
 * Shared rather than declared on each side, because both the admin API
 * (`adminEditorService`) and the CMS editor pick a schema this way, and the pair
 * disagreeing would mean an author allowed to save something the server refuses.
 * `satisfies` rather than an annotation, so indexing keeps the member type and
 * `z.infer` still narrows.
 */
export const QUIZ_QUESTION_SCHEMAS = {
  mcq: McqQuestionSchema,
  match_pair: MatchPairQuestionSchema,
  drag_answer: DragAnswerQuestionSchema,
  picture_select: PictureSelectQuestionSchema,
} satisfies Record<QuizQuestionType, z.ZodTypeAny>;
