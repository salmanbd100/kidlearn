import {
  AiJobStatusSchema,
  GenerateLessonSchema,
  GenerateQuizSchema,
  GenerateStorySchema,
  QuizQuestionTypeSchema,
} from "@kidlearn/types";
import { z } from "zod";

/**
 * Tool arguments, validated by the handler with Zod 3. Content (`lesson`, `story`, `questions`) is `unknown` here
 * and parsed by the same per-request schema the Gemini path uses; `*_HINT` below is only what `tools/list`
 * advertises about its shape (D6: no client is asked to accept the full quiz union).
 */

const ClientRequestIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .describe(
    "An id you choose for this piece of content. Re-sending it returns the first draft instead of creating a second, so a retry is safe.",
  );

export const SubmitLessonArgsSchema = GenerateLessonSchema.extend({
  clientRequestId: ClientRequestIdSchema.optional(),
  lesson: z.unknown(),
});

export const SubmitStoryArgsSchema = GenerateStorySchema.omit({
  pageCount: true,
}).extend({
  clientRequestId: ClientRequestIdSchema.optional(),
  story: z.unknown(),
});

export const SubmitQuizArgsSchema = GenerateQuizSchema.omit({
  count: true,
}).extend({
  clientRequestId: ClientRequestIdSchema.optional(),
  questions: z.unknown(),
});

const LocalizedHint = z
  .record(z.string())
  .describe("Keyed by language code, one entry per requested language.");

const QuestionHint = z
  .object({ type: QuizQuestionTypeSchema })
  .passthrough()
  .describe(
    "One quiz question. Its exact shape depends on `type`: call get_quiz_format_schema.",
  );

const LessonHint = z
  .object({
    title: LocalizedHint,
    learningObjectives: z.array(z.string()),
    introScript: LocalizedHint,
    narrationScript: LocalizedHint,
    quizQuestions: z.array(QuestionHint),
  })
  .partial()
  .passthrough()
  .describe("The lesson. Every field is required; see get_authoring_guide.");

const StoryHint = z
  .object({
    title: LocalizedHint,
    moral: LocalizedHint,
    characterDescriptions: z.array(
      z
        .object({
          name: z.string(),
          kind: z.string(),
          visualDescription: z.string(),
        })
        .partial()
        .passthrough(),
    ),
    pages: z.array(
      z
        .object({
          pageNumber: z.number().int(),
          text: LocalizedHint,
          illustrationPrompt: z.string(),
        })
        .partial()
        .passthrough(),
    ),
  })
  .partial()
  .passthrough()
  .describe("The story. Every field is required; see get_authoring_guide.");

export const SubmitLessonToolSchema = SubmitLessonArgsSchema.extend({
  lesson: LessonHint,
});
export const SubmitStoryToolSchema = SubmitStoryArgsSchema.extend({
  story: StoryHint,
});
export const SubmitQuizToolSchema = SubmitQuizArgsSchema.extend({
  questions: z.array(QuestionHint),
});

export const ListCurriculumArgsSchema = z
  .object({ subjectId: z.string().uuid().optional() })
  .strict();

export const LessonIdArgsSchema = z
  .object({ lessonId: z.string().uuid() })
  .strict();

export const ListCharactersArgsSchema = z
  .object({ worldId: z.string().uuid().optional() })
  .strict();

export const QuizFormatArgsSchema = z
  .object({ format: QuizQuestionTypeSchema })
  .strict();

export const JobIdArgsSchema = z.object({ jobId: z.string().uuid() }).strict();

export const ListMyDraftsArgsSchema = z
  .object({
    status: AiJobStatusSchema.optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict();

export const StoryIdArgsSchema = z
  .object({ storyId: z.string().uuid() })
  .strict();
