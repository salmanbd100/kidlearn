/**
 * Request schemas for `/api/progress` (`backend.md §2`).
 *
 * The two bodies live in `@kidlearn/types` because the lesson player and this
 * router are both consumers of them — the player builds each payload from the same
 * object `validate()` parses it with, so the client cannot invent a step name or a
 * `completed` flag the server would reject. This file stays the import path for
 * `validate()` and the OpenAPI document.
 *
 * `LessonIdParamsSchema` is declared here rather than shared: a path-parameter
 * shape is an HTTP detail with no client half.
 */
import {
  LessonStepReportSchema,
  SessionEventReportSchema,
} from "@kidlearn/types";
import { z } from "zod";

export {
  LessonStepReportSchema as LessonStepBodySchema,
  SessionEventReportSchema as SessionEventBodySchema,
};

/**
 * A uuid, matching `/api/content/lessons/:id`. The two must agree: a lesson id
 * this router rejected as malformed while the content router accepted it would
 * make a lesson openable but unrecordable.
 */
export const LessonIdParamsSchema = z.object({ id: z.string().uuid() });

export type LessonStepBody = z.infer<typeof LessonStepReportSchema>;
export type SessionEventBody = z.infer<typeof SessionEventReportSchema>;
