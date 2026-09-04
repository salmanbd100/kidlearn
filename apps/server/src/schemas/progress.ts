/** Request schemas for `/api/progress` (`backend.md §2`). */
import {
  LessonStepReportSchema,
  QuizResponsesSubmitSchema,
  SessionEventReportSchema,
} from "@kidlearn/types";
import { z } from "zod";

export {
  LessonStepReportSchema as LessonStepBodySchema,
  QuizResponsesSubmitSchema as QuizResponsesBodySchema,
  SessionEventReportSchema as SessionEventBodySchema,
};

/**
 * A uuid, matching `/api/content/lessons/:id`. The two must agree: a lesson id
 * this router rejected as malformed while the content router accepted it would
 * make a lesson openable but unrecordable.
 */
export const LessonIdParamsSchema = z.object({ id: z.string().uuid() });

/**
 * Named `quizId` rather than `id` because the path segment is: the quiz is not
 * the resource `/api/progress` is otherwise about, and calling both `id` in one
 * router is how a handler ends up reading the wrong one.
 */
export const QuizIdParamsSchema = z.object({ quizId: z.string().uuid() });

/**
 * The reader's story id (file 26). Structurally identical to
 * `LessonIdParamsSchema` and declared separately anyway: the two happen to agree
 * today, and a shared alias would make a future change to one silently change the
 * other. It must match `/api/content/stories/:id` for the reason the lesson
 * schema gives — a story openable but uncompletable is worse than either.
 */
export const StoryIdParamsSchema = z.object({ id: z.string().uuid() });

export type LessonStepBody = z.infer<typeof LessonStepReportSchema>;
export type SessionEventBody = z.infer<typeof SessionEventReportSchema>;
export type QuizResponsesBody = z.infer<typeof QuizResponsesSubmitSchema>;
