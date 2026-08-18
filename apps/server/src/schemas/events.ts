/**
 * Request schemas for `/api/events` and the learning-time read (`backend.md §2`).
 *
 * Both shapes live in `@kidlearn/types` because a client writes both: the student
 * surfaces post activity events, and the dashboard names a range. This file stays
 * the import path `validate()` and the OpenAPI document use, matching
 * `schemas/progress.ts`.
 *
 * There is no schema for the heartbeat, and that is the contract: it has no body.
 * A beat that could carry a field would be a beat that could carry a duration.
 */
import {
  ActivityEventReportSchema,
  LearningTimeRangeSchema,
} from "@kidlearn/types";
import { z } from "zod";

export { ActivityEventReportSchema as ActivityEventBodySchema };

/**
 * `?range=today|week|month`, required.
 *
 * No default: a caller that omitted it is more likely to have a bug than to want
 * today, and a silent default would make the `from`/`to` in the response the only
 * clue about which window was actually measured.
 */
export const LearningTimeQuerySchema = z
  .object({ range: LearningTimeRangeSchema })
  .strict();

export type ActivityEventBody = z.infer<typeof ActivityEventReportSchema>;
export type LearningTimeQuery = z.infer<typeof LearningTimeQuerySchema>;
