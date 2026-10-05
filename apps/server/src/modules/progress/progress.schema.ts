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

/** A uuid matching `/api/content/lessons/:id`: an id this router rejects while content accepts would be openable but unrecordable. */
export const LessonIdParamsSchema = z.object({ id: z.string().uuid() });

/** `quizId` not `id`: the quiz is not the resource this router is otherwise about, and two `id`s invites reading the wrong one. */
export const QuizIdParamsSchema = z.object({ quizId: z.string().uuid() });

/** Identical to `LessonIdParamsSchema` but declared separately so a change to one cannot silently change the other; must match `/api/content/stories/:id`. */
export const StoryIdParamsSchema = z.object({ id: z.string().uuid() });

export type LessonStepBody = z.infer<typeof LessonStepReportSchema>;
export type SessionEventBody = z.infer<typeof SessionEventReportSchema>;
export type QuizResponsesBody = z.infer<typeof QuizResponsesSubmitSchema>;
